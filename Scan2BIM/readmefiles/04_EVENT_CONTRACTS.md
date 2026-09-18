# 04 — Event Contracts (Domain Events)

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 03_SERVICE_CATALOG.md

---

## 1. Event Design Principles

1. All events use Pydantic v2 models
2. All events carry `workflow_id` for correlation
3. All events carry `timestamp` (UTC ISO 8601)
4. All events carry `event_id` (UUID) for deduplication
5. All events carry `source` (producing service name)
6. Events are immutable — once published, never modified
7. Event names use past tense (something happened)

---

## 2. Base Event Schema

```python
"""shared/contracts/events.py — Base event model."""
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID, uuid4


class BaseEvent(BaseModel):
    """Base schema for all domain events."""
    event_id: UUID = Field(default_factory=uuid4, description="Unique event identifier")
    event_type: str = Field(..., description="Event type name")
    workflow_id: str = Field(..., description="Correlation ID across services")
    source: str = Field(..., description="Service that produced this event")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="UTC timestamp")
    version: str = Field(default="1.0", description="Event schema version")
    metadata: dict = Field(default_factory=dict, description="Additional context")
```

---

## 3. Ingestion Events

### IngestionRequested

```python
class IngestionRequestedEvent(BaseEvent):
    """Emitted when a new file is received for processing."""
    event_type: str = "ingestion.requested"
    source: str = "root-service"
    
    customer_id: str
    site_id: str
    project_id: str = ""
    file_id: str
    file_name: str
    file_format: str  # "e57", "ply", etc.
    file_size_bytes: int
    storage_location: str  # "internal" (our blob), "external" (external system)
    storage_path: str
```

### IngestionValidated

```python
class IngestionValidatedEvent(BaseEvent):
    """Emitted when file passes validation checks."""
    event_type: str = "ingestion.validated"
    source: str = "root-service"
    
    customer_id: str
    site_id: str
    file_id: str
    file_format: str
    validation_checks: list[str]  # ["format_valid", "size_ok", "metadata_complete"]
```

### IngestionFailed

```python
class IngestionFailedEvent(BaseEvent):
    """Emitted when file fails validation."""
    event_type: str = "ingestion.failed"
    source: str = "root-service"
    
    customer_id: str
    site_id: str
    file_id: str
    failure_reason: str
    failure_details: dict = Field(default_factory=dict)
```

---

## 4. Workflow Events

### WorkflowStarted

```python
class WorkflowStartedEvent(BaseEvent):
    """Emitted when Temporal workflow begins execution."""
    event_type: str = "workflow.started"
    source: str = "root-service"
    
    workflow_type: str  # "inshelter_single_scan"
    customer_id: str
    site_id: str
    file_id: str
    file_url: str  # SAS URL or local path
    temporal_run_id: str = ""
```

### WorkflowStepStarted

```python
class WorkflowStepStartedEvent(BaseEvent):
    """Emitted when a workflow step begins."""
    event_type: str = "workflow.step_started"
    source: str = "root-service"
    
    activity_name: str  # "segmentation", "post_processing", "ifc_creation"
    activity_id: str
```

### WorkflowStepCompleted

```python
class WorkflowStepCompletedEvent(BaseEvent):
    """Emitted when a workflow step completes successfully."""
    event_type: str = "workflow.step_completed"
    source: str = "root-service"
    
    activity_name: str
    activity_id: str
    duration_seconds: float
    output_summary: dict = Field(default_factory=dict)
```

### WorkflowCompleted

```python
class WorkflowCompletedEvent(BaseEvent):
    """Emitted when entire workflow finishes successfully."""
    event_type: str = "workflow.completed"
    source: str = "root-service"
    
    total_duration_seconds: float
    ifc_file_path: str
    artifacts_generated: list[str]
```

### WorkflowFailed

```python
class WorkflowFailedEvent(BaseEvent):
    """Emitted when workflow fails unrecoverably."""
    event_type: str = "workflow.failed"
    source: str = "root-service"
    
    failed_activity: str
    error_message: str
    error_type: str  # "timeout", "processing_error", "infrastructure_error"
    retry_count: int
    is_retryable: bool
```

---

## 5. Segmentation Events

### SegmentationStarted

```python
class SegmentationStartedEvent(BaseEvent):
    """Emitted when segmentation processing begins."""
    event_type: str = "segmentation.started"
    source: str = "segmentation-service"
    
    file_id: str
    model_version: str
    device: str  # "cuda", "cpu"
    inference_method: str  # "block_stream"
```

### SegmentationPass1Completed

```python
class SegmentationPass1CompletedEvent(BaseEvent):
    """Emitted after coarse segmentation pass completes."""
    event_type: str = "segmentation.pass1_completed"
    source: str = "segmentation-service"
    
    point_count: int
    classes_detected: list[str]
    inference_duration_seconds: float
    output_path: str
```

### WallExtractionCompleted

```python
class WallExtractionCompletedEvent(BaseEvent):
    """Emitted after wall geometry is extracted from pass-1 output."""
    event_type: str = "segmentation.wall_extraction_completed"
    source: str = "segmentation-service"
    
    wall_count: int
    is_rotated: bool
    bbox2d: dict  # {x_min, x_max, y_min, y_max}
    elevations: list[float]  # [z_min, z_max]
    walls_json_path: str
```

