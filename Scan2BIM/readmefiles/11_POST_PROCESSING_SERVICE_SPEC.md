# 11 — Post-Processing Service Implementation Specification

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 10_SEGMENTATION_SERVICE_SPEC.md

---

## 1. Service Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-post-processing-service` |
| Role | Geometry Extraction + IFC Creation |
| Health Port | 4000 |
| Language | Python 3.12+ |
| GPU | Not required |
| Execution | Long-running queue consumer |
| Memory | 8–24 GB (heavy point cloud processing) |

---

## 2. Processing Pipeline

```
INPUT: Queue message with paths to segmented PLY files + wall JSON

┌──────────────────────────────────────────────────────────────────┐
│ Step 1: DOWNLOAD SEGMENTED DATA                                   │
│ • Download pass-1 PLY from blob                                  │
│ • Download pass-2 PLY from blob                                  │
│ • Download wall_geometry.json from blob                          │
│ • Download extracted images from blob                            │
│ • Duration: 10-30s                                               │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────┴───────────────────────────────┐
│ Step 2: COMPONENT EXTRACTION (sequential)                         │
│                                                                  │
│ For each component type:                                         │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2a. WALL Detection                                       │    │
│   │ • Algorithm: RANSAC plane fitting                        │    │
│   │ • Input: wall-class points from segmented PLY            │    │
│   │ • Output: wall planes with position, dimensions, normal  │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2b. DOOR Detection                                       │    │
│   │ • Algorithm: wall-plane intersection + gap analysis      │    │
│   │ • Input: door-class points + wall planes                 │    │
│   │ • Output: door position, dimensions, parent wall         │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2c. RACK Detection                                       │    │
│   │ • Algorithm: Oriented Bounding Box (OBB) fitting         │    │
│   │ • Input: rack-class points                               │    │
│   │ • Output: position, dimensions, rotation                 │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2d. CABINET Detection                                    │    │
│   │ • Algorithm: clustering + dimension estimation           │    │
│   │ • Input: cabinet-class points                            │    │
│   │ • Output: position, dimensions                           │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2e. BATTERY CABINET Detection                            │    │
│   │ • Algorithm: enclosure detection                         │    │
│   │ • Input: battery-cabinet-class points                    │    │
│   │ • Output: position, dimensions, contained items          │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2f. BATTERY Detection                                    │    │
│   │ • Algorithm: unit detection within cabinet bounds        │    │
│   │ • Input: battery-class points                            │    │
│   │ • Output: position, dimensions per unit                  │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2g. RECTIFIER Detection                                  │    │
│   │ • Algorithm: component identification                    │    │
│   │ • Input: rectifier-class points                          │    │
│   │ • Output: position, dimensions                           │    │
│   └─────────────────────────────────────────────────────────┘    │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │ 2h. FLOOR / CEILING Detection                            │    │
│   │ • Algorithm: horizontal plane extraction                 │    │
│   │ • Input: floor/ceiling-class points                      │    │
│   │ • Output: elevation, boundary polygon                    │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│ Duration: 10-30 minutes total                                    │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────┴───────────────────────────────┐
│ Step 3: CONFLICT RESOLUTION                                       │
│ • Resolve overlapping components                                 │
│ • Prioritize by confidence score                                 │
│ • Remove impossible configurations                               │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────┴───────────────────────────────┐
│ Step 4: GENERATE GEOMETRY JSON                                    │
│ • Combine all component geometries                               │
│ • Write geometry.json                                            │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────┴───────────────────────────────┐
│ Step 5: IFC CREATION (subprocess)                                 │
│ • Call: dotnet IFCCreator.dll --input geometry.json --output .ifc│
│ • Duration: 2-5 minutes                                          │
│ • Validate output IFC file exists and is non-empty               │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────┴───────────────────────────────┐
│ Step 6: UPLOAD & DELIVER                                          │
│ • Upload IFC to delivery destination (DataRepo via SAS URL)      │
│ • Upload IFC backup to blob storage                              │
│ • Upload geometry.json to blob storage                           │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────┴───────────────────────────────┐
│ Step 7: SIGNAL COMPLETION                                         │
│ • HTTP POST → Root Service /api/signal/activity                  │
│   {activityName: "POST_PROCESSING", status: "COMPLETED"}         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Geometry JSON Output Format

```python
class GeometryOutput(BaseModel):
    """Complete geometry extraction output format."""
    version: str = "1.0"
    workflow_id: str
    generated_at: str  # ISO timestamp
    site_info: dict
    
    components: list[ComponentGeometry]
    summary: ComponentSummary

