# 09 — Root Service Implementation Specification

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 08_SERVICE_ARCHITECTURE.md

---

## 1. Service Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-root-service` |
| Role | Orchestrator + Ingestion Gateway |
| Port | 3000 |
| Language | Python 3.12+ |
| Framework | FastAPI |
| Workflow | Temporal (Python SDK `temporalio`) |
| Database | PostgreSQL (async via `asyncpg`) |
| Queue | Azure Service Bus / Memory adapter |
| Storage | Azure Blob / Local filesystem |

---

## 2. Responsibilities

1. **Ingestion**: Accept file uploads (portal) and webhooks (external), validate, store
2. **Workflow Orchestration**: Create and manage Temporal workflows
3. **Signal Routing**: Receive completion/failure signals from downstream services
4. **Status Tracking**: Persist workflow and activity state in PostgreSQL
5. **Queue Dispatch**: Send segmentation tasks to downstream queue
6. **API Gateway**: Expose REST APIs for portal and monitoring

---

## 3. Use Cases

### UC-1: Store File (Portal uploads file to blob)

```python
class StoreFileUseCase:
    """Handle file upload — stores in blob, returns file reference.
    Does NOT start the pipeline. Portal must call webhook separately."""
    
    def __init__(self, storage: StoragePort, file_repo: FileRepository):
        self.storage = storage
        self.file_repo = file_repo
    
    async def execute(self, command: StoreFileCommand) -> StoreFileResult:
        # 1. Validate file format
        if command.file_format not in ["e57"]:
            raise ValidationError(f"Unsupported format: {command.file_format}")
        
        # 2. Generate file_id
        file_id = str(uuid4())
        
        # 3. Store file in blob
        storage_path = f"{command.customer_id}/{command.site_id}/{file_id}/{command.file_name}"
        await self.storage.upload(storage_path, command.file_data)
        
        # 4. Record file metadata (optional — for tracking)
        await self.file_repo.register_file({
            "file_id": file_id,
            "customer_id": command.customer_id,
            "site_id": command.site_id,
            "file_name": command.file_name,
            "file_format": command.file_format,
            "storage_path": storage_path,
            "file_size_bytes": len(command.file_data),
        })
        
        return StoreFileResult(
            file_id=file_id,
            file_name=command.file_name,
            storage_path=storage_path,
            file_size_bytes=len(command.file_data),
        )
```

### UC-2: Handle Webhook (SINGLE entry point for pipeline initiation)

```python
class HandleWebhookUseCase:
    """
    Handle webhook event — triggers the processing pipeline.
    
    This is the SAME use case whether called by:
    - Upload Portal (after storing file via /api/files/upload)
    - External DataRepo
    - Any future external system
    
    The pipeline does not know or care who called this.
    """
    
    async def execute(self, event: WebhookEvent) -> WebhookResult:
        # 1. Validate source format (must be e57)
        if event.source != "e57":
            raise ValidationError(f"Unsupported source: {event.source}")
        
        # 2. Validate required fields
        if not all([event.fileID, event.customerID, event.siteID]):
            raise ValidationError("Missing required fields")
        
        # 3. Check for duplicate
        existing = await self.workflow_repo.get_workflow_by_correlation(
            event.correlationId
        )
        if existing:
            raise DuplicateWorkflowError(event.correlationId)
        
        # 4. Generate workflow_id
        workflow_id = event.correlationId or f"scan2bim-{uuid4()}"
        
        # 5. Determine storage location
        # "internal" = file in our blob (uploaded via /api/files/upload)
        # "external" = file in external system's blob (need SAS URL from them)
        storage_location = event.storageLocation or "internal"
        
        # 6. Create workflow record
        await self.workflow_repo.create_workflow({
            "workflow_id": workflow_id,
            "customer_id": event.customerID,
            "site_id": event.siteID,
            "project_id": event.projectID,
            "file_id": event.fileID,
            "file_name": event.fileName,
            "status": "PENDING",
            "metadata": {"storage_location": storage_location},
        })
        
        # 7. Dispatch to root queue (pipeline starts here)
        await self.queue.send(settings.ROOT_QUEUE, {
            "id": str(uuid4()),
            "workflowId": workflow_id,
            "type": "WEBHOOK_EVENT",
            "step": "INITIATE_WORKFLOW",
            "payload": {
                "customer_id": event.customerID,
                "site_id": event.siteID,
                "project_id": event.projectID,
                "file_id": event.fileID,
                "file_name": event.fileName,
                "storage_location": storage_location,
            },
            "source": "webhook-handler",
        })
        
        return WebhookResult(workflow_id=workflow_id, status="accepted")
```

