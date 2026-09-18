# 03 — Service Catalog

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 02_BOUNDED_CONTEXTS.md

---

## 1. Service Overview

| Service | Port | Language | Framework | GPU | Execution Model |
|---------|------|----------|-----------|-----|-----------------|
| Root Service | 3000 | Python 3.12+ | FastAPI | No | Long-running server |
| Segmentation Service | 5000 (health) | Python 3.12+ | Queue consumer | Yes (NVIDIA) | KEDA job (run-to-completion) |
| Post-Processing Service | 4000 (health) | Python 3.12+ | Queue consumer | No | Long-running consumer |
| IFC Service | — | C# .NET 8 (subprocess) | CLI | No | Subprocess (invoked by PP) |
| Upload Portal | 5173 (dev) | TypeScript | React + Vite | No | Static SPA |

---

## 2. Root Service

### Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-root-service` |
| Language | Python 3.12+ |
| Framework | FastAPI |
| Port | 3000 |
| Database | PostgreSQL |
| Workflow | Temporal (Python SDK) |
| Queue (consume) | `esdt-s2b-root-queue` |
| Queue (produce) | `esdt-s2b-segmentation-queue` |

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/files/upload` | Upload file to blob storage (returns file_id) |
| POST | `/api/webhook` | Trigger pipeline (single entry point for ALL sources) |
| POST | `/api/signal/activity` | Receive downstream completion signals |
| POST | `/api/signal/cancel` | Cancel a workflow |
| GET | `/api/workflows/{workflow_id}` | Get workflow status |
| GET | `/api/workflows` | List workflows (paginated) |
| GET | `/api/artifacts/{id}/download` | Get artifact download URL |
| GET | `/api/health` | Health check |
| GET | `/api/ready` | Readiness probe |

### Dependencies

| Dependency | Purpose | Local Substitute |
|-----------|---------|-----------------|
| PostgreSQL | Workflow/activity state | SQLite or Docker PostgreSQL |
| Temporal | Workflow orchestration | Docker `temporalio/auto-setup` |
| Azure Service Bus | Message queuing | `asyncio.Queue` (memory) |
| Azure Blob Storage | File storage | Local filesystem (`./uploads/`) |
| DataRepo API | SAS URL generation | Mock response |
| AWS Cognito | Auth token for DataRepo | Disabled |

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 500m | 1000m |
| Memory | 512Mi | 1024Mi |
| GPU | — | — |

---

## 3. Segmentation Service

### Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-segmentation-service` |
| Language | Python 3.12+ |
| Framework | Queue consumer (no HTTP API) |
| Health Port | 5000 |
| Queue (consume) | `esdt-s2b-segmentation-queue` |
| Queue (produce) | `esdt-s2b-post-processing-queue`, `esdt-s2b-root-queue` |
| ML Framework | Pointcept |

### Processing Pipeline

```
E57 Download → XY Crop → Pass-1 Inference → Wall Extraction 
    → Pass-2 Crop (wall-bounded) → Pass-2 Inference → Upload Results
    
(Parallel): Image Extraction
```

### ML Model Configuration

| Parameter | Value |
|-----------|-------|
| Model | Pointcept (semantic segmentation) |
| Device | CUDA (GPU) |
| Inference Method | `block_stream` |
| Block Size | 10.0 meters |
| Classes | wall, door, rack, cabinet, battery, rectifier, floor, ceiling |

### Dependencies

| Dependency | Purpose | Local Substitute |
|-----------|---------|-----------------|
| Azure Service Bus | Message queuing | Service Bus Emulator / Memory |
| Azure Blob Storage | File I/O | Local filesystem |
| NVIDIA GPU (CUDA) | ML inference | CPU fallback (slow) |
| Root Service HTTP | Signal delivery | HTTP POST to localhost |

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 4000m | 16000m |
| Memory | 16Gi | 200Gi |
| GPU | 1× NVIDIA | 1× NVIDIA |

### Scaling

| Parameter | Value |
|-----------|-------|
| Min replicas | 0 (KEDA scale-to-zero) |
| Max replicas | 5 |
| Scale trigger | Queue depth > 0 |
| Cool-down | 300 seconds |

