# 19 — Migration Plan: Existing Services → New Architecture

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 18_DEPLOYMENT_GUIDE.md

---

## 1. Migration Overview

```
CURRENT STATE                          TARGET STATE
─────────────                          ────────────
Root MS (NestJS/TypeScript)     →     Root Service (Python/FastAPI)
MongoDB/Cosmos DB               →     PostgreSQL
No local development            →     Docker Compose (local-first)
Direct Azure Service Bus        →     Adapter pattern (memory/SB)
Segmentation (Python, coupled)  →     Segmentation (Python, Clean Arch)
Post-Processing (Python, coupled)→    Post-Processing (Python, Clean Arch)
IFC Creator (C# .NET, separate) →     IFC Creator (C# .NET, subprocess)
No shared contracts             →     Shared Pydantic contracts package
GitLab CI                       →     GitHub Actions
Flux/GitOps                     →     GitHub Actions + Helm
```

---

## 2. Migration Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Set up new repository structure, shared contracts, Docker Compose

| Task | Duration | Dependencies |
|------|----------|-------------|
| Create monorepo structure | 1 day | None |
| Create shared contracts package | 2 days | None |
| Create Docker Compose (infra) | 1 day | None |
| Set up PostgreSQL schema | 1 day | None |
| Set up Temporal (Docker) | 0.5 day | None |
| Create adapter interfaces (ports) | 2 days | Contracts |
| Create local adapters (memory, filesystem, SQLite) | 2 days | Ports |

**Deliverable:** Infrastructure running locally, adapter interfaces defined.

---

### Phase 2: Root Service Rewrite (Week 3-5)

**Goal:** Fully functional Root Service in Python/FastAPI

| Task | Duration | Dependencies |
|------|----------|-------------|
| FastAPI app bootstrap (config, main, health) | 1 day | Phase 1 |
| File storage endpoint (POST /api/files/upload) | 1 day | Storage adapter |
| Webhook endpoint (single pipeline entry point) | 1 day | Contracts |
| Signal endpoint | 1 day | Workflow adapter |
| Queue processor | 1 day | Queue adapter |
| Temporal workflow definition | 2 days | Temporal adapter |
| Temporal activities | 2 days | All adapters |
| Mock downstream services | 1 day | Queue adapter |
| PostgreSQL repository | 2 days | DB adapter |
| Azure Service Bus adapter | 1 day | Queue port |
| Azure Blob Storage adapter | 1 day | Storage port |
| Unit tests | 2 days | All above |
| Integration tests | 2 days | Docker infra |
| E2E test (with mocks) | 1 day | All above |

**Deliverable:** Root Service processes uploads end-to-end (with mock downstream).

**Validation:** 
- Upload E57 → workflow created → mock signals → COMPLETED
- Webhook event → same flow
- Status API returns correct state

---

### Phase 3: Segmentation Refactor (Week 6-8)

**Goal:** Refactor existing Segmentation Service to Clean Architecture

| Task | Duration | Dependencies |
|------|----------|-------------|
| Extract domain entities | 1 day | Contracts |
| Define ports (storage, queue) | 1 day | Phase 1 |
| Create adapters (memory queue, local storage) | 2 days | Ports |
| Refactor main.py → Clean Architecture | 2 days | All above |
| Refactor pipeline to use ports | 3 days | Adapters |
| Update queue message format to new contracts | 1 day | Contracts |
| Update signal format (HTTP to Root) | 1 day | API contracts |
| Integration test (queue → pipeline → signal) | 2 days | Root Service |
| GPU integration test | 1 day | GPU available |

**Key principle:** The ML inference code (Pointcept, cropping, wall extraction) stays the same. Only the I/O boundary changes.

**Deliverable:** Segmentation reads from queue, processes, signals Root Service.

---

### Phase 4: Post-Processing Refactor (Week 9-11)

**Goal:** Refactor Post-Processing + embed IFC Creator

| Task | Duration | Dependencies |
|------|----------|-------------|
| Extract domain entities | 1 day | Contracts |
| Define ports | 1 day | Phase 1 |
| Create adapters | 2 days | Ports |
| Refactor main.py → Clean Architecture | 2 days | All above |
| Refactor component extractors (keep algorithms) | 3 days | Domain |
| Embed IFC Creator as subprocess | 1 day | .NET build |
| Add delivery service (DataRepo upload) | 2 days | External API |
| Update signal format | 1 day | API contracts |
| Integration test | 2 days | Segmentation output |
| IFC validation test | 1 day | IFC Creator |

**Key principle:** Geometry extraction algorithms stay the same. Only the service shell changes.

