# 06 — Queue Contracts (Service Bus Messages)

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 05_API_CONTRACTS.md

---

## 1. Queue Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Azure Service Bus Namespace                        │
│                                                                     │
│  ┌──────────────────────────────┐                                   │
│  │ esdt-s2b-root-queue          │ ← Root Service consumes           │
│  │  (+ dead-letter sub-queue)   │ ← Segmentation & PP produce      │
│  └──────────────────────────────┘                                   │
│                                                                     │
│  ┌──────────────────────────────┐                                   │
│  │ esdt-s2b-segmentation-queue  │ ← Segmentation Service consumes  │
│  │  (+ dead-letter sub-queue)   │ ← Root Service produces           │
│  └──────────────────────────────┘                                   │
│                                                                     │
│  ┌──────────────────────────────┐                                   │
│  │ esdt-s2b-post-processing-q   │ ← Post-Processing consumes       │
│  │  (+ dead-letter sub-queue)   │ ← Segmentation produces           │
│  └──────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Message Design Principles

1. All messages use Pydantic v2 models
2. All messages carry `workflow_id` for correlation
3. All messages carry `type` for routing
4. All messages carry `timestamp` (UTC)
5. Messages are idempotent (safe to process twice)
6. Max message size: 256 KB (Service Bus Standard) / 100 MB (Premium)
7. File data NEVER in messages — only paths/URLs to blob storage

---

## 3. Base Message Schema

```python
"""shared/contracts/messages.py — Base queue message model."""
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID, uuid4


class BaseQueueMessage(BaseModel):
    """Base schema for all queue messages."""
    id: UUID = Field(default_factory=uuid4, description="Message unique ID")
    workflow_id: str = Field(..., description="Workflow correlation ID")
    type: str = Field(..., description="Message type for routing")
    step: str = Field(..., description="Current pipeline step")
    source: str = Field(..., description="Producing service")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    retry_count: int = Field(default=0, description="How many times redelivered")
    trace_id: str = Field(default="", description="Distributed trace ID")
```

---

## 4. Root Queue Messages (`esdt-s2b-root-queue`)

### Message Types Received:

| Type | Producer | Purpose |
|------|----------|---------|
| `WEBHOOK_EVENT` | Root Service (self) | Internal routing of webhook events |
| `SEGMENTATION_COMPLETE` | Segmentation Service | Segmentation finished |
| `SEGMENTATION_FAILED` | Segmentation Service | Segmentation error |
| `POST_PROCESSING_AND_UPLOAD_COMPLETE` | Post-Processing Service | PP + IFC done |
| `POST_PROCESSING_FAILED` | Post-Processing Service | PP error |

---

### WEBHOOK_EVENT

Produced by Root Service when webhook/upload is received. Consumed by Root Service queue processor to initiate Temporal workflow.

```python
class WebhookEventMessage(BaseQueueMessage):
    """Internal message to trigger workflow creation."""
    type: str = "WEBHOOK_EVENT"
    step: str = "INITIATE_WORKFLOW"
    source: str = "webhook-handler"
    
    class Payload(BaseModel):
        event_type: str = "file.uploaded"
        file_type: str  # "e57"
        customer_id: str
        site_id: str
        project_id: str = ""
        file_id: str
        file_name: str = ""
        category: str = "pointcloud"
        storage_location: str  # "internal" (our blob) | "external" (external system's blob)
    
    payload: Payload
```

---

### SEGMENTATION_COMPLETE

Produced by Segmentation Service after successful inference.

```python
class SegmentationCompleteMessage(BaseQueueMessage):
    """Segmentation finished successfully."""
    type: str = "SEGMENTATION_COMPLETE"
    step: str = "SEGMENTATION_DONE"
    source: str = "segmentation-service"
    
    class Payload(BaseModel):
        segmented_file_path: str          # Pass-1 output PLY path in blob
        segmented_file_path_pass2: str    # Pass-2 output PLY path in blob
        wall_json_path: str               # Wall geometry JSON path in blob
        images_dir: str                   # Extracted images directory in blob
        point_count: int
        point_count_pass2: int
        classes_detected: list[str]
        inference_duration_seconds: float
        wall_count: int
        is_rotated: bool
    
    payload: Payload
```