---

## 4. Post-Processing Service

### Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-post-processing-service` |
| Language | Python 3.12+ |
| Framework | Queue consumer + health server |
| Health Port | 4000 |
| Queue (consume) | `esdt-s2b-post-processing-queue` |
| Queue (produce) | `esdt-s2b-root-queue` |

### Component Extractors

| Component | Algorithm | Output |
|-----------|-----------|--------|
| Wall | Plane fitting (RANSAC) | Position, dimensions, normal |
| Door | Wall-plane intersection search | Position, dimensions, parent wall |
| Rack | Oriented Bounding Box (OBB) | Position, dimensions, rotation |
| Cabinet | Clustering + dimensioning | Position, dimensions |
| Battery Cabinet | Enclosure detection | Position, dimensions, contents |
| Battery | Unit detection within cabinets | Position, dimensions |
| Rectifier | Component identification | Position, dimensions |
| Floor/Ceiling | Horizontal plane extraction | Elevation, bounds |

### Dependencies

| Dependency | Purpose | Local Substitute |
|-----------|---------|-----------------|
| Azure Service Bus | Message queuing | Memory queue |
| Azure Blob Storage | File I/O | Local filesystem |
| Root Service HTTP | Signal delivery | HTTP POST to localhost |
| IFC Creator (.NET) | IFC generation | Local .NET subprocess |
| DataRepo API | IFC upload | Mock / local save |
| AWS Cognito | DataRepo auth | Disabled |

### Resource Requirements

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 750m | 2000m |
| Memory | 8Gi | 24Gi |
| GPU | — | — |

---

## 5. IFC Service (Subprocess)

### Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-ifc-creator` |
| Language | C# .NET 8 |
| Library | xBIM |
| Execution | CLI subprocess (invoked by Post-Processing) |
| Input | Geometry JSON file path |
| Output | IFC file path |

### IFC Mapping

| Component | IFC Entity |
|-----------|-----------|
| Wall | `IfcWall` |
| Door | `IfcDoor` |
| Floor | `IfcSlab` |
| Ceiling | `IfcCovering` |
| Rack | `IfcFurniture` |
| Cabinet | `IfcDistributionElement` |
| Battery Cabinet | `IfcDistributionElement` |
| Battery | `IfcDistributionElement` |
| Rectifier | `IfcDistributionElement` |

### Invocation

```python
import subprocess

result = subprocess.run(
    ["dotnet", "IFCCreator.dll", "--input", geometry_json_path, "--output", ifc_output_path],
    capture_output=True,
    text=True,
    timeout=300  # 5 minutes max
)
```

---

## 6. Upload Portal (Frontend)

### Identity

| Property | Value |
|----------|-------|
| Name | `scan2bim-upload-portal` |
| Language | TypeScript |
| Framework | React + Vite |
| Dev Port | 5173 |
| Build Output | Static files (nginx serve) |

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Upload form (file + metadata) |
| `/status/{workflow_id}` | Workflow progress tracker |
| `/workflows` | List all workflows |

### API Calls (to Root Service only)

| Action | Endpoint | Purpose |
|--------|----------|---------|
| Upload file | `POST /api/files/upload` | Store file in blob, get file_id |
| Start pipeline | `POST /api/webhook` | Trigger processing (same contract as external systems) |
| Check status | `GET /api/workflows/{id}` | Get workflow progress |
| List workflows | `GET /api/workflows` | List all workflows |
| Download IFC | `GET /api/artifacts/{id}/download` | Get output file |

### Portal Interaction Flow

```
┌─────────────────────────────────────────────────────────┐
│  UPLOAD PORTAL (React)                                   │
│                                                         │
│  1. User selects E57 file + fills metadata              │
│  2. Portal calls POST /api/files/upload                 │
│     → Returns {file_id, storage_path}                   │
│  3. Portal calls POST /api/webhook                      │
│     → Same contract any external system would use       │
│     → Returns {workflow_id, status: "accepted"}         │
│  4. Portal polls GET /api/workflows/{id}                │
│     → Shows progress to user                            │
│  5. On completion, shows download link                  │
└─────────────────────────────────────────────────────────┘
```

