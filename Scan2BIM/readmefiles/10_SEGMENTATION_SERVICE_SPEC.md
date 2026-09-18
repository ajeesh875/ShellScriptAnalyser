# 10 — Segmentation Service Implementation Specification

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 09_ROOT_SERVICE_SPEC.md

---

## 1. Service Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-segmentation-service` |
| Role | ML Inference + Wall Extraction |
| Health Port | 5000 |
| Language | Python 3.12+ |
| GPU | NVIDIA (CUDA required) |
| ML Framework | Pointcept |
| Execution | Queue consumer (KEDA job, run-to-completion) |

---

## 2. Processing Pipeline (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│                 SEGMENTATION PIPELINE                             │
│                                                                 │
│  INPUT: Queue message with file_url (SAS URL or local path)     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Step 1: DOWNLOAD E57                                       │  │
│  │ • Download from blob via SAS URL                           │  │
│  │ • Store locally in /tmp/workdir/{workflow_id}/             │  │
│  │ • Duration: 20-40s for 2 GB                                │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │ Step 2: IMAGE EXTRACTION (parallel process)                │  │
│  │ • Extract 2D images from E57 panorama data                │  │
│  │ • Runs in multiprocessing.Process (non-blocking)           │  │
│  │ • Output: /tmp/workdir/{wf_id}/images/*.png               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Step 3: XY CROP (Pass-1 preprocessing)                     │  │
│  │ • Histogram-based noise removal in XY plane               │  │
│  │ • Remove scanner artifacts and outliers                    │  │
│  │ • Output: cropped PLY file                                │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │ Step 4: PASS-1 ML INFERENCE (coarse)                       │  │
│  │ • Model: Pointcept semantic segmentation                   │  │
│  │ • Method: block_stream (block_size=10.0)                   │  │
│  │ • Device: CUDA (GPU)                                       │  │
│  │ • Classes: wall, door, rack, cabinet, battery, etc.        │  │
│  │ • Duration: 5-15 minutes                                   │  │
│  │ • Output: /tmp/workdir/{wf_id}/inference/output.ply       │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │ Step 5: WALL EXTRACTION                                    │  │
│  │ • Detect wall planes from pass-1 inference output          │  │
│  │ • Compute 2D bounding box (bbox2d)                        │  │
│  │ • Detect rotation (axis-aligned vs rotated shelter)        │  │
│  │ • Compute floor/ceiling elevations                         │  │
│  │ • Output: wall_geometry.json                              │  │
│  │                                                           │  │
│  │ Returns:                                                   │  │
│  │   walls_json: path to JSON                                │  │
│  │   bbox2d: {x_min, x_max, y_min, y_max}                  │  │
│  │   elevations: [z_min, z_max]                             │  │
│  │   rotation: {is_rotated, matrix, center, inverse}        │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│         ┌────────────────────┴────────────────────┐             │
│         │                                         │             │
│    is_rotated=true                        is_rotated=false      │
│         │                                         │             │
│  ┌──────┴──────────┐                  ┌──────────┴────────┐    │
│  │ Rotate to axis  │                  │ Direct bbox crop  │    │
│  │ aligned frame   │                  │ (no rotation)     │    │
│  │ Crop by bbox    │                  └──────────┬────────┘    │
│  └──────┬──────────┘                             │             │
│         │                                         │             │
│         └────────────────────┬────────────────────┘             │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │ Step 6: PASS-2 ML INFERENCE (refined)                      │  │
│  │ • Tighter bounds from wall bbox → higher precision         │  │
│  │ • Device: CUDA (GPU)                                       │  │
│  │ • Duration: 3-10 minutes                                   │  │
│  │ • IF was rotated: apply inverse rotation to results        │  │
│  │ • Output: /tmp/workdir/{wf_id}/inference_pass2/output.ply │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │ Step 7: UPLOAD RESULTS                                     │  │
│  │ • Upload pass-1 PLY → blob                                │  │
│  │ • Upload pass-2 PLY → blob                                │  │
│  │ • Upload wall_geometry.json → blob                        │  │
│  │ • Upload images/ → blob                                   │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │ Step 8: SIGNAL COMPLETION                                  │  │
│  │ • HTTP POST → Root Service /api/signal/activity            │  │
│  │ • Queue → post-processing-queue (direct dispatch)          │  │
│  │ • Queue → root-queue (SEGMENTATION_COMPLETE status)        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  OUTPUT: Segmented PLY files + Wall JSON + Images in blob       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Classes

### SegmentationPipeline

```python
"""app/service/segmentation_pipeline.py"""
import structlog
from app.application.ports.storage_port import StoragePort
from app.application.ports.queue_port import QueuePort
from app.domain.entities import SegmentationResult, WallGeometry

logger = structlog.get_logger()


class SegmentationPipeline:
    """Orchestrates the 2-pass segmentation process."""
    
    def __init__(
        self,
        storage: StoragePort,
        queue: QueuePort,
        model_config: dict,
        root_service_url: str,
    ):
        self.storage = storage
        self.queue = queue
        self.model_config = model_config
        self.root_service_url = root_service_url
    
    async def process(self, message: dict) -> SegmentationResult:
        """Execute full segmentation pipeline."""
        workflow_id = message["workflowId"]
        payload = message["payload"]
        work_dir = f"/tmp/workdir/{workflow_id}"
        
        try:
            # Step 1: Download E57
            logger.info("downloading_e57", workflow_id=workflow_id)
            e57_path = await self._download_file(payload["fileUrl"], work_dir)
            
            # Step 2: Start image extraction (parallel)
            image_process = self._start_image_extraction(e57_path, work_dir)
            
            # Step 3: XY Crop
            logger.info("xy_cropping", workflow_id=workflow_id)
            cropped_path = self._xy_crop(e57_path, work_dir)
            
            # Step 4: Pass-1 Inference
            logger.info("pass1_inference_start", workflow_id=workflow_id)
            pass1_output = self._run_inference(
                cropped_path, f"{work_dir}/inference"
            )
            
            # Step 5: Wall Extraction
            logger.info("wall_extraction", workflow_id=workflow_id)
            wall_result = self._extract_walls(
                f"{work_dir}/inference", f"{work_dir}/walls"
            )
            
            # Step 6: Pass-2 (wall-bounded)
            logger.info("pass2_inference_start", workflow_id=workflow_id)
            pass2_cropped = self._crop_for_pass2(
                cropped_path, wall_result, work_dir
            )
            
            r_inv = None
            center = None
            if wall_result.rotation.is_rotated:
                r_inv = wall_result.rotation.inverse_rotation_matrix
                center = wall_result.rotation.center_point
            
            pass2_output = self._run_inference(
                pass2_cropped, f"{work_dir}/inference_pass2",
                R_inv=r_inv, center=center
            )
            
            # Wait for image extraction
            image_process.join(timeout=120)
            
            # Step 7: Upload results
            logger.info("uploading_results", workflow_id=workflow_id)
            blob_paths = await self._upload_results(
                workflow_id, payload, work_dir
            )
            
            # Step 8: Signal completion
            await self._signal_completion(workflow_id, payload, blob_paths)
            
            logger.info("segmentation_completed", workflow_id=workflow_id)
            return SegmentationResult(workflow_id=workflow_id, status="COMPLETED")
            
        except Exception as e:
            logger.error("segmentation_failed", workflow_id=workflow_id, error=str(e))
            await self._signal_failure(workflow_id, str(e))
            raise
        finally:
            self._cleanup_workdir(work_dir)
```

### WallExtractionService

```python
"""app/wall/wall_extraction_service.py"""

class WallExtractionService:
    """Detects wall planes from inference output."""
    
    def run(
        self,
        inference_dir: str,
        output_dir: str,
        floor_ceiling_thickness: float = 0.3,
    ) -> WallGeometry:
        """
        Extract wall geometry from segmented point cloud.
        
        Algorithm:
        1. Load segmented PLY (wall class only)
        2. RANSAC plane fitting for dominant vertical planes
        3. Cluster planes by normal direction
        4. Compute axis-aligned bounding box
        5. Detect if shelter is rotated (non-axis-aligned walls)
        6. Compute rotation matrix if needed
        7. Extract floor/ceiling elevations
        
        Returns:
            WallGeometry with bbox2d, elevations, rotation info
        """
        # Load wall points from inference output
        wall_points = self._load_wall_class_points(inference_dir)
        
        if len(wall_points) < 100:
            raise NoWallsDetectedException(
                f"Only {len(wall_points)} wall points found"
            )
        
        # Fit planes
        planes = self._fit_wall_planes(wall_points)
        
        # Compute bounding box
        bbox2d = self._compute_bbox2d(planes)
        
        # Detect rotation
        rotation = self._detect_rotation(planes)
        
        # Compute elevations
        elevations = self._compute_elevations(wall_points, floor_ceiling_thickness)
        
        # Save walls JSON
        walls_json_path = self._save_walls_json(
            planes, bbox2d, rotation, elevations, output_dir
        )
        
        return WallGeometry(
            walls_json_path=walls_json_path,
            bbox2d=bbox2d,
            elevations=elevations,
            rotation=rotation,
            wall_count=len(planes),
        )
```

---

## 4. ML Model Configuration

```yaml
# configs/inshelter_model.yaml
model:
  name: "pointcept-inshelter-v3"
  framework: "pointcept"
  checkpoint: "/models/checkpoint.pth"
  
inference:
  device: "cuda"
  method: "block_stream"
  block_size: 10.0
  batch_size: 1
  num_workers: 4
  
classes:
  0: "wall"
  1: "door"
  2: "floor"
  3: "ceiling"
  4: "rack"
  5: "cabinet"
  6: "battery_cabinet"
  7: "battery"
  8: "rectifier"
  9: "other"
  
preprocessing:
  voxel_size: 0.02
  normalize: true
  
wall_extraction:
  min_wall_points: 100
  ransac_threshold: 0.05
  min_wall_area: 1.0
  floor_ceiling_thickness: 0.3
```

---

## 5. Error Handling

| Error | Retryable | Action |
|-------|-----------|--------|
| File download timeout | Yes | Retry 3× with backoff |
| CUDA OOM | Yes (with smaller batch) | Reduce batch size, retry |
| No walls detected | No | Skip pass-2, continue with pass-1 only |
| Model loading failure | No | Signal FAILED, alert operator |
| Blob upload failure | Yes | Retry 3× |
| Root Service unreachable | Yes | Retry signal with backoff |

---

## 6. Resource Management

```python
# GPU memory management
import torch

def _run_inference(self, input_path, output_dir, **kwargs):
    """Run inference with GPU memory management."""
    try:
        # Clear GPU cache before inference
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        # Run Pointcept inference
        result = run_pointcept_inference(
            input_path=input_path,
            output_dir=output_dir,
            config=self.model_config,
            **kwargs,
        )
        return result
    finally:
        # Clear GPU cache after inference
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
```

---

## 7. Environment Variables

```env
# Service Bus
SERVICEBUS_MODE=azure-identity  # or "emulator" or "memory"
SERVICE_BUS_FQDN=esdt-test-eus-namespace.servicebus.windows.net
SEGMENTATION_QUEUE=esdt-s2b-segmentation-queue
AZURE_CLIENT_ID=<managed-identity-client-id>

# ML Model
MODEL_CONFIG_FILE=/models/config.yaml
MODEL_CHECKPOINT_PATH=/models/checkpoint.pth
INFERENCE_DEVICE=cuda
INFERENCE_METHOD=block_stream
INFERENCE_BLOCK_SIZE=10.0

# Root Service
ROOT_SERVICE_URL=http://scan2bim-root-service:3000

# Blob Storage
AZURE_STORAGE_ACCOUNT_URL=https://xxx.blob.core.windows.net
BLOB_CONTAINER=segmentation-store

# Health
HEALTH_SERVER_PORT=5000
```

---

## 8. Dockerfile (GPU)

```dockerfile
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Install Python 3.12
RUN apt-get update && apt-get install -y \
    python3.12 python3.12-pip python3.12-dev \
    libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip3.12 install --no-cache-dir -r requirements.txt

# Copy model (or mount as volume)
COPY models/ /models/

# Copy application
COPY app/ ./app/
COPY pointcept/ ./pointcept/
COPY configs/ ./configs/

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["python3.12", "-m", "app.main"]
```