### UC-3: Handle Activity Signal

```python
class HandleSignalUseCase:
    """Process completion/failure signals from downstream services."""
    
    async def execute(self, signal: ActivitySignal) -> SignalResult:
        # 1. Validate workflow exists
        workflow = await self.workflow_repo.get_workflow(signal.workflow_id)
        if not workflow:
            raise WorkflowNotFoundError(signal.workflow_id)
        
        # 2. Validate workflow is in valid state
        if workflow["status"] in ["COMPLETED", "FAILED", "CANCELLED"]:
            raise InvalidStateError(
                f"Workflow {signal.workflow_id} is {workflow['status']}"
            )
        
        # 3. Update activity record
        await self.activity_repo.update_activity_by_workflow(
            workflow_id=signal.workflow_id,
            activity_name=signal.activity_name,
            status=signal.status,
            output=signal.output,
            error=signal.error,
        )
        
        # 4. Forward signal to Temporal workflow
        await self.workflow_engine.signal_workflow(
            workflow_id=signal.workflow_id,
            signal_name="activity_completed",
            data=signal.model_dump(),
        )
        
        # 5. Update workflow status
        new_status = self._compute_new_status(signal)
        await self.workflow_repo.update_workflow_status(
            signal.workflow_id, new_status
        )
        
        return SignalResult(
            workflow_id=signal.workflow_id,
            status="signal_received",
            workflow_status=new_status,
        )
    
    def _compute_new_status(self, signal: ActivitySignal) -> str:
        if signal.status == "FAILED":
            return "FAILED"
        match signal.activity_name:
            case "SEGMENTATION":
                return "SEGMENTATION_COMPLETED"
            case "POST_PROCESSING":
                return "COMPLETED"
            case _:
                return "RUNNING"
```

---

## 4. Temporal Workflow Activities

```python
"""app/workflow/activities.py"""
from temporalio import activity
from app.config import settings


@activity.defn
async def generate_file_url(input: dict) -> dict:
    """
    Get a download URL for the E57 file.
    
    Handles both storage locations:
    - "internal": File in our blob (uploaded via portal) → generate SAS from our blob
    - "external": File in external system → call DataRepo API for their SAS URL
    
    LOCAL mode: Returns filesystem path regardless of storage_location.
    """
    storage_location = input.get("storage_location", "internal")
    
    if settings.STORAGE_MODE == "local":
        # Local development: always use filesystem path
        storage = create_storage()
        file_url = await storage.get_url(
            f"{input['customer_id']}/{input['site_id']}/{input['file_id']}/{input.get('file_name', '')}"
        )
    elif storage_location == "internal":
        # Cloud, file in OUR blob (portal upload): generate SAS URL
        storage = create_storage()
        blob_path = f"{input['customer_id']}/{input['site_id']}/{input['file_id']}/{input.get('file_name', '')}"
        file_url = await storage.get_url(blob_path, expiry_minutes=120)
    else:
        # Cloud, file in EXTERNAL system: call DataRepo API for SAS URL
        client = create_datarepo_client()
        file_url = await client.get_download_sas_url(
            file_id=input["file_id"],
            customer_id=input["customer_id"],
        )
    
    return {"file_url": file_url}


@activity.defn
async def dispatch_segmentation(input: dict) -> dict:
    """
    Send segmentation task to downstream queue.
    Message format matches what Segmentation Service expects.
    """
    queue = create_queue()
    await queue.start()
    
    task_id = str(uuid4())
    message = {
        "id": str(uuid4()),
        "workflowId": input["workflow_id"],
        "type": "SEGMENTATION_START",
        "step": "START_SEGMENTATION",
        "source": "root-service",
        "taskId": task_id,
        "timestamp": datetime.utcnow().isoformat(),
        "payload": {
            "customerId": input["customer_id"],
            "siteId": input["site_id"],
            "projectId": input.get("project_id", ""),
            "fileId": input["file_id"],
            "fileUrl": input["file_url"],
            "fileName": input.get("file_name", ""),
            "metadata": {"fileType": "e57"},
        },
    }
    
    await queue.send(settings.SEGMENTATION_QUEUE, message)
    await queue.stop()
    
    return {"task_id": task_id, "queue": settings.SEGMENTATION_QUEUE}


@activity.defn
async def track_post_processing(input: dict) -> dict:
    """
    Record that post-processing is expected.
    Does NOT dispatch — Segmentation Service dispatches directly to PP queue.
    """
    activity_repo = create_activity_repository()
    activity_id = str(uuid4())
    
    await activity_repo.create_activity({
        "activity_id": activity_id,
        "workflow_id": input["workflow_id"],
        "activity_name": "POST_PROCESSING",
        "status": "IN_PROGRESS",
    })
    
    return {"activity_id": activity_id, "status": "WAITING_FOR_SIGNAL"}
```