### Why the Portal Uses /api/webhook (Not a Special Endpoint)

The portal deliberately uses the SAME webhook contract as external systems because:
1. Proves the webhook API works (portal is the first consumer)
2. Future external DataRepo integrations require ZERO backend changes
3. Processing pipeline is source-independent from day one
4. No special "portal mode" code paths in the backend

### Rules (Enforced)
- Zero business logic
- Zero direct access to Segmentation, Post-Processing, or IFC services
- Zero workflow orchestration
- Purely presentational — API client only

---

## 7. Shared Infrastructure Services

| Service | Purpose | Local | Cloud |
|---------|---------|-------|-------|
| PostgreSQL | State persistence | Docker container | Azure Database for PostgreSQL |
| Temporal | Workflow engine | Docker `auto-setup` | Self-hosted on AKS |
| Azure Service Bus | Messaging | Memory queue / Emulator | Azure Service Bus (Standard/Premium) |
| Azure Blob Storage | File storage | Local filesystem / Azurite | Azure Blob (Hot tier) |
| Redis | Caching (future) | Docker container | Azure Cache for Redis |

---

## 8. Service Dependency Graph

```
                    ┌──────────────────┐
                    │  Upload Portal   │
                    │  (React SPA)     │
                    └────────┬─────────┘
                             │ HTTP
                             ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────┐
│ External     │───▶│   Root Service   │───▶│  Temporal   │
│ Portal       │    │   (FastAPI)      │    │  Server     │
│ (Webhook)    │    └───┬──────────┬───┘    └─────────────┘
└──────────────┘        │          │
                        │ Queue    │ Queue
                        ▼          ▼
              ┌──────────────┐  ┌──────────────────────────┐
              │Segmentation  │  │   Post-Processing        │
              │Service (GPU) │  │   Service                │
              └──────┬───────┘  └──────────┬───────────────┘
                     │                      │ subprocess
                     │ Blob                 ▼
                     │ Upload     ┌──────────────────┐
                     │            │  IFC Creator     │
                     ▼            │  (.NET xBIM)     │
              ┌──────────────┐   └──────────────────┘
              │ Azure Blob   │
              │ Storage      │
              └──────────────┘

All services ──▶ PostgreSQL (state)
All services ──▶ Azure Blob (files)
Root Service ──▶ Azure Service Bus (queues)
```

---

## 9. Port Allocation

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Root Service | HTTP (FastAPI) |
| 4000 | Post-Processing Health | HTTP |
| 5000 | Segmentation Health | HTTP |
| 5173 | Upload Portal (dev) | HTTP |
| 5432 | PostgreSQL | TCP |
| 6379 | Redis | TCP |
| 7233 | Temporal Frontend | gRPC |
| 8233 | Temporal Web UI | HTTP |
| 10000 | Azurite (Blob emulator) | HTTP |
| 10001 | Azurite (Queue emulator) | HTTP |

---

## 10. Repository Structure (Monorepo Recommended)

```
scan2bim-inshelter/
├── services/
│   ├── root-service/
│   │   ├── app/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   ├── segmentation-service/
│   │   ├── app/
│   │   ├── models/               # ML model checkpoints
│   │   ├── pointcept/            # ML framework
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   ├── post-processing-service/
│   │   ├── app/
│   │   ├── ifc-creator/          # .NET project
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   └── upload-portal/
│       ├── src/
│       ├── public/
│       ├── Dockerfile
│       └── package.json
├── shared/
│   ├── contracts/                # Pydantic models (pip installable)
│   │   ├── events.py
│   │   ├── messages.py
│   │   ├── api.py
│   │   └── pyproject.toml
│   └── sdk/                      # Common adapters
│       ├── storage.py
│       ├── queue.py
│       ├── database.py
│       └── pyproject.toml
├── infrastructure/
│   ├── docker-compose.yml
│   ├── docker-compose.gpu.yml
│   ├── terraform/
│   └── helm/
├── docs/                         # This documentation
├── .github/workflows/
└── README.md
```