**Deliverable:** Post-Processing consumes segmented data, creates IFC, signals Root.

---

### Phase 5: End-to-End Integration (Week 12-13)

**Goal:** Full pipeline working locally and in cloud

| Task | Duration | Dependencies |
|------|----------|-------------|
| E2E test (local, with real services) | 2 days | All services |
| E2E test (Docker Compose, full stack) | 2 days | Docker images |
| Cloud adapter testing (Azure SB, Blob) | 2 days | Azure access |
| Performance test (real E57 scan) | 2 days | GPU + data |
| Fix integration issues | 3 days | Testing |

**Deliverable:** Upload E57 → IFC output, all services communicating correctly.

---

### Phase 6: Upload Portal (Week 14)

**Goal:** React/TypeScript frontend for upload and status

| Task | Duration | Dependencies |
|------|----------|-------------|
| Create React/Vite project | 0.5 day | None |
| Upload page (form + file input) | 1 day | Root API |
| Status page (workflow progress) | 1 day | Root API |
| Workflow list page | 1 day | Root API |
| Download artifact link | 0.5 day | Root API |
| Docker build + nginx serve | 0.5 day | Build |

**Deliverable:** Working portal at http://localhost:5173.

---

### Phase 7: Cloud Deployment (Week 15-16)

**Goal:** Deploy to AKS cluster

| Task | Duration | Dependencies |
|------|----------|-------------|
| Terraform for Azure resources | 3 days | Azure access |
| Helm charts for all services | 2 days | Docker images |
| GitHub Actions CI/CD pipeline | 2 days | Repo setup |
| KEDA configuration (GPU scaling) | 1 day | AKS GPU pool |
| Deploy to Dev environment | 1 day | All infra |
| Smoke test in cloud | 1 day | Deployment |

---

## 3. Data Migration

### MongoDB → PostgreSQL

```python
"""scripts/migrate_mongodb_to_postgres.py"""

async def migrate_workflows():
    """Migrate workflow_executions from MongoDB to PostgreSQL."""
    # Read from MongoDB
    mongo_client = AsyncIOMotorClient(MONGO_URI)
    db = mongo_client["scan2bim"]
    
    async for doc in db.workflow_executions.find():
        # Transform to new schema
        workflow = {
            "workflow_id": doc["workflowId"],
            "customer_id": doc.get("customerId", ""),
            "site_id": doc.get("siteId", ""),
            "file_id": doc.get("fileId", ""),
            "status": doc["status"],
            "started_at": doc.get("createdAt"),
            "completed_at": doc.get("completedAt"),
        }
        
        # Insert into PostgreSQL
        await postgres_repo.create_workflow(workflow)
    
    print(f"Migrated {count} workflows")
```

**Note:** For MVP, historical data migration is optional. New system starts fresh.

---

## 4. Parallel Running Strategy

During migration, both old and new systems can run in parallel:

```
Week 1-13: Build new system (local development)
Week 14:   Deploy new system to Dev cluster
Week 15:   Run both systems side-by-side in Dev
Week 16:   Validate new system processes same scans correctly
Week 17:   Cut over: route webhooks to new system
Week 18:   Decommission old NestJS Root MS
```

---

## 5. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| ML model incompatibility | Keep exact same Pointcept model + config |
| Queue message format change | Support both old and new formats during transition |
| Data loss during migration | Run in parallel, compare results |
| IFC output regression | Compare IFC output from both systems |
| GPU resource contention | Use separate GPU node pool for new system |

---

## 6. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| All unit tests passing | >80% coverage |
| Integration tests passing | Root ↔ Segmentation ↔ PP ↔ IFC |
| E2E test passing | Upload → IFC in <90 min |
| Same IFC quality | Compare with old system output |
| Local-first working | `docker compose up` → full pipeline |
| Cloud deployment working | AKS Dev environment operational |
| Performance baseline | ≤ old system processing time |

---

## 7. Timeline Summary

```
Week  1-2:   Foundation (repo, contracts, Docker Compose)
Week  3-5:   Root Service (Python/FastAPI rewrite)
Week  6-8:   Segmentation Service (refactor)
Week  9-11:  Post-Processing Service (refactor)
Week  12-13: E2E Integration
Week  14:    Upload Portal
Week  15-16: Cloud Deployment
────────────────────────────────────────────────
TOTAL: ~16 weeks (4 months)
```

**Team:** 1-2 developers + AI coding agent  
**Critical path:** Root Service → Segmentation → Post-Processing (serial dependencies)  
**Parallelizable:** Portal + Cloud infra (can start in Phase 3-4)
