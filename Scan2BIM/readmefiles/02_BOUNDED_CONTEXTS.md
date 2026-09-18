# 02 — Bounded Contexts & Service Boundaries (InShelter Scope)

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 01_DOMAIN_MODEL.md

---

## 1. InShelter Context Map

For the InShelter MVP, we implement a focused subset of the full platform bounded contexts:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        InShelter Platform                                │
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌───────────────────────────────┐ │
│  │  Ingestion  │──▶│    Root     │──▶│      Processing Pipeline       │ │
│  │  Context    │   │  (Workflow) │   │  ┌────────┐ ┌──────┐ ┌─────┐  │ │
│  │             │   │  Context    │   │  │  Seg   │→│  PP  │→│ IFC │  │ │
│  └─────────────┘   └─────────────┘   │  └────────┘ └──────┘ └─────┘  │ │
│                                       └───────────────────────────────┘ │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   Upload    │ ← Client application (NOT a bounded context)           │
│  │   Portal    │                                                        │
│  └─────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service-to-Context Mapping

| Bounded Context | Service | Responsibility |
|----------------|---------|----------------|
| Ingestion | Root Service (embedded) | File validation, metadata capture, workflow initiation |
| Workflow | Root Service | Temporal orchestration, status tracking, signal routing |
| Segmentation | Segmentation Service | ML inference, wall extraction, image extraction |
| Geometry | Post-Processing Service | Component geometry extraction |
| IFC | IFC Service | Geometry JSON → IFC file conversion |

**Note:** For InShelter MVP, Ingestion and Workflow contexts are co-located in the Root Service. They can be separated into independent services in a future phase.

---

## 3. Root Service (Ingestion + Workflow Context)

### Owns
- IngestionRequest
- Workflow
- Activity

### Responsibilities
- Webhook reception (single entry point for ALL pipeline triggers — portal and external systems)
- File storage API (accepts file upload from portal, stores in blob)
- File validation (format, size, required metadata)
- Artifact registration (store file in blob, record path)
- Temporal workflow creation and lifecycle
- Activity status tracking
- Signal routing (downstream → Temporal)
- Workflow state persistence (PostgreSQL)

### Does NOT Own
- Point cloud processing
- ML model inference
- Geometry algorithms
- IFC generation
- File content (delegates to blob storage)

### Publishes (outbound queues/events)
- `segmentation-queue`: Dispatch segmentation work
- `WorkflowStarted` (database event)
- `WorkflowCompleted` / `WorkflowFailed` (database event)

### Consumes (inbound)
- HTTP Webhook from Upload Portal (after file stored in blob)
- HTTP Webhook from future external systems (file in their blob)
- HTTP Signals from Segmentation and Post-Processing services
- Queue messages: `root-queue` (status updates from downstream)

---

## 4. Segmentation Service (Segmentation Context)

### Owns
- SegmentationResult
- WallGeometry
- ML Model execution

### Responsibilities
- Download E57 from blob storage (via SAS URL)
- XY histogram-based noise cropping
- Pass-1: Coarse ML inference (full scan)
- Wall extraction (plane detection, bbox computation)
- Pass-2: Refined ML inference (wall-bounded crop)
- Rotation detection and correction
- Image extraction (parallel process)
- Upload segmented PLY artifacts to blob storage
- Signal completion/failure to Root Service

### Does NOT Own
- Workflow orchestration
- Geometry extraction
- IFC generation
- File ingestion

### Communication Pattern
- **Input:** Reads from `segmentation-queue` (Service Bus)
- **Output:** 
  - HTTP POST → Root Service `/api/signal/activity` (SEGMENTATION signal)
  - Queue message → `post-processing-queue` (direct dispatch)
  - Blob upload → Segmented PLY files

### Execution Model
- KEDA-scaled job (scales 0→N based on queue depth)
- GPU required (NVIDIA, CUDA)
- Runs to completion, then exits (no long-running server)
- Health server runs in separate process on port 5000

---

## 5. Post-Processing Service (Geometry Context)

### Owns
- GeometryModel
- Component extraction algorithms

