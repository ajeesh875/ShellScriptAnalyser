# Scan2BIM InShelter — Complete Implementation Bible

Version: 1.0  
Status: Implementation Ready  
Owner: Ajeesh Kumar A  
Created: 2026-08-12

---

## Purpose

This document set is the **single source of truth** for building and operating the Scan2BIM InShelter platform. It is designed for both human developers and AI coding agents to follow step-by-step without ambiguity.

---

## Document Execution Order

Follow these documents **strictly in sequence**. Each document assumes completion of all preceding documents.

| # | Document | Purpose | Status |
|---|----------|---------|--------|
| 00 | `00_FOUNDATION.md` | Vision recap, principles, constraints, non-negotiables | Foundation |
| 01 | `01_DOMAIN_MODEL.md` | Entities, aggregates, domain events, ubiquitous language | Domain |
| 02 | `02_BOUNDED_CONTEXTS.md` | Service boundaries, ownership, responsibilities | Domain |
| 03 | `03_SERVICE_CATALOG.md` | All services, their roles, ports, tech stack, repos | Architecture |
| 04 | `04_EVENT_CONTRACTS.md` | All domain events with Pydantic schemas | Contracts |
| 05 | `05_API_CONTRACTS.md` | All REST API endpoints with request/response schemas | Contracts |
| 06 | `06_QUEUE_CONTRACTS.md` | All message queue schemas and routing rules | Contracts |
| 07 | `07_PIPELINE_FLOW.md` | Complete end-to-end data flow with sequence diagrams | Architecture |
| 08 | `08_SERVICE_ARCHITECTURE.md` | Clean Architecture template for all services | Architecture |
| 09 | `09_ROOT_SERVICE_SPEC.md` | Root orchestrator — full implementation specification | Service Spec |
| 10 | `10_SEGMENTATION_SERVICE_SPEC.md` | Segmentation — full implementation specification | Service Spec |
| 11 | `11_POST_PROCESSING_SERVICE_SPEC.md` | Post-processing — full implementation specification | Service Spec |
| 12 | `12_IFC_SERVICE_SPEC.md` | IFC generation — full implementation specification | Service Spec |
| 13 | `13_INFRASTRUCTURE.md` | Docker Compose, AKS, Terraform, networking | Infrastructure |
| 13B | `13B_CLOUD_ADAPTERS_IMPLEMENTATION.md` | Complete Azure adapter code (Blob, Service Bus, PostgreSQL, Auth) | Infrastructure |
| 14 | `14_LOCAL_DEVELOPMENT.md` | Local-first setup, mock services, adapter pattern | Development |
| 15 | `15_OBSERVABILITY.md` | Logging, metrics, tracing with OpenTelemetry | Operations |
| 16 | `16_TESTING_STRATEGY.md` | Unit, integration, E2E, contract, property-based | Quality |
| 17 | `17_CICD_PIPELINE.md` | Build, test, scan, deploy pipeline | Delivery |
| 18 | `18_DEPLOYMENT_GUIDE.md` | Environment promotion, secrets, rollback | Operations |
| 19 | `19_MIGRATION_PLAN.md` | Migrating from NestJS root + existing services | Migration |

---

## Key Decisions Embedded

1. **Root MS rewrite**: NestJS → Python/FastAPI (per ADR-001)
2. **IFC creation**: C# .NET xBIM retained as subprocess (wrapped in Python service)
3. **Database**: MongoDB → PostgreSQL (per ADR-001, with migration path)
4. **Local-first**: Every service runs via Docker Compose before cloud
5. **Adapter pattern**: Same business logic, swappable infrastructure adapters
6. **Temporal retained**: Workflow orchestration via Temporal (Python SDK)

---

## How to Use This Documentation

### For Human Developers
1. Read documents 00–02 for domain understanding
2. Read documents 03–07 for architecture overview
3. Read document 08 for service structure patterns
4. Read your service-specific document (09–12) for implementation
5. Use documents 13–18 for infrastructure and operations

### For AI Coding Agents
1. Load document 08 as the structural template
2. Load the target service spec (09–12) as implementation requirements
3. Load relevant contract documents (04–06) for schemas
4. Execute implementation following Clean Architecture layers
5. Validate against testing strategy (16)

---

## Repository Structure (Target)

```
scan2bim-platform/
├── services/
│   ├── root-service/              # Python/FastAPI — Orchestrator
│   ├── segmentation-service/      # Python — GPU ML Inference
│   ├── post-processing-service/   # Python — Geometry Extraction
│   └── ifc-service/               # Python wrapper + .NET subprocess
├── shared/
│   ├── contracts/                 # Pydantic models (shared package)
│   ├── sdk/                       # Common utilities, adapters
│   └── proto/                     # gRPC protos (if needed)
├── infrastructure/
│   ├── terraform/                 # IaC for Azure resources
│   ├── docker-compose.yml         # Local development
│   └── helm/                      # Kubernetes charts
├── docs/                          # This documentation set
└── .github/
    └── workflows/                 # CI/CD pipelines
```

---

## Technology Stack (Non-Negotiable — ADR-001)

| Layer | Technology |
|-------|-----------|
| Backend Language | Python 3.12+ |
| API Framework | FastAPI |
| Contracts/Validation | Pydantic v2 |
| Workflow Engine | Temporal (Python SDK) |
| Message Queue | Azure Service Bus |
| Database | PostgreSQL |
| Cache | Redis |
| Object Storage | Azure Blob Storage |
| Observability | OpenTelemetry |
| Infrastructure | Terraform |
| CI/CD | GitHub Actions |
| Local Runtime | Docker Compose |
| Cloud Runtime | AKS |
| IFC Library | xBIM (.NET, subprocess) |

---

## Related Architecture Documents

- `scan2bim-architetcure/vision.md` — Platform vision
- `scan2bim-architetcure/adr001.md` — Technology constitution
- `scan2bim-architetcure/bounded-context.md` — Context boundaries
- `scan2bim-architetcure/domain-model.md` — Domain entities
- `INSHELTER_PIPELINE_ARCHITECTURE.md` — Current pipeline (reference)
- `INSHELTER_INFRASTRUCTURE_GUIDE.md` — Cloud infrastructure