---

## 5. Database Schema (PostgreSQL)

```sql
-- Workflow executions table
CREATE TABLE workflows (
    workflow_id VARCHAR(64) PRIMARY KEY,
    workflow_type VARCHAR(50) NOT NULL DEFAULT 'inshelter_single_scan',
    customer_id VARCHAR(100) NOT NULL,
    site_id VARCHAR(100) NOT NULL,
    project_id VARCHAR(100) DEFAULT '',
    file_id VARCHAR(100) NOT NULL,
    file_name VARCHAR(500) DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    current_activity VARCHAR(50) DEFAULT '',
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds FLOAT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity executions table
CREATE TABLE activities (
    activity_id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL REFERENCES workflows(workflow_id),
    activity_name VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds FLOAT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Artifacts table
CREATE TABLE artifacts (
    artifact_id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL REFERENCES workflows(workflow_id),
    artifact_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    storage_path VARCHAR(1000) NOT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    content_type VARCHAR(100) DEFAULT '',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_customer ON workflows(customer_id);
CREATE INDEX idx_workflows_started_at ON workflows(started_at DESC);
CREATE INDEX idx_activities_workflow ON activities(workflow_id);
CREATE INDEX idx_artifacts_workflow ON artifacts(workflow_id);
```

---

## 6. Queue Processor

```python
"""app/services/queue_processor.py"""
import structlog
from app.config import settings

logger = structlog.get_logger()


async def process_root_queue_message(message: dict) -> None:
    """Route messages from root queue to appropriate handlers."""
    msg_type = message.get("type")
    workflow_id = message.get("workflowId", "unknown")
    
    logger.info("processing_message", type=msg_type, workflow_id=workflow_id)
    
    match msg_type:
        case "WEBHOOK_EVENT":
            await _handle_webhook_event(message)
        case "SEGMENTATION_COMPLETE":
            await _handle_segmentation_complete(message)
        case "SEGMENTATION_FAILED":
            await _handle_segmentation_failed(message)
        case "POST_PROCESSING_AND_UPLOAD_COMPLETE":
            await _handle_post_processing_complete(message)
        case "POST_PROCESSING_FAILED":
            await _handle_post_processing_failed(message)
        case _:
            logger.warning("unknown_message_type", type=msg_type)


async def _handle_webhook_event(message: dict) -> None:
    """Start Temporal workflow for new ingestion."""
    workflow_id = message["workflowId"]
    payload = message["payload"]
    
    # Update status to RUNNING
    await workflow_repo.update_workflow_status(workflow_id, "RUNNING")
    
    # Start Temporal workflow
    await workflow_engine.start_workflow(
        workflow_id=workflow_id,
        workflow_type="Scan2BimWorkflow",
        input_data={
            "workflow_id": workflow_id,
            "customer_id": payload.get("customer_id") or payload.get("customerID"),
            "site_id": payload.get("site_id") or payload.get("siteID"),
            "file_id": payload.get("file_id") or payload.get("fileID"),
            "file_name": payload.get("file_name") or payload.get("fileName", ""),
            "signal_timeout_minutes": settings.SIGNAL_TIMEOUT_MINUTES,
        },
    )
    
    logger.info("workflow_started", workflow_id=workflow_id)
```

---

## 7. Mock Downstream (Local Development)