### Responsibilities
- Download segmented PLY from blob storage
- Component geometry extraction:
  - Wall (plane fitting)
  - Door (within wall planes)
  - Rack (OBB fitting)
  - Cabinet (clustering + dimensioning)
  - Battery Cabinet (enclosure detection)
  - Battery (unit detection)
  - Rectifier (identification)
  - Floor/Ceiling (plane extraction)
- Conflict resolution between components
- Geometry JSON output generation
- IFC creation delegation (subprocess or service call)
- Signal completion/failure to Root Service
- Upload IFC to delivery destination

### Does NOT Own
- ML inference
- Workflow orchestration
- File ingestion
- Wall extraction (receives wall data from Segmentation)

### Communication Pattern
- **Input:** Reads from `post-processing-queue` (Service Bus)
- **Output:**
  - HTTP POST → Root Service `/api/signal/activity` (POST_PROCESSING signal)
  - Blob upload → Geometry JSON, IFC file
  - HTTP → DataRepo API (IFC delivery)

### Execution Model
- Always-on consumer (long-running)
- CPU-intensive (no GPU needed)
- Memory-intensive (20–24 GB for large scans)
- Health server on port 4000

---

## 6. IFC Service (IFC Context)

### Owns
- IFCModel
- IFC generation logic

### Responsibilities
- Receive geometry JSON
- Convert to IFC using xBIM (.NET)
- Validate IFC output
- Return IFC file path

### Does NOT Own
- Geometry extraction
- ML inference
- Workflow orchestration

### Implementation Note
For InShelter MVP, IFC creation is handled as a **subprocess within Post-Processing Service** (calls .NET DLL directly). In future, it can be extracted as an independent service.

### Communication Pattern (Current)
- **Input:** Local subprocess call from Post-Processing
- **Output:** IFC file written to disk

### Communication Pattern (Future — Independent Service)
- **Input:** HTTP API or queue message with geometry JSON
- **Output:** IFC file in blob storage + completion signal

---

## 7. Upload Portal (Client Application)

### Is NOT a Bounded Context

The Upload Portal is a thin React/TypeScript web application.

### Responsibilities
- File upload UI
- Metadata capture form
- Processing status display
- IFC download link

### Interacts With
- Root Service API only:
  - `POST /api/files/upload` (store E57 file in blob)
  - `POST /api/webhook` (trigger pipeline — same contract as external systems)
  - `GET /api/workflows/{id}` (check status)
  - `GET /api/artifacts/{id}/download` (download IFC)

### Rules
- NO business logic in frontend
- NO workflow orchestration in frontend
- NO direct service-to-service calls from frontend
- Frontend is replaceable without affecting backend

---

## 8. Context Communication Rules

| Rule | Description |
|------|-------------|
| No shared databases | Each context owns its data store |
| Queue for async | Long-running work dispatched via Service Bus |
| HTTP for sync signals | Short-lived signals (completion, failure) via HTTP |
| Contracts via Pydantic | All inter-service schemas defined as Pydantic models |
| Correlation via workflow_id | All messages carry workflow_id for tracing |

---

## 9. Data Ownership

| Data | Owner | Storage |
|------|-------|---------|
| Workflow state | Root Service | PostgreSQL |
| Activity history | Root Service | PostgreSQL |
| Ingestion metadata | Root Service | PostgreSQL |
| Segmented PLY files | Segmentation Service | Azure Blob |
| Wall geometry JSON | Segmentation Service | Azure Blob |
| Extracted images | Segmentation Service | Azure Blob |
| Geometry JSON | Post-Processing Service | Azure Blob |
| IFC files | IFC Service (via Post-Processing) | Azure Blob |
| Original E57 files | External (DataRepo) | External Blob |

---

## 10. Anti-Corruption Layer

The Root Service acts as an Anti-Corruption Layer between:

1. **Upload Portal** → Root Service provides file storage API + webhook endpoint (same contract for all sources)
2. **Future External Systems (DataRepo)** → Root Service handles external SAS URL retrieval and token exchange
3. **AWS Cognito** → Root Service handles token exchange for DataRepo access
4. **Legacy MongoDB** → Root Service migrates state to PostgreSQL

This prevents external system complexity from leaking into domain services.
