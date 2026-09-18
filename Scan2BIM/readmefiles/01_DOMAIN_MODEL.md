# 01 — Domain Model: Entities, Aggregates & Events

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 00_FOUNDATION.md

---

## 1. Domain Overview

```
Project → Site → IngestionRequest → PointCloudFile → Workflow
                                                        ├── SegmentationResult
                                                        ├── GeometryModel
                                                        ├── IFCModel
                                                        └── Artifact[]
```

---

## 2. Core Entities

### 2.1 Project

```python
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum

class ProjectStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    SUSPENDED = "suspended"

class Project(BaseModel):
    """Business engagement or customer initiative."""
    project_id: UUID = Field(default_factory=uuid4)
    project_name: str
    customer_name: str
    description: str = ""
    status: ProjectStatus = ProjectStatus.ACTIVE
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

### 2.2 Site

```python
class SiteType(str, Enum):
    TELECOM_SHELTER = "telecom_shelter"
    EQUIPMENT_ROOM = "equipment_room"
    DATA_CENTER = "data_center"
    UTILITY_FACILITY = "utility_facility"
    OTHER = "other"

class Site(BaseModel):
    """Physical location being scanned and modeled."""
    site_id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    site_name: str
    site_type: SiteType
    location: str = ""
    latitude: float | None = None
    longitude: float | None = None
    elevation: float = 0.0
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### 2.3 IngestionRequest

```python
class IngestionSource(str, Enum):
    UPLOAD_PORTAL = "upload_portal"
    EXTERNAL_PORTAL = "external_portal"
    REST_API = "rest_api"
    WEBHOOK = "webhook"
    BULK_UPLOAD = "bulk_upload"

class IngestionStatus(str, Enum):
    RECEIVED = "received"
    VALIDATING = "validating"
    VALIDATED = "validated"
    FAILED = "failed"
    REGISTERED = "registered"

class IngestionRequest(BaseModel):
    """Request to onboard scan data into the platform."""
    ingestion_request_id: UUID = Field(default_factory=uuid4)
    site_id: UUID
    source_type: IngestionSource
    requester: str = ""
    request_timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: IngestionStatus = IngestionStatus.RECEIVED
    correlation_id: str = ""
    metadata: dict = Field(default_factory=dict)
```

### 2.4 PointCloudFile

```python
class PointCloudFormat(str, Enum):
    E57 = "e57"
    PLY = "ply"
    PCD = "pcd"
    XYZ = "xyz"
    NPY = "npy"

class PointCloudFile(BaseModel):
    """Uploaded scan content."""
    file_id: UUID = Field(default_factory=uuid4)
    ingestion_request_id: UUID
    file_name: str
    file_format: PointCloudFormat
    file_size_bytes: int
    storage_path: str
    checksum: str = ""
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
```

### 2.5 Workflow

```python
class WorkflowStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SEGMENTATION_IN_PROGRESS = "segmentation_in_progress"
    SEGMENTATION_COMPLETED = "segmentation_completed"
    POST_PROCESSING_IN_PROGRESS = "post_processing_in_progress"
    POST_PROCESSING_COMPLETED = "post_processing_completed"
    IFC_GENERATION_IN_PROGRESS = "ifc_generation_in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"

class WorkflowType(str, Enum):
    INSHELTER_SINGLE_SCAN = "inshelter_single_scan"
    INSHELTER_MULTI_SCAN = "inshelter_multi_scan"

class Workflow(BaseModel):
    """Lifecycle of a Scan2BIM processing execution."""
    workflow_id: str  # Format: "scan2bim-{uuid}"
    workflow_type: WorkflowType = WorkflowType.INSHELTER_SINGLE_SCAN
    ingestion_request_id: UUID
    file_id: UUID
    customer_id: str
    site_id: str
    status: WorkflowStatus = WorkflowStatus.PENDING
    current_activity: str = ""
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    error: str | None = None
    retry_count: int = 0
    metadata: dict = Field(default_factory=dict)
```

### 2.6 Activity

```python
class ActivityName(str, Enum):
    GENERATE_FILE_URL = "generate_file_url"
    SEGMENTATION = "segmentation"
    POST_PROCESSING = "post_processing"
    IFC_CREATION = "ifc_creation"

class ActivityStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMED_OUT = "timed_out"

class Activity(BaseModel):
    """Individual step within a workflow."""
    activity_id: UUID = Field(default_factory=uuid4)
    workflow_id: str
    activity_name: ActivityName
    status: ActivityStatus = ActivityStatus.PENDING
    input_data: dict = Field(default_factory=dict)
    output_data: dict = Field(default_factory=dict)
    error: str | None = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    retry_count: int = 0
    duration_seconds: float | None = None
```

