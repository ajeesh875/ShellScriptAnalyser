# 05 — API Contracts (REST Endpoints)

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 04_EVENT_CONTRACTS.md

---

## 1. API Design Principles

1. RESTful design with consistent resource naming
2. All request/response bodies use Pydantic v2 models
3. Error responses follow RFC 7807 (Problem Details)
4. All endpoints return JSON
5. Authentication via Bearer token (disabled locally)
6. Correlation via `X-Workflow-ID` header where applicable

---

## 2. Root Service API

### Base URL: `http://localhost:3000/api`

---

### POST /api/files/upload

Upload a point cloud file to platform storage. Returns a file reference that can then be used in a webhook event to trigger the pipeline.

**Important:** This endpoint ONLY stores the file. It does NOT start the pipeline. The portal must then call `POST /api/webhook` with the returned `file_id` to initiate processing. This ensures the same webhook contract is used regardless of who uploaded the file.

**Content-Type:** `multipart/form-data`

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | E57 point cloud file |
| customer_id | string | Yes | Customer identifier |
| site_id | string | Yes | Site identifier |
| project_id | string | No | Project identifier |

**Response (201 Created):**

```python
class FileUploadResponse(BaseModel):
    file_id: str              # UUID of stored file
    file_name: str            # Original filename
    file_format: str          # "e57"
    file_size_bytes: int
    storage_path: str         # Blob path where file is stored
    customer_id: str
    site_id: str
    created_at: datetime
    message: str              # "File uploaded. Call POST /api/webhook to start processing."
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 400 | Missing required fields, unsupported file format |
| 413 | File too large (>10 GB) |
| 500 | Storage failure, internal error |

**Portal Usage Pattern:**

```
Step 1: Upload file
  POST /api/files/upload → returns {file_id, storage_path}

Step 2: Trigger pipeline (same contract as any external system)
  POST /api/webhook → {fileID, customerID, siteID, source: "e57", ...}
```

This 2-step pattern ensures:
- The webhook contract is the SINGLE entry point for pipeline initiation
- Future external systems only need to implement `POST /api/webhook`
- If an external system already stores files in its own blob, step 1 is skipped

---

### POST /api/webhook

Receive file upload events from ANY source — Upload Portal, external DataRepo, or future systems. This is the SINGLE entry point for pipeline initiation.

**Design Principle:** The Upload Portal is NOT special. It calls the same webhook endpoint that any external system would call. This guarantees that the pipeline processing path is 100% source-independent from day one.

**Content-Type:** `application/json`

**Request:**

```python
class WebhookEvent(BaseModel):
    """
    Webhook payload — identical contract for:
    - Upload Portal (your frontend)
    - External DataRepo (ESDT)
    - Future external systems
    """
    customerID: str           # Customer identifier
    siteID: str               # Site identifier
    projectID: str = ""       # Project identifier
    fileID: str               # File reference (UUID from /api/files/upload or external ID)
    fileName: str = ""        # Original file name
    version: str = "1"
    designVersion: str = "1"
    type: str                 # "pointcloud"
    source: str               # "e57" (file format)
    state: str                # "uploaded"
    status: str               # "active"
    correlationId: str = ""   # Optional pre-assigned workflow ID
    storageLocation: str = "" # "internal" (our blob) or "external" (DataRepo blob)

class WebhookRequest(BaseModel):
    """Webhook can carry single event or batch."""
    events: list[WebhookEvent] | None = None
    # OR single event at top level (both formats supported)
```

**How different sources use this:**

| Source | storageLocation | What Root Service does |
|--------|----------------|----------------------|
| Upload Portal | "internal" | File already in our blob → generate local path |
| External DataRepo | "external" | File in external blob → call DataRepo API for SAS URL |
| Future System | "external" | File in their blob → call their API for download URL |

**Response (200 OK):**

```python
class WebhookResponse(BaseModel):
    status: str               # "accepted"
    workflow_id: str           # Assigned workflow ID
    message: str
```

**Response (207 Multi-Status — batch):**

```python
class WebhookBatchResponse(BaseModel):
    successes: list[dict]     # [{event, workflow_id}]
    failures: list[dict]      # [{event, error}]
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 400 | Invalid source (not e57), missing required fields |
| 401 | Invalid/missing auth token (when AUTH_ENABLED=true) |
| 409 | Duplicate correlationId (already processing) |

---

### POST /api/signal/activity

Receive completion signals from downstream services.

**Content-Type:** `application/json`

**Request:**

```python
class ActivitySignalRequest(BaseModel):
    """Signal from downstream service."""
    workflowId: str                    # Workflow to signal
    activityName: str                  # "SEGMENTATION" | "POST_PROCESSING" | "IFC_CREATION"
    status: str                        # "COMPLETED" | "FAILED"
    output: dict = Field(default_factory=dict)  # Activity-specific output
    error: str | None = None           # Error message if FAILED
    duration_seconds: float | None = None
```

**Valid `activityName` values:**
- `SEGMENTATION`
- `POST_PROCESSING`
- `IFC_CREATION`

**Valid `status` values:**
- `COMPLETED`
- `FAILED`

**Response (200 OK):**