class ComponentGeometry(BaseModel):
    """Single component's geometric definition."""
    component_type: str       # "wall", "door", "rack", etc.
    component_id: str         # Unique within this output
    
    # Position (center point in global coordinates)
    position: Position3D
    
    # Dimensions
    dimensions: Dimensions3D
    
    # Rotation (Euler angles in degrees)
    rotation: Rotation3D = Rotation3D()
    
    # Component-specific metadata
    metadata: dict = {}
    
    # Relationships
    parent_id: str | None = None  # e.g., door belongs to wall
    contained_ids: list[str] = []  # e.g., cabinet contains batteries
    
    # Confidence
    confidence: float = 0.0
    point_count: int = 0

class Position3D(BaseModel):
    x: float
    y: float
    z: float

class Dimensions3D(BaseModel):
    width: float   # X-axis extent
    height: float  # Z-axis extent
    depth: float   # Y-axis extent

class Rotation3D(BaseModel):
    rx: float = 0.0
    ry: float = 0.0
    rz: float = 0.0

class ComponentSummary(BaseModel):
    total_components: int
    by_type: dict[str, int]  # {"wall": 4, "door": 2, ...}
```

**Example geometry.json:**

```json
{
    "version": "1.0",
    "workflow_id": "scan2bim-abc123",
    "generated_at": "2026-08-12T10:30:00Z",
    "site_info": {"customer_id": "C001", "site_id": "S001"},
    "components": [
        {
            "component_type": "wall",
            "component_id": "wall-001",
            "position": {"x": 0.0, "y": 2.5, "z": 1.5},
            "dimensions": {"width": 5.0, "height": 3.0, "depth": 0.2},
            "rotation": {"rx": 0, "ry": 0, "rz": 0},
            "metadata": {"normal": [0, 1, 0], "plane_equation": [0, 1, 0, -2.5]},
            "confidence": 0.95,
            "point_count": 45000
        },
        {
            "component_type": "door",
            "component_id": "door-001",
            "position": {"x": 1.2, "y": 2.5, "z": 1.0},
            "dimensions": {"width": 0.9, "height": 2.1, "depth": 0.1},
            "rotation": {"rx": 0, "ry": 0, "rz": 0},
            "parent_id": "wall-001",
            "confidence": 0.87,
            "point_count": 3200
        },
        {
            "component_type": "rack",
            "component_id": "rack-001",
            "position": {"x": 3.5, "y": 1.0, "z": 1.0},
            "dimensions": {"width": 0.6, "height": 2.0, "depth": 0.8},
            "rotation": {"rx": 0, "ry": 0, "rz": 15.2},
            "metadata": {"rack_type": "equipment", "obb_fit_error": 0.02},
            "confidence": 0.91,
            "point_count": 28000
        }
    ],
    "summary": {
        "total_components": 3,
        "by_type": {"wall": 1, "door": 1, "rack": 1}
    }
}
```

---

## 4. Component Extractor Interface

```python
"""app/components/base.py"""
from abc import ABC, abstractmethod
import numpy as np


class ComponentExtractor(ABC):
    """Base class for all component geometry extractors."""
    
    @property
    @abstractmethod
    def component_type(self) -> str:
        """Return the component type string."""
        ...
    
    @abstractmethod
    def extract(
        self,
        points: np.ndarray,
        labels: np.ndarray,
        wall_geometry: dict | None = None,
        **kwargs,
    ) -> list[ComponentGeometry]:
        """
        Extract component instances from segmented point cloud.
        
        Args:
            points: Nx3 numpy array of XYZ coordinates
            labels: N-length array of class labels
            wall_geometry: Wall extraction result (for context)
        
        Returns:
            List of detected component geometries
        """
        ...
    
    def _filter_points_by_class(
        self, points: np.ndarray, labels: np.ndarray, target_class: int
    ) -> np.ndarray:
        """Get points belonging to a specific class."""
        mask = labels == target_class
        return points[mask]
```

---

## 5. IFC Creation Subprocess

```python
"""app/ifc_service/ifc_creator.py"""
import subprocess
import structlog
from pathlib import Path

logger = structlog.get_logger()

IFC_CREATOR_PATH = "/app/ifc-creator/IFCCreator.dll"
IFC_TIMEOUT_SECONDS = 300  # 5 minutes


