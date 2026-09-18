# 00 — Foundation: Principles, Constraints & Non-Negotiables

Version: 1.0  
Status: Mandatory  
Prerequisite: None

---

## 1. Platform Identity

The Scan2BIM InShelter platform transforms single-face E57 point cloud scans of telecom equipment shelters into IFC BIM models through an automated, workflow-orchestrated pipeline.

**Input:** E57 point cloud scan (1–5 GB)  
**Output:** IFC file (BIM model with walls, doors, racks, cabinets, batteries, rectifiers)  
**Processing Time:** 20–90 minutes  
**Automation Level:** Zero human intervention (scan-in → BIM-out)

---

## 2. Architecture Principles (Ranked by Priority)

### P1 — Local-First Development
Every service must run locally via Docker Compose. Cloud is NOT a prerequisite for development. The adapter pattern enables same business logic to run against local emulators or real cloud services.

### P2 — Channel-Independent Ingestion
The processing pipeline shall NEVER depend on the source of the scan. Whether it arrives via Upload Portal, Webhook, REST API, or future automated source — the workflow receives the same normalized payload.

### P3 — Clean Architecture Per Service
Each service follows:
```
Domain Layer      (entities, value objects, domain events) — NO dependencies
Application Layer (use cases, ports/interfaces) — depends only on Domain
Infrastructure Layer (adapters, repos, external clients) — implements ports
API Layer         (controllers, routes) — thin, delegates to Application
```

### P4 — Contract-First Development
All inter-service communication contracts (events, messages, APIs) are defined BEFORE implementation. Pydantic models are the single source of truth for all schemas.

### P5 — Workflow-Orchestrated Processing
Long-running processing is orchestrated by Temporal. Services do NOT manage their own multi-step orchestration. They receive work, do work, signal completion.

### P6 — Event-Driven Communication
Services communicate through Azure Service Bus queues. Direct HTTP calls are only for synchronous signal delivery (Temporal signals). No service-to-service REST choreography.

### P7 — Observability from Day One
Every service emits structured logs, metrics, and traces using OpenTelemetry. Correlation via `workflow_id` across all services.

### P8 — Failure-Tolerant Processing
All operations support: retry (exponential backoff), idempotency (deduplication by workflow_id), timeout (configurable), dead-letter (poison messages captured).

---

## 3. Non-Negotiable Constraints

| Constraint | Rule |
|-----------|------|
| Language | Python 3.12+ for ALL backend services |
| Framework | FastAPI for ALL HTTP APIs |
| Contracts | Pydantic v2 for ALL schemas |
| Database | PostgreSQL (MongoDB NOT approved) |
| Messaging | Azure Service Bus (Kafka, RabbitMQ NOT approved) |
| Workflow | Temporal (custom engines NOT approved) |
| IaC | Terraform |
| CI/CD | GitHub Actions |

---

## 4. Retained Decisions (From Existing System)

These architectural decisions from the current InShelter system are **carried forward**:

| Decision | Rationale |
|----------|-----------|
| 2-pass segmentation (coarse + refined) | Wall-bounded refinement significantly improves accuracy |
| Wall extraction between passes | Provides spatial bounds for pass-2 cropping |
| KEDA GPU scale-to-zero | Cost optimization — GPU only runs during inference |
| IFC via .NET xBIM (subprocess) | xBIM is the most mature open-source IFC library; no Python equivalent |
| Image extraction (parallel) | Extracts 2D images from E57 for YOLO-based component detection |
| Service Bus queue-per-service | Clean message routing, independent scaling |
| Temporal for orchestration | Durable execution, automatic retry, long-timeout support |

---

## 5. Changed Decisions (NestJS → Python)

