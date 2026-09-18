# 14 — Local Development Guide

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 13_INFRASTRUCTURE.md

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.12+ | Backend services |
| Docker Desktop | Latest | Infrastructure services |
| Poetry | 1.8+ | Python dependency management |
| Node.js | 20+ | Upload Portal (frontend) |
| Git | Latest | Version control |
| .NET SDK | 8.0 | IFC Creator (optional, for rebuilding) |

---

## 2. Quick Start (5 Minutes)

```bash
# 1. Clone repository
git clone <repo-url> scan2bim-inshelter
cd scan2bim-inshelter

# 2. Start infrastructure
docker compose up -d postgres temporal azurite

# 3. Verify infrastructure
#    - PostgreSQL: localhost:5432
#    - Temporal UI: http://localhost:8233
#    - Azurite: localhost:10000 (blob)

# 4. Set up Root Service
cd services/root-service
poetry install
cp .env.example .env
# Edit .env if needed (defaults work for local)

# 5. Run Root Service
poetry run uvicorn app.main:app --host 0.0.0.0 --port 3000 --reload

# 6. Test it
#    Open: http://localhost:3000/docs (Swagger UI)
#    Step 1: POST /api/files/upload with an .e57 file → get file_id
#    Step 2: POST /api/webhook with the file_id → starts pipeline
```

---

## 3. Development Modes

### Mode 1: Root Service Only (Mock Downstream)

Simplest setup. Root Service mocks Segmentation and Post-Processing.

```
MOCK_DOWNSTREAM=true
MOCK_SIGNAL_DELAY_SECONDS=5
```

**What happens:** Upload triggers workflow → mock services auto-signal completion after 5s → workflow completes.

**Good for:** Root Service development, API testing, workflow logic.

---

### Mode 2: Root + Real Post-Processing (No GPU)

Run Post-Processing locally for geometry extraction development.

```bash
# Terminal 1: Root Service
cd services/root-service
poetry run uvicorn app.main:app --port 3000 --reload

# Terminal 2: Post-Processing
cd services/post-processing-service
poetry install
poetry run python -m app.main
```

Configure Root Service:
```
MOCK_DOWNSTREAM=false  # Disable mock
```

Configure Post-Processing:
```
SERVICEBUS_MODE=memory
ROOT_SERVICE_URL=http://localhost:3000
```

**Good for:** Geometry extraction, IFC creation testing.

---

### Mode 3: Full Pipeline (GPU Required)

For end-to-end testing with real ML inference.

```bash
# Start all infrastructure
docker compose up -d

# OR with GPU segmentation
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

**Good for:** Integration testing, E2E validation.

---

## 4. Environment Switching (Adapter Pattern)

The SAME application code runs locally and in cloud. Only environment variables change:

| Concern | Local Config | Cloud Config |
|---------|-------------|-------------|
| File Storage | `STORAGE_MODE=local` | `STORAGE_MODE=azure` |
| Message Queue | `QUEUE_MODE=memory` | `QUEUE_MODE=servicebus` |
| Database | `DB_MODE=sqlite` or `DB_MODE=postgres` | `DB_MODE=postgres` |
| Workflow | `TEMPORAL_ADDRESS=localhost:7233` | `TEMPORAL_ADDRESS=temporal-frontend.temporal.svc:7233` |
| Auth | `AUTH_ENABLED=false` | `AUTH_ENABLED=true` |
| Downstream | `MOCK_DOWNSTREAM=true` | `MOCK_DOWNSTREAM=false` |

---

## 5. Testing Locally

### Unit Tests

```bash
cd services/root-service
poetry run pytest tests/unit/ -v
```

### Integration Tests

```bash
# Requires Docker infrastructure running
poetry run pytest tests/integration/ -v
```

### Manual E2E Test

```bash
# 1. Start infrastructure + root service (with mocks)
# 2. Upload a file
curl -X POST http://localhost:3000/api/files/upload \
  -F "file=@test_scan.e57" \
  -F "customer_id=TEST-001" \
  -F "site_id=SITE-001"

# Response: {"file_id": "xxx", "storage_path": "TEST-001/SITE-001/xxx/test_scan.e57"}

# 3. Trigger pipeline (same webhook contract as external systems)
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "customerID": "TEST-001",
    "siteID": "SITE-001",
    "fileID": "<file_id from step 2>",
    "fileName": "test_scan.e57",
    "type": "pointcloud",
    "source": "e57",
    "state": "uploaded",
    "status": "active",
    "storageLocation": "internal"
  }'

# Response: {"status": "accepted", "workflow_id": "scan2bim-xxx"}

# 3. Check status
curl http://localhost:3000/api/workflows/scan2bim-xxx

# 4. After mock delay → status: "completed"
```

---

## 6. Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Temporal connection refused | Docker not started | `docker compose up temporal` |
| Port 3000 in use | Another service running | Kill process or change PORT env |
| PostgreSQL auth failure | Wrong password | Check POSTGRES_PASSWORD in compose |
| GPU not detected | Docker GPU not configured | `nvidia-smi` check, Docker GPU runtime |
| Import errors | Missing dependencies | `poetry install` |
| Workflow stuck RUNNING | Temporal worker not started | Check TEMPORAL_ENABLED=true |

---

## 7. Development Workflow

```
1. Pick a task from tasks.md
2. Create feature branch: git checkout -b feature/task-name
3. Implement changes (follow Clean Architecture layers)
4. Write/run tests: poetry run pytest
5. Test manually via Swagger UI: http://localhost:3000/docs
6. Commit: git commit -m "feat: description"
7. Push + PR
```

---

## 8. Hot Reload Configuration

```bash
# Root Service (auto-reload on code changes)
poetry run uvicorn app.main:app --host 0.0.0.0 --port 3000 --reload

# Post-Processing (restart on changes)
# No hot-reload for queue consumers — restart manually

# Upload Portal (Vite dev server)
cd services/upload-portal
npm run dev  # Auto-reload on save
```