---

## 3. Processing Domain Entities

### 3.1 SegmentationResult

```python
class SegmentationPass(str, Enum):
    PASS_1_COARSE = "pass_1_coarse"
    PASS_2_REFINED = "pass_2_refined"

class SegmentationResult(BaseModel):
    """Semantic classification from ML inference."""
    segmentation_result_id: UUID = Field(default_factory=uuid4)
    workflow_id: str
    segmentation_pass: SegmentationPass
    model_version: str
    classes_detected: list[str]  # ["wall", "door", "rack", ...]
    point_count: int
    confidence_metrics: dict = Field(default_factory=dict)
    output_path: str  # Path to segmented PLY
    generated_at: datetime = Field(default_factory=datetime.utcnow)
```

### 3.2 WallGeometry

```python
class WallRotation(BaseModel):
    """Rotation metadata from wall extraction."""
    is_rotated: bool = False
    rotation_matrix: list[list[float]] = Field(default_factory=list)
    center_point: list[float] = Field(default_factory=list)
    inverse_rotation_matrix: list[list[float]] = Field(default_factory=list)

class WallBoundingBox2D(BaseModel):
    """2D bounding box derived from wall planes."""
    x_min: float
    x_max: float
    y_min: float
    y_max: float

class WallGeometry(BaseModel):
    """Wall extraction output — used for pass-2 cropping."""
    workflow_id: str
    walls_json_path: str
    bbox2d: WallBoundingBox2D
    elevations: tuple[float, float]  # (z_min, z_max)
    rotation: WallRotation
    wall_count: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)
```

### 3.3 GeometryModel

```python
class ComponentType(str, Enum):
    WALL = "wall"
    DOOR = "door"
    FLOOR = "floor"
    CEILING = "ceiling"
    RACK = "rack"
    CABINET = "cabinet"
    BATTERY_CABINET = "battery_cabinet"
    BATTERY = "battery"
    RECTIFIER = "rectifier"

class GeometryComponent(BaseModel):
    """Single extracted geometric component."""
    component_type: ComponentType
    component_id: str
    position: dict  # {x, y, z}
    dimensions: dict  # {width, height, depth}
    rotation: dict = Field(default_factory=dict)  # {rx, ry, rz}
    confidence: float = 0.0
    metadata: dict = Field(default_factory=dict)

class GeometryModel(BaseModel):
    """Complete geometry extraction output."""
    geometry_model_id: UUID = Field(default_factory=uuid4)
    workflow_id: str
    components: list[GeometryComponent]
    total_components: int
    extraction_method: str = "point_cloud_fitting"
    geometry_version: str = "1.0"
    output_path: str  # Path to geometry JSON
    generated_at: datetime = Field(default_factory=datetime.utcnow)
```

### 3.4 IFCModel

```python
class IFCModel(BaseModel):
    """Generated BIM deliverable."""
    ifc_model_id: UUID = Field(default_factory=uuid4)
    workflow_id: str
    ifc_version: str = "IFC4"
    component_count: int
    file_size_bytes: int
    storage_path: str
    validation_passed: bool = False
    generated_at: datetime = Field(default_factory=datetime.utcnow)
```

### 3.5 Artifact

```python
class ArtifactType(str, Enum):
    SEGMENTED_PLY_PASS1 = "segmented_ply_pass1"
    SEGMENTED_PLY_PASS2 = "segmented_ply_pass2"
    WALL_GEOMETRY_JSON = "wall_geometry_json"
    EXTRACTED_IMAGES = "extracted_images"
    GEOMETRY_JSON = "geometry_json"
    IFC_FILE = "ifc_file"
    PROCESSING_LOG = "processing_log"

class Artifact(BaseModel):
    """Any generated file or intermediate output."""
    artifact_id: UUID = Field(default_factory=uuid4)
    workflow_id: str
    artifact_type: ArtifactType
    file_name: str
    storage_path: str
    file_size_bytes: int = 0
    version: str = "1"
    generated_at: datetime = Field(default_factory=datetime.utcnow)
```

---

## 4. Aggregate Boundaries

### Ingestion Aggregate
- Root: `IngestionRequest`
- Contains: `PointCloudFile`
- Invariant: Workflow cannot start until ingestion status = VALIDATED