### SegmentationCompleted

```python
class SegmentationCompletedEvent(BaseEvent):
    """Emitted when all segmentation passes complete (final event)."""
    event_type: str = "segmentation.completed"
    source: str = "segmentation-service"
    
    pass1_output_path: str
    pass2_output_path: str
    wall_json_path: str
    images_dir: str
    total_duration_seconds: float
    point_count_pass1: int
    point_count_pass2: int
    classes_detected: list[str]
```

### SegmentationFailed

```python
class SegmentationFailedEvent(BaseEvent):
    """Emitted when segmentation fails."""
    event_type: str = "segmentation.failed"
    source: str = "segmentation-service"
    
    failed_step: str  # "download", "crop", "pass1_inference", "wall_extraction", "pass2_inference"
    error_message: str
    error_type: str
    is_retryable: bool
```

---

## 6. Post-Processing Events

### PostProcessingStarted

```python
class PostProcessingStartedEvent(BaseEvent):
    """Emitted when geometry extraction begins."""
    event_type: str = "post_processing.started"
    source: str = "post-processing-service"
    
    segmented_file_path: str
    components_to_extract: list[str]
```

### ComponentExtracted

```python
class ComponentExtractedEvent(BaseEvent):
    """Emitted for each component type successfully extracted."""
    event_type: str = "post_processing.component_extracted"
    source: str = "post-processing-service"
    
    component_type: str  # "wall", "door", "rack", etc.
    count: int
    extraction_duration_seconds: float
```

### PostProcessingCompleted

```python
class PostProcessingCompletedEvent(BaseEvent):
    """Emitted when all geometry extraction completes."""
    event_type: str = "post_processing.completed"
    source: str = "post-processing-service"
    
    geometry_json_path: str
    total_components: int
    component_summary: dict  # {"wall": 4, "door": 2, "rack": 8, ...}
    total_duration_seconds: float
```

### PostProcessingFailed

```python
class PostProcessingFailedEvent(BaseEvent):
    """Emitted when post-processing fails."""
    event_type: str = "post_processing.failed"
    source: str = "post-processing-service"
    
    failed_component: str
    error_message: str
    is_retryable: bool
```

---

## 7. IFC Events

### IFCGenerationStarted

```python
class IFCGenerationStartedEvent(BaseEvent):
    """Emitted when IFC creation begins."""
    event_type: str = "ifc.generation_started"
    source: str = "post-processing-service"  # Currently embedded
    
    geometry_json_path: str
    target_ifc_version: str = "IFC4"
```

### IFCGenerated

```python
class IFCGeneratedEvent(BaseEvent):
    """Emitted when IFC file is successfully created."""
    event_type: str = "ifc.generated"
    source: str = "post-processing-service"
    
    ifc_file_path: str
    ifc_version: str
    file_size_bytes: int
    component_count: int
    generation_duration_seconds: float
```

### IFCGenerationFailed

```python
class IFCGenerationFailedEvent(BaseEvent):
    """Emitted when IFC creation fails."""
    event_type: str = "ifc.generation_failed"
    source: str = "post-processing-service"
    
    error_message: str
    geometry_json_path: str
    is_retryable: bool
```

---

## 8. Artifact Events

### ArtifactRegistered

```python
class ArtifactRegisteredEvent(BaseEvent):
    """Emitted when any artifact is stored in blob storage."""
    event_type: str = "artifact.registered"
    source: str  # Producing service
    
    artifact_type: str  # "segmented_ply_pass1", "ifc_file", etc.
    file_name: str
    storage_path: str
    file_size_bytes: int
    content_type: str = ""
```

### ArtifactDelivered

```python
class ArtifactDeliveredEvent(BaseEvent):
    """Emitted when an artifact is delivered to the consumer."""
    event_type: str = "artifact.delivered"
    source: str = "post-processing-service"
    
    artifact_type: str
    delivery_channel: str  # "datarepo", "blob_download", "portal"
    delivery_url: str
```

---

## 9. Event Routing Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EVENT FLOW                                         │
│                                                                         │
│  Upload/Webhook                                                         │
│       │                                                                 │
│       ▼                                                                 │
│  IngestionRequested → IngestionValidated → WorkflowStarted              │
│                                                │                        │
│                                                ▼                        │
│                                    SegmentationStarted                  │
│                                         │                               │
│                                         ▼                               │
│                              SegmentationPass1Completed                  │
│                                         │                               │
│                                         ▼                               │
│                              WallExtractionCompleted                     │
│                                         │                               │
│                                         ▼                               │
│                              SegmentationCompleted                       │
│                                         │                               │
│                                         ▼                               │
│                              PostProcessingStarted                       │
│                                    │    │    │                           │
│                                    ▼    ▼    ▼                          │
│                              ComponentExtracted (×N)                     │
│                                         │                               │
│                                         ▼                               │
│                              PostProcessingCompleted                     │
│                                         │                               │
│                                         ▼                               │
│                              IFCGenerationStarted → IFCGenerated         │
│                                                         │               │
│                                                         ▼               │
│                                              ArtifactDelivered           │
│                                                         │               │
│                                                         ▼               │
│                                              WorkflowCompleted           │
└─────────────────────────────────────────────────────────────────────────┘
```