---

### SEGMENTATION_FAILED

```python
class SegmentationFailedMessage(BaseQueueMessage):
    """Segmentation encountered an unrecoverable error."""
    type: str = "SEGMENTATION_FAILED"
    step: str = "SEGMENTATION_ERROR"
    source: str = "segmentation-service"
    
    class Payload(BaseModel):
        error_message: str
        error_type: str       # "inference_error", "download_error", "oom_error"
        failed_step: str      # "download", "crop", "pass1", "wall_extraction", "pass2"
        is_retryable: bool
        stack_trace: str = ""
    
    payload: Payload
```

---

### POST_PROCESSING_AND_UPLOAD_COMPLETE

```python
class PostProcessingCompleteMessage(BaseQueueMessage):
    """Post-processing and IFC upload completed."""
    type: str = "POST_PROCESSING_AND_UPLOAD_COMPLETE"
    step: str = "POST_PROCESSING_AND_UPLOAD_DONE"
    source: str = "post-processing-service"
    
    class Payload(BaseModel):
        geometry_json_path: str
        ifc_file_path: str
        ifc_file_size_bytes: int
        total_components: int
        component_summary: dict       # {"wall": 4, "door": 2, ...}
        ifc_delivered: bool           # Whether uploaded to DataRepo
        delivery_url: str = ""        # DataRepo download URL
        processing_duration_seconds: float
    
    payload: Payload
```

---

### POST_PROCESSING_FAILED

```python
class PostProcessingFailedMessage(BaseQueueMessage):
    """Post-processing encountered an error."""
    type: str = "POST_PROCESSING_FAILED"
    step: str = "POST_PROCESSING_ERROR"
    source: str = "post-processing-service"
    
    class Payload(BaseModel):
        error_message: str
        error_type: str       # "extraction_error", "ifc_error", "upload_error"
        failed_component: str = ""  # Which component failed (if applicable)
        is_retryable: bool
    
    payload: Payload
```

---

## 5. Segmentation Queue Messages (`esdt-s2b-segmentation-queue`)

### SEGMENTATION_START

Produced by Root Service (via Temporal activity). Consumed by Segmentation Service.

```python
class SegmentationStartMessage(BaseQueueMessage):
    """Dispatch segmentation work to GPU service."""
    type: str = "SEGMENTATION_START"
    step: str = "START_SEGMENTATION"
    source: str = "root-service"
    
    class Payload(BaseModel):
        customer_id: str
        site_id: str
        project_id: str = ""
        file_id: str
        file_url: str                 # SAS URL (cloud) or local path
        file_name: str = ""
        site_name: str = ""
        site_type: str = "indoor"
        site_elevation: float = 0.0
        latitude: float | None = None
        longitude: float | None = None
        metadata: dict = Field(default_factory=dict)
    
    payload: Payload
    task_id: str = ""  # Activity ID for tracking
```

---

## 6. Post-Processing Queue Messages (`esdt-s2b-post-processing-queue`)

### POST_PROCESSING_AND_UPLOAD_START

Produced by Segmentation Service (direct dispatch). Consumed by Post-Processing Service.

```python
class PostProcessingStartMessage(BaseQueueMessage):
    """Dispatch post-processing work."""
    type: str = "POST_PROCESSING_AND_UPLOAD_START"
    step: str = "POST_PROCESSING_AND_UPLOAD"
    source: str = "segmentation-service"
    
    class Payload(BaseModel):
        customer_id: str
        site_id: str
        project_id: str = ""
        file_id: str
        segmented_file_path: str          # Pass-1 PLY blob path
        segmented_file_path_pass2: str    # Pass-2 PLY blob path
        wall_json_path: str               # Wall geometry JSON blob path
        images_dir: str                   # Extracted images blob path
    
    payload: Payload
    task_id: str = ""
```

