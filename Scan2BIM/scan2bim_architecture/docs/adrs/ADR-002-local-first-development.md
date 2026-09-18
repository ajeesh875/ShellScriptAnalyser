# ADR-002: Local First Development Strategy

Version: 1.0

Status: Accepted

Owner: Ajeesh Kumar A

Related Documents

- Vision.md
- ADR-001 Technology Constitution
- DomainModel.md
- BoundedContexts.md

---

# 1. Decision Title

Local First, Cloud Ready Development Strategy

---

# 2. Status

Accepted

This ADR establishes the mandatory development strategy for the Scan2BIM Platform.

---

# 3. Context

The Scan2BIM Platform is being developed as an AI-enabled, cloud-native, microservice-based platform for transforming point cloud scan data into BIM and Digital Twin ready assets.

The platform includes:

- Upload Portal
- Ingestion Service
- Workflow Service
- Segmentation Service
- Geometry Service
- IFC Service
- Delivery Service

The platform architecture has standardized on:

- Python
- FastAPI
- Temporal
- PostgreSQL
- Redis
- Azure Blob Storage
- Azure Service Bus
- OpenTelemetry
- Terraform
- GitHub Actions
- Azure Kubernetes Service (AKS)

The platform must support:

- Fast developer onboarding
- Low-cost development
- Local debugging
- Repeatable environments
- Cloud deployment
- Independent service evolution

Developing directly against Azure infrastructure would increase complexity, costs, onboarding effort, and developer dependency on cloud environments.

---

# 4. Problem Statement

Without a standardized development approach:

- Development environments become inconsistent.
- Azure resources become mandatory during feature development.
- Developer onboarding becomes slower.
- Local debugging becomes difficult.
- Infrastructure costs increase.
- Cloud deployment may require redesign.

The platform requires a development model that enables local execution while remaining production aligned.

---

# 5. Decision

The Scan2BIM Platform shall adopt a:

**Local First + Cloud Ready**

development strategy.

Every capability must:

- Run locally
- Be testable locally
- Support local debugging
- Remain cloud deployable

The Local First strategy applies equally to:

- Upload Portal
- Ingestion Context
- Workflow Context
- Segmentation Context
- Geometry Context
- IFC Context
- Delivery Context

Migration from local environments to cloud environments shall require:

- Configuration changes
- Infrastructure provisioning

and shall not require:

- Application rewrites
- Service redesign
- Contract redesign
- Workflow redesign

---

# 6. Core Architecture Principle

The platform shall follow:

```text
Same Code
Same Containers
Same Contracts
Different Configuration
```

This is the primary architecture rule governing local-to-cloud movement.

---

# 7. Local Runtime Platform

The approved local runtime platform is:

```text
Docker Compose
```

Every Scan2BIM service must support:

```bash
docker compose up
```

for local development and validation.

---

# 8. Required Local Runtime Components

## PostgreSQL

Used for:

- Operational Data
- Metadata
- Workflow Data

---

## Redis

Used for:

- Distributed Cache
- Temporary State

---

## Temporal

Used for:

- Workflow Orchestration
- Retry Handling
- Activity Execution

---

## Azurite

Used for:

- Local Azure Blob Storage Emulation

Stores:

- Point Cloud Files
- Intermediate Artifacts
- Geometry Artifacts
- IFC Files
- Output Deliverables

---

## Local Messaging

The platform shall expose messaging interactions through abstractions that remain independent of the underlying messaging provider.

During local development, messaging may be emulated or replaced by development-friendly implementations.

Production deployments shall use Azure Service Bus.

Migration from local messaging implementations to Azure Service Bus shall require configuration changes only.

---

## Upload Portal

The Upload Portal shall run locally.

Capabilities include:

- Upload Files
- Create Ingestion Requests
- Track Workflow Status
- Download Outputs

The Upload Portal remains a client of the Ingestion Context.

---

## Service Execution

The following services shall be executable locally through Docker Compose:

- ingestion-service
- workflow-service
- segmentation-service
- geometry-service
- ifc-service
- delivery-service

---

# 9. Service Design Rules

Every Scan2BIM service must:

- Run in containers
- Be environment configurable
- Avoid hardcoded infrastructure references
- Support local execution
- Support cloud deployment without code modification
- Support identical API contracts in local and cloud environments
- Support identical event contracts in local and cloud environments

The following are prohibited:

- Hardcoded cloud endpoints
- Hardcoded credentials
- Environment-specific business logic

---

# 10. Local To Cloud Mapping

| Capability | Local | Cloud |
|------------|--------|--------|
| Runtime | Docker Compose | Azure Kubernetes Service (AKS) |
| Storage | Azurite | Azure Blob Storage |
| Database | PostgreSQL Container | Azure PostgreSQL Flexible Server |
| Cache | Redis Container | Azure Cache for Redis |
| Workflow | Temporal Container | Temporal Deployment on AKS |
| Messaging | Local Messaging Adapter | Azure Service Bus |

---

# 11. Development Workflow

```text
Clone Repository

↓

Start Docker Compose

↓

Run Platform Services

↓

Upload Point Cloud Data

↓

Create Ingestion Request

↓

Execute Workflow

↓

Validate Results

↓

Run Automated Tests

↓

Commit Changes

↓

GitHub Actions Pipeline

↓

Deploy To AKS
```

---

# 12. Cloud Readiness Rules

Local First does not mean Local Only.

The objective is:

```text
Develop Locally

↓

Validate Locally

↓

Deploy To Cloud

↓

Scale In Cloud
```

Cloud deployment shall require:

- Environment configuration changes
- Infrastructure provisioning
- Secret configuration
- Deployment configuration

Cloud deployment shall not require:

- Service redesign
- Contract redesign
- Workflow redesign
- Database redesign
- Application rewrites
- Runtime-specific business logic

---

# 13. Benefits

## Developer Benefits

- Faster onboarding
- Easier debugging
- Lower development cost
- Consistent development environments

---

## Architecture Benefits

- Runtime independence
- Environment consistency
- Cloud readiness
- Reduced deployment risk
- Easier maintainability

---

## Business Benefits

- Faster MVP delivery
- Reduced infrastructure spend
- Easier scaling
- Reduced operational risk

---

# 14. Governance

Before promotion to cloud deployment, every service must demonstrate:

- Successful local execution
- Successful containerization
- Successful Docker Compose deployment
- Successful dependency integration
- Successful automated testing

Any exception requires a new ADR.

---

# 15. Decision Outcome

The Scan2BIM Platform adopts a Local First, Cloud Ready Development Strategy.

All capabilities shall be designed, developed, tested, and validated locally while remaining deployable to Azure Kubernetes Service through configuration and infrastructure changes only.

The governing architecture principle is:

```text
Same Code
Same Containers
Same Contracts
Different Configuration
```