```python
"""app/services/mock_downstream.py — Simulates Segmentation + PP."""
import asyncio
import httpx
import structlog

from app.config import settings

logger = structlog.get_logger()


async def mock_segmentation_service(queue) -> None:
    """Watches segmentation queue and auto-signals completion."""
    logger.info("mock_segmentation_started", delay=settings.MOCK_SIGNAL_DELAY_SECONDS)
    
    while True:
        msg = await queue.receive(settings.SEGMENTATION_QUEUE)
        if msg:
            workflow_id = msg.get("workflowId")
            logger.info("mock_segmentation_processing", workflow_id=workflow_id)
            
            await asyncio.sleep(settings.MOCK_SIGNAL_DELAY_SECONDS)
            
            # Signal completion to Root Service
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"http://localhost:{settings.PORT}/api/signal/activity",
                    json={
                        "workflowId": workflow_id,
                        "activityName": "SEGMENTATION",
                        "status": "COMPLETED",
                        "output": {"point_count": 150000, "classes": ["wall", "rack"]},
                    },
                )
            
            # Also dispatch to post-processing queue (like real service does)
            await queue.send(settings.POST_PROCESSING_QUEUE, {
                "id": str(uuid4()),
                "workflowId": workflow_id,
                "type": "POST_PROCESSING_AND_UPLOAD_START",
                "step": "POST_PROCESSING_AND_UPLOAD",
                "source": "mock-segmentation",
                "payload": {"segmentedFilePath": "mock/output.ply"},
            })
            
            logger.info("mock_segmentation_completed", workflow_id=workflow_id)


async def mock_post_processing_service(queue) -> None:
    """Watches PP queue and auto-signals completion."""
    logger.info("mock_postprocessing_started", delay=settings.MOCK_SIGNAL_DELAY_SECONDS)
    
    while True:
        msg = await queue.receive(settings.POST_PROCESSING_QUEUE)
        if msg:
            workflow_id = msg.get("workflowId")
            logger.info("mock_pp_processing", workflow_id=workflow_id)
            
            await asyncio.sleep(settings.MOCK_SIGNAL_DELAY_SECONDS)
            
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"http://localhost:{settings.PORT}/api/signal/activity",
                    json={
                        "workflowId": workflow_id,
                        "activityName": "POST_PROCESSING",
                        "status": "COMPLETED",
                        "output": {"ifc_path": "mock/output.ifc", "components": 12},
                    },
                )
            
            logger.info("mock_pp_completed", workflow_id=workflow_id)
```

---

## 8. Environment Variables

```env
# Application
APP_NAME=scan2bim-root-service
APP_VERSION=1.0.0
ENVIRONMENT=local
PORT=3000
LOG_LEVEL=INFO

# Storage
STORAGE_MODE=local
UPLOAD_DIR=./uploads
# STORAGE_MODE=azure
# AZURE_STORAGE_ACCOUNT_URL=https://xxx.blob.core.windows.net
# AZURE_STORAGE_CONTAINER=scan2bim

# Queue
QUEUE_MODE=memory
ROOT_QUEUE=esdt-s2b-root-queue
SEGMENTATION_QUEUE=esdt-s2b-segmentation-queue
POST_PROCESSING_QUEUE=esdt-s2b-post-processing-queue
# QUEUE_MODE=servicebus
# SERVICE_BUS_FQDN=xxx.servicebus.windows.net

# Database
DB_MODE=sqlite
SQLITE_PATH=./data/app.db
# DB_MODE=postgres
# DATABASE_URL=postgresql+asyncpg://scan2bim:scan2bim@localhost:5432/scan2bim

# Temporal
TEMPORAL_ENABLED=true
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=scan2bim-queue
SIGNAL_TIMEOUT_MINUTES=240

# Auth
AUTH_ENABLED=false
# WHITELISTED_CLIENT_IDS=["client-id-1","client-id-2"]

# Mock (local only)
MOCK_DOWNSTREAM=true
MOCK_SIGNAL_DELAY_SECONDS=5
```

---

## 9. Dependencies (pyproject.toml)

```toml
[tool.poetry.dependencies]
python = "^3.12"
fastapi = "^0.115.0"
uvicorn = {extras = ["standard"], version = "^0.34.0"}
temporalio = "^1.7.0"
pydantic = "^2.10.0"
pydantic-settings = "^2.6.0"
python-multipart = "^0.0.12"
asyncpg = "^0.30.0"
aiosqlite = "^0.20.0"
httpx = "^0.28.0"
structlog = "^24.4.0"
opentelemetry-api = "^1.28.0"
opentelemetry-sdk = "^1.28.0"
opentelemetry-instrumentation-fastapi = "^0.49b0"
azure-servicebus = "^7.12.0"
azure-storage-blob = "^12.23.0"
azure-identity = "^1.19.0"

[tool.poetry.group.dev.dependencies]
pytest = "^8.3.0"
pytest-asyncio = "^0.24.0"
pytest-cov = "^6.0.0"
httpx = "^0.28.0"
```