| What Changes | From | To | Reason |
|-------------|------|-----|--------|
| Root MS language | TypeScript/NestJS | Python/FastAPI | ADR-001: Python everywhere |
| Root MS framework | NestJS modules | FastAPI + Clean Architecture | Consistency |
| Database | MongoDB/Cosmos | PostgreSQL | ADR-001: Strategic data platform |
| IFC service wrapper | Separate C# service | Python service wrapping .NET subprocess | Unified toolchain |
| Local queue | N/A (Azure only) | asyncio.Queue (memory adapter) | Local-first |
| Local storage | N/A (Azure only) | Filesystem adapter | Local-first |

---

## 6. Scope: InShelter Services

The following services are in scope for this implementation plan:

| Service | Existing Repo | Action |
|---------|---------------|--------|
| Root Service (Orchestrator) | `esdt-scan-2-bim-root-microservice` (NestJS) | **Rewrite** in Python |
| Segmentation Service | `esdt-scan-2-bim-segmentation-microservice` (Python) | **Refactor** to Clean Architecture |
| Post-Processing Service | `esdt-scan-2-bim-post-processing-microservice` (Python) | **Refactor** to Clean Architecture |
| IFC Service | `esdt-scan-2-bim-ifc-creation-microservice` (C# .NET) | **Wrap** in Python service |

### Excluded from scope:
- `esdt-s2b-gitops` — GitOps (separate concern)
- `esdt-s2b-test-viewer` — Test viewer (separate tool)
- `esdt-scan-2-bim-auto-tagging-tool` — Auto-tagging (separate tool)
- `esdt-scan-2-bim-yolox-training` — ML training (separate concern)
- All `full-site-*` repos — Full-site pipeline (different pipeline)

---

## 7. MVP Definition

The MVP demonstrates end-to-end pipeline execution:

**Must Have:**
- Upload Portal (React/TypeScript — thin client)
- Ingestion API (accepts E57, validates, stores, initiates workflow)
- Temporal workflow orchestration (Python SDK)
- Segmentation (2-pass with wall extraction)
- Post-processing (geometry extraction for all components)
- IFC generation (xBIM subprocess)
- Status tracking (PostgreSQL)
- Local-first execution (Docker Compose)

**Should Have:**
- Webhook ingestion channel (DataRepo compatibility)
- Azure Service Bus integration (cloud adapter)
- Azure Blob Storage integration (cloud adapter)
- Health checks and readiness probes
- Structured logging with correlation

**Could Have:**
- OpenTelemetry tracing
- KEDA autoscaling configuration
- Helm charts for AKS deployment

---

## 8. Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Reliability | Workflow survives service restarts (Temporal durability) |
| Scalability | GPU inference scales 0→5 replicas via KEDA |
| Maintainability | Clean Architecture, single-purpose modules |
| Testability | Each layer independently testable |
| Observability | End-to-end correlation via workflow_id |
| Recoverability | Auto-retry with DLQ for unrecoverable failures |
| Portability | Local Docker Compose ↔ Cloud AKS (same code) |

---

## 9. Actors

| Actor | Interaction |
|-------|-------------|
| Upload Portal User | Uploads E57 via portal, triggers webhook, views status, downloads IFC |
| Future External System (DataRepo) | Stores file in own blob, calls POST /api/webhook to trigger pipeline |
| AI Coding Agent | Implements services following this spec |
| Platform Operator | Monitors workflows, inspects DLQ, manages infra |
| Segmentation ML Model | Pointcept model running on GPU |
| IFC Library (xBIM) | .NET subprocess converting geometry → IFC |

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| E57 | Point cloud file format (ASTM standard) |
| IFC | Industry Foundation Classes — BIM exchange format |
| BIM | Building Information Modeling |
| PLY | Polygon file format (point cloud output) |
| Pointcept | ML framework for 3D point cloud understanding |
| xBIM | Open-source .NET library for IFC creation |
| KEDA | Kubernetes Event-Driven Autoscaler |
| Temporal | Durable workflow execution engine |
| OBB | Oriented Bounding Box (geometry fitting) |
| SAS URL | Shared Access Signature URL (Azure Blob temporary access) |
| DLQ | Dead Letter Queue (failed messages storage) |
| Adapter Pattern | Interface + implementation swap via config |