async def create_ifc(
    geometry_json_path: str,
    output_ifc_path: str,
    ifc_version: str = "IFC4",
) -> dict:
    """
    Create IFC file from geometry JSON using .NET xBIM subprocess.
    
    Args:
        geometry_json_path: Path to input geometry.json
        output_ifc_path: Path for output .ifc file
        ifc_version: IFC schema version
    
    Returns:
        {"success": bool, "file_size": int, "duration_seconds": float}
    """
    import time
    start = time.time()
    
    cmd = [
        "dotnet", IFC_CREATOR_PATH,
        "--input", geometry_json_path,
        "--output", output_ifc_path,
        "--version", ifc_version,
    ]
    
    logger.info("ifc_creation_start", input=geometry_json_path)
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=IFC_TIMEOUT_SECONDS,
        )
        
        duration = time.time() - start
        
        if result.returncode != 0:
            logger.error(
                "ifc_creation_failed",
                returncode=result.returncode,
                stderr=result.stderr,
            )
            raise IFCCreationError(
                f"IFC creation failed: {result.stderr}"
            )
        
        # Validate output exists
        output_path = Path(output_ifc_path)
        if not output_path.exists() or output_path.stat().st_size == 0:
            raise IFCCreationError("IFC output file is empty or missing")
        
        file_size = output_path.stat().st_size
        logger.info(
            "ifc_creation_completed",
            file_size=file_size,
            duration=duration,
        )
        
        return {
            "success": True,
            "file_size": file_size,
            "duration_seconds": duration,
            "output_path": output_ifc_path,
        }
        
    except subprocess.TimeoutExpired:
        logger.error("ifc_creation_timeout", timeout=IFC_TIMEOUT_SECONDS)
        raise IFCCreationError(
            f"IFC creation timed out after {IFC_TIMEOUT_SECONDS}s"
        )
```

---

## 6. Delivery (DataRepo Upload)

```python
"""app/service/delivery_service.py"""
import httpx
import structlog
from app.infrastructure.external.cognito_client import CognitoClient

logger = structlog.get_logger()


class DeliveryService:
    """Upload IFC to DataRepo for end-user access."""
    
    def __init__(self, datarepo_url: str, cognito_client: CognitoClient):
        self.datarepo_url = datarepo_url
        self.cognito = cognito_client
    
    async def deliver_ifc(
        self,
        ifc_file_path: str,
        customer_id: str,
        site_id: str,
        file_id: str,
    ) -> dict:
        """
        Upload IFC to DataRepo.
        
        Steps:
        1. Get Cognito M2M token
        2. Request upload SAS URL from DataRepo
        3. Upload IFC file via SAS URL
        4. Confirm upload to DataRepo
        """
        # 1. Auth
        token = await self.cognito.get_token()
        
        # 2. Get upload URL
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.datarepo_url}/api/files/upload-url",
                json={
                    "customerId": customer_id,
                    "siteId": site_id,
                    "fileId": file_id,
                    "fileType": "ifc",
                    "fileName": f"{site_id}_model.ifc",
                },
                headers=headers,
            )
            resp.raise_for_status()
            upload_info = resp.json()
        
        # 3. Upload via SAS
        sas_url = upload_info["sasUrl"]
        with open(ifc_file_path, "rb") as f:
            ifc_data = f.read()
        
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                sas_url,
                content=ifc_data,
                headers={"x-ms-blob-type": "BlockBlob"},
            )
            resp.raise_for_status()
        
        logger.info("ifc_delivered", file_id=file_id, size=len(ifc_data))
        return {"delivered": True, "url": upload_info.get("downloadUrl", "")}
```

---

## 7. Environment Variables

```env
# Queue
SERVICEBUS_MODE=azure-identity
SERVICE_BUS_FQDN=esdt-test-eus-namespace.servicebus.windows.net
QUEUE_INBOUND_NAME=esdt-s2b-post-processing-queue
ROOT_QUEUE_NAME=esdt-s2b-root-queue
AZURE_CLIENT_ID=<managed-identity>

# Blob Storage
AZURE_STORAGE_ACCOUNT_URL=https://xxx.blob.core.windows.net
BLOB_CONTAINER=segmentation-store

# Root Service
ROOT_SERVICE_URL=http://scan2bim-root-service:3000

# IFC Creator
IFC_CREATOR_PATH=/app/ifc-creator/IFCCreator.dll

# DataRepo (delivery)
DATAREPO_URL=https://datarepo.example.com
COGNITO_TOKEN_URL=https://xxx.auth.region.amazoncognito.com/oauth2/token
COGNITO_CLIENT_ID=<client-id>
COGNITO_CLIENT_SECRET=<client-secret>
COGNITO_SCOPE=datarepo/write

# Health
HEALTH_SERVER_PORT=4000
ENV=production
```