---

## 7. Message Routing Logic

### Root Service Queue Processor

```python
async def process_message(message: BaseQueueMessage) -> None:
    """Route inbound messages to appropriate handlers."""
    match message.type:
        case "WEBHOOK_EVENT":
            await handle_webhook_event(message)
            # → Start Temporal workflow
        
        case "SEGMENTATION_COMPLETE":
            await handle_segmentation_complete(message)
            # → Update DB activity status
            # → (Temporal signal sent via HTTP from Segmentation)
        
        case "SEGMENTATION_FAILED":
            await handle_segmentation_failed(message)
            # → Update DB, signal Temporal FAILED
        
        case "POST_PROCESSING_AND_UPLOAD_COMPLETE":
            await handle_post_processing_complete(message)
            # → Update DB activity status
            # → (Temporal signal sent via HTTP from Post-Processing)
        
        case "POST_PROCESSING_FAILED":
            await handle_post_processing_failed(message)
            # → Update DB, signal Temporal FAILED
        
        case _:
            logger.warning(f"Unknown message type: {message.type}")
            # → Send to DLQ
```

---

## 8. Queue Configuration

### Service Bus Settings

| Setting | Standard Tier | Premium Tier |
|---------|--------------|--------------|
| Max message size | 256 KB | 100 MB |
| Max delivery count | 10 | 10 |
| Lock duration | 30 seconds | 5 minutes |
| TTL (time to live) | 14 days | 14 days |
| Duplicate detection | 10 minutes | 10 minutes |

### Queue-Specific Settings

| Queue | Max Delivery | Lock Duration | Notes |
|-------|-------------|---------------|-------|
| root-queue | 10 | 30s | Fast processing, short messages |
| segmentation-queue | 3 | 5 min | Long processing, allow timeout |
| post-processing-queue | 5 | 5 min | Medium processing time |

---

## 9. Dead Letter Queue (DLQ) Handling

Messages are dead-lettered when:
1. Max delivery count exceeded
2. Message TTL expired
3. Explicitly dead-lettered by consumer (non-retryable error)

### DLQ Message Properties

```python
class DeadLetterInfo(BaseModel):
    """Metadata added when message is dead-lettered."""
    dead_letter_reason: str          # "MaxDeliveryCountExceeded" | "ApplicationError"
    dead_letter_error_description: str
    original_enqueue_time: datetime
    delivery_count: int
    original_message: BaseQueueMessage
```

### DLQ Monitoring

- Alert if DLQ depth > 0 for any queue
- DLQ messages require manual inspection
- Resolution: fix issue, then re-enqueue original message

---

## 10. Local Development (Memory Queue)

For local development, queues are implemented as `asyncio.Queue`:

```python
class MemoryQueue:
    """In-memory queue for local development."""
    
    def __init__(self):
        self._queues: dict[str, asyncio.Queue] = {}
    
    async def send(self, queue_name: str, message: dict) -> None:
        if queue_name not in self._queues:
            self._queues[queue_name] = asyncio.Queue()
        await self._queues[queue_name].put(message)
    
    async def receive(self, queue_name: str, timeout: float = 5.0) -> dict | None:
        if queue_name not in self._queues:
            self._queues[queue_name] = asyncio.Queue()
        try:
            return await asyncio.wait_for(
                self._queues[queue_name].get(), timeout=timeout
            )
        except asyncio.TimeoutError:
            return None
```

The adapter pattern ensures zero code changes when switching to real Service Bus.

---

## 11. Idempotency

All message consumers MUST be idempotent:

```python
async def handle_message(message: BaseQueueMessage) -> None:
    """Idempotent message handler."""
    # Check if already processed
    existing = await db.get_activity_by_workflow_and_type(
        message.workflow_id, message.type
    )
    if existing and existing.status == "COMPLETED":
        logger.info(f"Duplicate message {message.id} — already processed")
        return  # Acknowledge without reprocessing
    
    # Process message...
```
