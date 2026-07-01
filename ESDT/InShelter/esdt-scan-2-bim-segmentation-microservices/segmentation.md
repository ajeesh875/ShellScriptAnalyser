IFC Segmentation

 

# Inshelter Segmentation Microservice — Architecture & Function Flow

 

## Position in Pipeline

 

```

  ┌────────────────────┐          ┌─────────────────────────┐          ┌──────────────────┐

  │  Root Microservice │──queue──▶│  SEGMENTATION MS        │──queue──▶│ Post-Processing  │

  │  (Orchestrator)    │◀─signal──│  ◀── YOU ARE HERE       │──signal─▶│ MS               │

  └────────────────────┘          └─────────────────────────┘          └──────────────────┘

```

 

**Upstream:** Root MS dispatches to `esdt-s2b-segmentation-queue`

**Downstream:** Post-Processing MS (direct queue dispatch) + Root MS (HTTP signal)

 

---

 

## Overview

 

The Segmentation Microservice runs GPU-accelerated ML inference on E57 point clouds. It uses a unique **2-pass architecture**: first a coarse pass on the full scan, then a refined pass using wall-bounded cropping with rotation correction.

 

| Property | Value |

|----------|-------|

| Language | Python |

| Port | 5000 (health check) |

| Mode | Job mode (processes one message, exits) |

| ML Framework | Pointcept (PyTorch, GPU) |

| Scaling | KEDA 0→2 replicas (queue depth) |

| GPU | NVIDIA xlarge (200Gi memory limit) |

 

---

 

## Module Structure

 

```

app/

├── main.py                    # Entry: starts QueueConsumer in job mode

├── queue/

│   ├── message_consumer.py    # Service Bus consumer + orchestration

│   └── message_producer.py    # Sends to post-processing queue + root queue

├── service/

│   ├── segmentation_service.py  # Wraps SegmentationPipelineMP

│   └── wall_extraction_service.py # Wall plane detection

├── segmentation_pipeline_mp.py  # 2-pass pipeline (crop + infer + wall + refine)

├── cropping_algo.py           # XY crop, histogram-based, bbox+rotation crop

├── inference_ppt.py           # Pointcept model inference

├── image_extractor.py         # E57 image extraction (parallel)

├── config/config_reader.py    # Config class (env vars)

├── database/jobs_repo.py      # MongoDB job tracking

├── schemas/message_schema.py  # Pydantic: QueueMessageDto, SegmentationMessage

├── temporal/client.py         # Temporal progress/completion signals

├── helper/

│   ├── blob_helper.py         # Azure Blob download/upload

│   ├── cognito_helper.py      # Cognito token manager

│   └── logging_helper.py      # Structured logging

├── monitor/                   # GPU/memory monitoring

└── wall/                      # Wall geometry utilities

```

 

---

 

## Function Flow

 

### Message Consumption

 

```python

# main.py — Job mode (processes queue, exits when empty)

async def main():

    consumer = QueueConsumer()

    await consumer.start_job()  # Process messages until queue empty, then exit

 

# queue/message_consumer.py

class QueueConsumer:

    async def process_message(self, msg_body: str):

        # 1. HTML unescape + double-JSON decode

        # 2. Parse outer: QueueMessageDto (id, workflowId, type, payload_str)

        # 3. Parse inner: SegmentationMessage (traceId, workflowId, taskId, payload)

        # 4. Deduplication check via MongoDB

        # 5. Download E57 from SAS URL (payload.fileUrl)

        # 6. Run segmentation pipeline

        # 7. Upload results to Blob Storage

        # 8. Signal Root MS: HTTP POST /api/signal/activity

        # 9. Dispatch to post-processing queue

```

 

### 2-Pass Segmentation Pipeline

 

```python

# segmentation_pipeline_mp.py

class SegmentationPipelineMP:

    def process_e57(self, e57_file_path: str) -> dict:

        """

        PASS 1 — Coarse (Full Scan):

        ├── Start image extraction (parallel multiprocessing.Process)

        ├── XY Crop: xy_crop() — histogram-based noise removal

        └── ML Inference: inference_single_file() — Pointcept GPU

            Classes: wall, door, rack, cabinet, battery, rectifier, floor, ceiling

 

        WALL EXTRACTION (inline):

        ├── WallExtractionService.run()

        ├── Detect wall planes from Pass-1 inference

        ├── Compute: bbox2d, elevations [z_min, z_max], rotation info

        └── Output: {walls_json, bbox2d, elevations, rotation}

 

        PASS 2 — Refined (Wall-Bounded):

        ├── Crop using wall bbox (with rotation if is_rotated=1)

        │   ├── If rotated: rotate to axis-aligned → crop → infer → inverse-rotate

        │   └── If not rotated: direct bbox crop → infer

        └── Output: refined segmented PLY (higher precision within shelter bounds)

 

        Returns: {

            cropped_ply, inference_results, images,

            wall_json, wall_bbox2d, wall_bbox3d,

            cropped_ply_pass2, inference_results_pass2

        }

        """

```

 

