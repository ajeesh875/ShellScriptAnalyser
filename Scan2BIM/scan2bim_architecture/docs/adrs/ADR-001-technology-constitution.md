# ADR-001: Technology Constitution

Version: 1.0

Status: Accepted

Date: 2026-08-10

Owner: Ajeesh Kumar A

Related Document:
- Vision.md v1.0

---

# 1. Context

The Scan2BIM Platform is being developed as an enterprise-grade, AI-enabled platform for transforming point cloud scan data into BIM and Digital Twin-ready assets.

To ensure long-term consistency, maintainability, scalability, and operational simplicity, the platform adopts a single approved technology baseline.

This ADR defines the mandatory technology standards for all Scan2BIM development.

---

# 2. Decision

All Scan2BIM services, contracts, infrastructure definitions, and AI-generated code shall comply with the technology standards defined in this ADR.

Alternative technologies require approval through a future ADR.

---

# 3. Approved Technology Standards

## Backend Development

| Area | Standard |
|--------|--------|
| Programming Language | Python 3.13+ |
| API Framework | FastAPI |
| Contract Framework | Pydantic |

---

### Frontend Development

| Area | Standard |
|--------|----------|
| Framework | React |
| Language | TypeScript |
| Build Tool | Vite |
| Data Fetching | TanStack Query (React Query) |
| HTTP Client | Axios |

Frontend Rules

- Frontend shall remain thin.
- Business logic is not permitted in the frontend.
- Frontend acts only as a client of backend services.
- Workflow orchestration shall never be implemented in the UI.
- Processing shall start via backend ingestion APIs and webhooks.

## Workflow and Integration

| Area | Standard |
|--------|--------|
| Workflow Orchestration | Temporal |
| Messaging Platform | Azure Service Bus |

---

## Data Platform

| Area | Standard |
|--------|--------|
| Operational Database | PostgreSQL |
| Distributed Cache | Redis |
| Artifact Storage | Azure Blob Storage |

---

## Observability

| Area | Standard |
|--------|--------|
| Telemetry Framework | OpenTelemetry |

---

## Infrastructure

| Area | Standard |
|--------|--------|
| Infrastructure as Code | Terraform |
| CI/CD Platform | GitHub Actions |
| Local Runtime | Docker Compose |
| Cloud Runtime | Azure Kubernetes Service (AKS) |

---

## Architecture Style

| Area | Standard |
|--------|--------|
| Platform Architecture | Microservices |
| Design Methodology | Domain Driven Design (DDD) |
| Service Architecture | Clean Architecture |

---

### Ingestion Architecture

| Area | Standard |
|--------|--------|
| Ingestion Pattern | Channel Independent Ingestion |

---

### Ingestion Rule

All ingestion channels shall be normalized through a common ingestion capability before workflow initiation.

Supported ingestion channels may include:

- Scan2BIM Upload Portal
- External Customer Portals
- REST APIs
- Webhooks
- Future Automated Sources

Workflow execution, segmentation, geometry extraction, IFC generation, and artifact delivery services shall remain independent of the ingestion source.

The Scan2BIM processing pipeline shall not depend on any specific portal implementation.

---

# 4. Mandatory Rules

## Backend

- Python is the only approved backend language.
- FastAPI is the standard API framework.
- Pydantic shall be used for contracts and validation.

## Data

- PostgreSQL is the system of record.
- Redis may be used only for caching and temporary state.
- Large artifacts shall be stored in Azure Blob Storage.

## Integration

- Azure Service Bus shall be used for asynchronous messaging.
- Temporal shall orchestrate long-running workflows.
- Workflow initiation shall occur only after successful ingestion validation and artifact registration.

### Ingestion

All ingestion channels shall be normalized through a common ingestion capability.

Supported channels may include:

- Scan2BIM Upload Portal
- External Customer Portals
- REST APIs
- Webhooks

Workflow orchestration, segmentation, geometry extraction, IFC generation, and artifact delivery services shall remain independent of the ingestion source.

## Deployment

- Services must support Docker Compose execution.
- Cloud deployment shall target AKS.
- Infrastructure shall be provisioned using Terraform.
- CI/CD shall be implemented using GitHub Actions.

## Observability

- Services must emit logs, metrics, and traces using OpenTelemetry-compatible standards.

---

# 5. Explicitly Not Approved

## Databases

- MongoDB Atlas

## Messaging Platforms

- RabbitMQ
- Kafka

## Backend Frameworks

- NestJS
- Spring Boot

## Workflow Approaches

- Custom workflow engines
- Database-driven orchestration

---

# 6. Consequences

## Benefits

- Consistent technology stack
- Reduced operational complexity
- Easier onboarding
- Better maintainability
- Improved AI-assisted development
- Reduced architecture drift

## Trade-offs

- Reduced technology flexibility
- New technology adoption requires ADR approval

These trade-offs are accepted.

---

# 7. Governance

This ADR is mandatory for:

- Architecture documents
- Service implementations
- Infrastructure definitions
- API contracts
- Event contracts
- AI-generated code

Any deviation requires a new approved ADR.

---

# 8. Decision Outcome

The Scan2BIM Platform adopts this Technology Constitution as the mandatory technology baseline for all future development and architecture decisions.