### Workflow Aggregate
- Root: `Workflow`
- Contains: `Activity[]`, `Artifact[]`
- Invariant: Only one activity IN_PROGRESS at a time per workflow

### Processing Aggregate
- Root: `Workflow` (shared)
- Contains: `SegmentationResult`, `WallGeometry`, `GeometryModel`, `IFCModel`
- Invariant: Each processing step requires predecessor completion

---

## 5. Domain Events

| Event | Produced By | Consumed By | Trigger |
|-------|-------------|-------------|---------|
| `IngestionRequested` | Ingestion | Root | File upload received |
| `IngestionValidated` | Ingestion | Root | File passes validation |
| `IngestionFailed` | Ingestion | Root | File fails validation |
| `WorkflowStarted` | Root | — | Temporal workflow begins |
| `SegmentationDispatched` | Root | Segmentation | Queue message sent |
| `SegmentationStarted` | Segmentation | Root | GPU processing begins |
| `SegmentationCompleted` | Segmentation | Root, Post-Processing | Inference complete |
| `SegmentationFailed` | Segmentation | Root | Inference error |
| `PostProcessingStarted` | Post-Processing | Root | Geometry extraction begins |
| `PostProcessingCompleted` | Post-Processing | Root | Geometry extraction done |
| `PostProcessingFailed` | Post-Processing | Root | Extraction error |
| `IFCGenerationStarted` | IFC Service | Root | IFC creation begins |
| `IFCGenerated` | IFC Service | Root, Delivery | IFC file created |
| `IFCGenerationFailed` | IFC Service | Root | IFC creation error |
| `WorkflowCompleted` | Root | Project | All steps done |
| `WorkflowFailed` | Root | Project | Unrecoverable error |
| `ArtifactRegistered` | Any | Delivery | File stored in blob |

---

## 6. Entity Relationship Diagram

```
┌──────────┐       ┌──────────┐       ┌───────────────────┐
│ Project  │ 1───* │   Site   │ 1───* │ IngestionRequest  │
└──────────┘       └──────────┘       └────────┬──────────┘
                                               │ 1
                                               │
                                               * 
                                      ┌────────────────┐
                                      │ PointCloudFile │
                                      └────────┬───────┘
                                               │ 1
                                               │
                                               1
                                      ┌────────────────┐
                                      │   Workflow     │
                                      └───┬───┬───┬───┘
                                          │   │   │
                            ┌─────────────┘   │   └─────────────┐
                            │                 │                  │
                            *                 *                  *
                   ┌────────────┐    ┌────────────────┐   ┌──────────┐
                   │  Activity  │    │   Artifact     │   │SegResult │
                   └────────────┘    └────────────────┘   └─────┬────┘
                                                                │
                                                                1
                                                       ┌────────────────┐
                                                       │ GeometryModel  │
                                                       └────────┬───────┘
                                                                │
                                                                1
                                                       ┌────────────────┐
                                                       │   IFCModel     │
                                                       └────────────────┘
```

---

## 7. State Machines

### Workflow State Machine

```
                    ┌────────────┐
                    │  PENDING   │
                    └─────┬──────┘
                          │ Temporal workflow starts
                          ▼
                    ┌────────────┐
              ┌─────│  RUNNING   │─────┐
              │     └─────┬──────┘     │
              │           │            │ timeout/error
              │           ▼            ▼
              │  ┌──────────────────┐  ┌────────┐
              │  │ SEG_IN_PROGRESS  │  │ FAILED │
              │  └────────┬─────────┘  └────────┘
              │           │                 ▲
              │           ▼                 │
              │  ┌──────────────────┐       │
              │  │ SEG_COMPLETED    │       │
              │  └────────┬─────────┘       │
              │           │                 │
              │           ▼                 │
              │  ┌──────────────────┐       │
              │  │ PP_IN_PROGRESS   │───────┘
              │  └────────┬─────────┘
              │           │
              │           ▼
              │  ┌──────────────────┐
              │  │ PP_COMPLETED     │
              │  └────────┬─────────┘
              │           │
              │           ▼
              │  ┌──────────────────┐
              │  │ IFC_IN_PROGRESS  │───────┐
              │  └────────┬─────────┘       │
              │           │                 │
              │           ▼                 ▼
              │  ┌──────────────────┐  ┌────────┐
              └──│  COMPLETED       │  │ FAILED │
                 └──────────────────┘  └────────┘
```

### Ingestion State Machine

```
  RECEIVED → VALIDATING → VALIDATED → REGISTERED
                    │
                    └──→ FAILED
```