```python
class SignalResponse(BaseModel):
    status: str               # "signal_received"
    workflow_id: str
    activity_name: str
    workflow_status: str      # Updated workflow status
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 400 | Missing fields, invalid activityName or status |
| 404 | Workflow not found |
| 409 | Workflow already completed/failed |
| 500 | Temporal communication error |

---

### POST /api/signal/cancel

Cancel a running workflow.

**Request:**

```python
class CancelWorkflowRequest(BaseModel):
    workflowId: str
    reason: str = "manual_cancellation"
```

**Response (200 OK):**

```python
class CancelResponse(BaseModel):
    status: str               # "cancelled"
    workflow_id: str
    reason: str
```

---

### GET /api/workflows/{workflow_id}

Get detailed status of a specific workflow.

**Response (200 OK):**

```python
class WorkflowDetailResponse(BaseModel):
    workflow_id: str
    workflow_type: str
    status: str
    current_activity: str
    customer_id: str
    site_id: str
    file_id: str
    started_at: datetime
    completed_at: datetime | None
    duration_seconds: float | None
    error: str | None
    activities: list[ActivityDetail]
    artifacts: list[ArtifactDetail]

class ActivityDetail(BaseModel):
    activity_id: str
    activity_name: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    duration_seconds: float | None
    error: str | None

class ArtifactDetail(BaseModel):
    artifact_id: str
    artifact_type: str
    file_name: str
    file_size_bytes: int
    download_url: str | None
    generated_at: datetime
```

---

### GET /api/workflows

List workflows with pagination and filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number |
| page_size | int | 20 | Items per page (max 100) |
| status | string | — | Filter by status |
| customer_id | string | — | Filter by customer |
| site_id | string | — | Filter by site |
| sort_by | string | "started_at" | Sort field |
| sort_order | string | "desc" | "asc" or "desc" |

**Response (200 OK):**

```python
class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowSummary]
    total: int
    page: int
    page_size: int
    total_pages: int

class WorkflowSummary(BaseModel):
    workflow_id: str
    status: str
    customer_id: str
    site_id: str
    file_name: str
    started_at: datetime
    completed_at: datetime | None
    duration_seconds: float | None
```

---

### GET /api/artifacts/{artifact_id}/download

Get a download URL for a generated artifact.

**Response (200 OK):**

```python
class ArtifactDownloadResponse(BaseModel):
    artifact_id: str
    file_name: str
    download_url: str       # SAS URL (cloud) or file path (local)
    expires_at: datetime    # URL expiration
    content_type: str
    file_size_bytes: int
```

---

### GET /api/health

Health check endpoint.

**Response (200 OK):**

```python
class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "scan2bim-root-service"
    version: str
    uptime_seconds: float
    timestamp: datetime
```

---

### GET /api/ready

Readiness probe (checks dependencies).

**Response (200 OK):**

```python
class ReadinessResponse(BaseModel):
    status: str = "ready"
    checks: dict  # {"database": "ok", "temporal": "ok", "queue": "ok"}
```

**Response (503 Service Unavailable):**

```python
class ReadinessResponse(BaseModel):
    status: str = "not_ready"
    checks: dict  # {"database": "ok", "temporal": "error", "queue": "ok"}
```

---

## 3. Error Response Format (RFC 7807)

All error responses follow this structure:

```python
class ProblemDetail(BaseModel):
    """RFC 7807 Problem Details for HTTP APIs."""
    type: str = "about:blank"       # Error type URI
    title: str                      # Human-readable title
    status: int                     # HTTP status code
    detail: str                     # Detailed explanation
    instance: str = ""              # URI of the specific occurrence
    workflow_id: str | None = None  # Correlation (if available)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
```

**Example:**

```json
{
    "type": "https://scan2bim.io/errors/invalid-file-format",
    "title": "Invalid File Format",
    "status": 400,
    "detail": "File 'scan.xyz' has format 'xyz' which is not supported for InShelter pipeline. Supported: e57",
    "instance": "/api/files/upload",
    "workflow_id": null,
    "timestamp": "2026-08-12T10:30:00Z"
}
```

---

## 4. Authentication (When Enabled)

### Bearer Token (Entra ID)

```
Authorization: Bearer <jwt-token>

Token claims required:
- aud: "scan2bim-root-service"
- iss: "https://login.microsoftonline.com/{tenant_id}/v2.0"
- appid: must be in WHITELISTED_CLIENT_IDS
```

### Local Development

When `AUTH_ENABLED=false`, all requests pass through without authentication.

---

## 5. CORS Configuration

```python
CORS_ORIGINS = [
    "http://localhost:5173",           # Upload Portal (dev)
    "http://localhost:3000",           # Root Service (self)
    "https://*.ericsson.net",          # Production portals
    "https://*.sitedigitaltwin.com",   # Production domain
]
```

---

## 6. Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/files/upload | 10 requests | per minute |
| POST /api/webhook | 100 requests | per minute |
| GET /api/workflows | 60 requests | per minute |
| POST /api/signal/* | 200 requests | per minute |

---

## 7. OpenAPI Specification

The Root Service auto-generates OpenAPI 3.1 documentation at:
- **Swagger UI:** `http://localhost:3000/docs`
- **ReDoc:** `http://localhost:3000/redoc`
- **OpenAPI JSON:** `http://localhost:3000/openapi.json`