### Detailed Processing Steps

 

```

E57 File (downloaded)

    │

    ├──[Parallel]── Image Extraction (extract_images → images/*.jpg)

    │

    ├──[Pass 1]──── XY Crop (xy_crop)

    │               • Read E57 point cloud

    │               • Histogram-based X/Y noise filtering

    │               • Output: cropped/{filename}.ply

    │

    ├──[Pass 1]──── ML Inference (inference_single_file)

    │               • Device: CUDA (GPU)

    │               • Method: block_stream (block_size=10.0)

    │               • Accumulator: memmap (handles large files)

    │               • Output: inference/*.ply (per-class segmented)

    │

    ├──[Inline]──── Wall Extraction (WallExtractionService.run)

    │               • Input: inference_dir

    │               • Detects wall planes

    │               • Computes: bbox2d, elevations, rotation matrix

    │               • If no walls → raise NoWallsDetectedException

    │

    ├──[Pass 2]──── Refined Crop (crop_ply_by_bbox_and_rotation)

    │               • Uses wall bbox2d + elevations

    │               • Margin: XY=0.2m, Z=0.0m

    │               • If rotated: applies rotation matrix first

    │               • Output: cropped_pass2/{filename}.ply

    │

    └──[Pass 2]──── ML Inference (inference_single_file)

                    • Same model, tighter input bounds

                    • If rotated: applies inverse rotation to output

                    • Output: inference_pass2/*.ply (refined classes)

```

 

### Upload & Signaling

 

```python

# After pipeline completion:

# 1. Upload all outputs to Azure Blob Storage:

#    {fileId}/inference/*.ply        (Pass-1 results)

#    {fileId}/inference_pass2/*.ply  (Pass-2 results)

#    {fileId}/images/*               (Extracted images)

#    {fileId}/postproc/walls.json    (Wall geometry)

 

# 2. Signal Root MS (HTTP):

POST http://esdt-scan-2-bim-root-microservice.esdt-s2b.svc.cluster.local:3000/api/signal/activity

{

  "workflowId": "scan2bim-abc123",

  "activityName": "SEGMENTATION",

  "status": "COMPLETED",

  "output": { "segmentedFileUrl": "...", "pointCount": 1500000 }

}

 

# 3. Dispatch to Post-Processing Queue (direct):

→ esdt-s2b-post-processing-queue

{

  "traceId": "...", "workflowId": "...", "taskId": "...",

  "payload": {

    "customerId", "siteId", "projectId", "fileId",

    "segmentedFiles": ["inference/walls.ply", "inference/racks.ply", ...],

    "imageFiles": ["images/img001.jpg", ...],

    "metadata": {...}

  }

}

```

 

---

 

## ML Model Configuration

 

```python

# Config (from environment variables)

MODEL_CONFIG_FILE = "/models/config.yaml"       # Pointcept model architecture

MODEL_CHECKPOINT_PATH = "/models/checkpoint.pth" # Trained weights

INFERENCE_DEVICE = "cuda"                        # GPU required

INFERENCE_METHOD = "block_stream"                # Memory-efficient streaming

INFERENCE_BLOCK_SIZE = 10.0                      # Meters per block

INFERENCE_GRID_SIZE = None                       # Auto

INFERENCE_ACCUMULATOR = "memmap"                 # Disk-backed for large files

INFERENCE_ACC_DTYPE = "float16"                  # Half precision

```

 

---

 

## Error Handling

 

| Scenario | Action |

|----------|--------|

| No walls detected | `NoWallsDetectedException` → Pass-2 skipped, only Pass-1 results sent |

| GPU OOM | Retryable → message abandoned for Service Bus retry |

| Download fails | Retryable with exponential backoff |

| Non-retryable error | Signal FAILED to Root + request workflow cancel |

 

---

 

## Connection to Previous Service (Root MS)

 

Root MS sends segmentation task via `esdt-s2b-segmentation-queue` with SAS URL + metadata.

 

## Connection to Next Service (Post-Processing MS)

 

Segmentation directly dispatches to `esdt-s2b-post-processing-queue` after uploading results. The message includes `segmentedFiles[]` (blob paths) and `imageFiles[]` for the Post-Processing MS to download and process.

 