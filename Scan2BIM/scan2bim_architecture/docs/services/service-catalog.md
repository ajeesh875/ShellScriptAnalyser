# Scan2BIM Service Catalog

Version: 1.1

Status: Accepted

Owner: Ajeesh Kumar A

Related Documents

- Vision.md
- ADR-001 Technology Constitution
- ADR-002 Local First Development Strategy
- ADR-003 Canonical Point Cloud Model
- DomainModel.md
- BoundedContexts.md
- EventContracts.md
- APIContracts.md
- QueueContracts.md

---

# 1. Purpose

This document is the authoritative catalog of Scan2BIM client applications and backend services.

It defines:

- Service purpose and bounded-context alignment
- Owned domain objects and operational state
- Public APIs
- Published and consumed commands
- Published and consumed integration events
- Inputs, outputs, dependencies, and exclusions
- Runtime, data, security, observability, and deployment expectations

---

# 2. Service Landscape

## Client Application

- `upload-portal`

## Backend Services

- `project-service`
- `ingestion-service`
- `workflow-service`
- `segmentation-service`
- `geometry-service`
- `ifc-service`
- `delivery-service`

## Platform Dependencies

- Temporal
- Azure Service Bus
- PostgreSQL
- Redis
- Azure Blob Storage or Azurite
- OpenTelemetry-compatible telemetry pipeline

Platform dependencies are not business services or bounded contexts.

---

# 3. End-to-End Service Flow

```text
upload-portal or approved external client
    ↓ API
project-service and ingestion-service
    ↓ CanonicalPointCloudCreated event
workflow-service and Temporal
    ↓ StartSegmentation command
segmentation-service
    ↓ SegmentationCompleted event
workflow-service
    ↓ GenerateGeometry command
geometry-service
    ↓ GeometryGenerated event
workflow-service
    ↓ GenerateIFC command
ifc-service
    ↓ IFCGenerated event
workflow-service
    ↓ ValidateIFC command
ifc-service
    ↓ IFCValidationCompleted event
workflow-service
    ↓ PrepareArtifactDelivery command
delivery-service
    ↓ ArtifactReady event
workflow-service
    ↓ WorkflowCompleted event
```

No processing service dispatches the next processing stage directly.

---

# 4. upload-portal

## Type

Client Application

## Purpose

Provides a lightweight web experience for submitting point cloud files, monitoring processing, and obtaining generated outputs.

## Technology Stack

- React
- TypeScript
- Vite
- TanStack Query
- Axios

## Responsibilities

- Query Projects and Sites where required
- Create Ingestion Requests
- Create one upload session per point cloud file
- Upload files through approved short-lived storage endpoints
- Display ingestion and workflow status
- List ready artifacts
- Request authorized download sessions

## Integrates Through

- `project-service` APIs
- `ingestion-service` APIs and upload flow
- `workflow-service` query APIs
- `delivery-service` artifact APIs

## Must Not

- Own business or workflow state
- Call Temporal directly
- Publish Azure Service Bus commands or events
- Call segmentation, geometry, or IFC services directly
- Store permanent storage credentials
- Treat upload completion as workflow completion

---

# 5. project-service

## Bounded Context

Project Context

## Purpose

Manages Projects and Sites and provides business-level organization and visibility.

## Owns

- Project
- Site
- Project and Site operational state
- Business reporting projections owned by Project Context

## Responsibilities

- Create, retrieve, list, and update Projects
- Create, retrieve, list, and update Sites
- Validate Project and Site lifecycle rules
- Maintain business-level visibility projections

## Public APIs

```text
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/{projectId}
PATCH  /api/v1/projects/{projectId}
POST   /api/v1/projects/{projectId}/sites
GET    /api/v1/projects/{projectId}/sites
GET    /api/v1/sites/{siteId}
PATCH  /api/v1/sites/{siteId}
```

## Publishes Events

- `ProjectCreated`
- `ProjectUpdated`
- `SiteCreated`
- `SiteUpdated`

## Consumes Events

For visibility projections only:

- `IngestionRequested`
- `IngestionFailed`
- `WorkflowStarted`
- `WorkflowCompleted`
- `WorkflowFailed`
- `WorkflowCancelled`
- `ArtifactReady`
- `ArtifactDelivered`

## Does Not Own

- Ingestion Requests
- Workflows
- Processing results
- Deliverable preparation

---

# 6. ingestion-service

## Bounded Context

Ingestion Context

## Purpose

Provides the single channel-independent entry point for point cloud files and creates Canonical Point Cloud artifacts.

## Owns

- IngestionRequest
- PointCloudFile
- CanonicalPointCloud
- Source and canonical artifact registration metadata
- UploadSession

## Responsibilities

- Accept ingestion requests
- Create upload sessions
- Handle authenticated upload-completion callbacks
- Validate source files and metadata
- Register source artifacts
- Execute source-format adapters
- Create Canonical Point Cloud artifacts
- Track ingestion status and audit state
- Determine complete canonical readiness and publish the authoritative canonical artifact facts only after all required artifacts are ready.

## Supported Channels

- Upload Portal
- External Customer Portal
- REST API
- Webhook
- Bulk Upload Utility
- Future Automated Sources

## Owned Adapters

- PLY Adapter
- PCD Adapter
- XYZ Adapter
- NPY Adapter
- E57 Adapter
- Future approved format adapters

## Public APIs

```text
POST   /api/v1/ingestion-requests
GET    /api/v1/ingestion-requests
GET    /api/v1/ingestion-requests/{ingestionRequestId}
GET    /api/v1/ingestion-requests/{ingestionRequestId}/files
POST   /api/v1/ingestion-requests/{ingestionRequestId}/files
GET    /api/v1/point-cloud-files/{pointCloudFileId}
POST   /api/v1/webhooks/ingestion/upload-completed
```

## Publishes Events

- `IngestionRequested`
- `PointCloudFileRegistered`
- `IngestionValidated`
- `CanonicalPointCloudCreated`
- `IngestionFailed`

## Consumes Commands and Events

None for the MVP baseline.

## Does Not Own

- Workflow execution
- AI model execution
- Geometry generation
- IFC generation or validation
- Deliverable preparation

---

# 7. workflow-service

## Bounded Context

Workflow Context

## Purpose

Coordinates the durable Scan2BIM processing lifecycle using Temporal.

## Owns

- Workflow
- WorkflowStage execution state
- Retry, cancellation, and completion state

## Responsibilities

- Consume canonical artifact facts, verify complete readiness through approved Ingestion APIs, and create the Temporal workflow idempotently.
- Maintain workflow and stage status
- Apply Temporal retry, timeout, cancellation, and compensation policy
- Publish processing commands to Azure Service Bus
- Consume processing outcome events
- Signal or update Temporal workflows from consumed events
- Complete the workflow after required artifacts become ready

## Public APIs

```text
GET    /api/v1/workflows
GET    /api/v1/workflows/{workflowId}
GET    /api/v1/workflows/{workflowId}/stages
POST   /api/v1/workflows/{workflowId}/cancellation
```

## Publishes Commands

- `StartSegmentation`
- `GenerateGeometry`
- `GenerateIFC`
- `ValidateIFC`
- `PrepareArtifactDelivery`

## Publishes Events

- `WorkflowStarted`
- `WorkflowStageStarted`
- `WorkflowStageCompleted`
- `WorkflowRetried`
- `WorkflowCompleted`
- `WorkflowFailed`
- `WorkflowCancelled`

## Consumes Events

- `CanonicalPointCloudCreated`
- `IngestionFailed`
- `SegmentationCompleted`
- `SegmentationFailed`
- `GeometryGenerated`
- `GeometryGenerationFailed`
- `IFCGenerated`
- `IFCGenerationFailed`
- `IFCValidationCompleted`
- `IFCValidationFailed`
- `ArtifactReady`
- `ArtifactDeliveryFailed`

## Does Not Own

- Source parsing or canonicalization
- Segmentation logic
- Geometry logic
- IFC generation or validation logic
- Artifact delivery implementation

---

# 8. segmentation-service

## Bounded Context

Segmentation Context

## Purpose

Performs semantic interpretation of Canonical Point Cloud inputs.

## Owns

- SegmentationResult
- Segmentation result artifact metadata

## Responsibilities

- Consume and validate `StartSegmentation`
- Retrieve authorized canonical artifacts
- Execute approved AI inference
- Generate semantic labels and confidence metrics
- Persist result metadata and artifact references
- Publish completion or failure
- Enforce command idempotency

## Consumes Commands

- `StartSegmentation`

## Publishes Events

- `SegmentationCompleted`
- `SegmentationFailed`

## Inputs

- One or more Canonical Point Cloud artifact references

## Outputs

- SegmentationResult and artifact reference

## Does Not Own

- Original format parsing
- Workflow orchestration
- Geometry generation
- IFC generation
- Deliverable preparation

---

# 9. geometry-service

## Bounded Context

Geometry Context

## Purpose

Creates BIM-ready Geometry Models from Segmentation Results.

## Owns

- GeometryModel
- Geometry artifact metadata

## Responsibilities

- Consume and validate `GenerateGeometry`
- Retrieve Segmentation Result artifacts
- Extract boundaries and spatial relationships
- Reconstruct and validate geometry
- Persist Geometry Model metadata and artifact references
- Publish completion or failure
- Enforce command idempotency

## Consumes Commands

- `GenerateGeometry`

## Publishes Events

- `GeometryGenerated`
- `GeometryGenerationFailed`

## Inputs

- SegmentationResult artifact reference
- Canonical artifact identifiers where required

## Outputs

- GeometryModel and geometry artifact reference

## Does Not Own

- Source parsing
- Workflow orchestration
- AI segmentation
- IFC generation
- Deliverable preparation

---

# 10. ifc-service

## Bounded Context

IFC Context

## Purpose

Generates and validates IFC Models from Geometry Models.

## Owns

- IFCModel
- IFC artifact metadata
- IFC validation outcome and report metadata

## Responsibilities

- Consume and validate `GenerateIFC`
- Generate IFC according to an approved logical schema and profile
- Publish generation outcome
- Consume and validate `ValidateIFC`
- Validate generated IFC against the approved policy
- Produce validation report references
- Publish validation outcome
- Enforce command idempotency

## Consumes Commands

- `GenerateIFC`
- `ValidateIFC`

## Publishes Events

- `IFCGenerated`
- `IFCGenerationFailed`
- `IFCValidationCompleted`
- `IFCValidationFailed`

## Inputs

- GeometryModel and geometry artifact reference
- Generated IFC artifact reference for validation

## Outputs

- IFCModel and IFC artifact reference
- IFC validation result and optional report artifact reference

## Does Not Own

- Source parsing
- Workflow orchestration
- Segmentation
- Geometry generation
- Delivery and download authorization

---

# 11. delivery-service

## Bounded Context

Delivery Context

## Purpose

Prepares validated outputs for authorized access and tracks delivery activity.

## Owns

- DeliverableArtifact
- DownloadSession
- DeliveryRecord

## Responsibilities

- Consume and validate `PrepareArtifactDelivery`
- Verify permitted IFC validation outcomes
- Create the delivery-facing artifact record
- Publish artifact readiness
- Expose artifact metadata and workflow artifact APIs
- Create short-lived authorized download sessions
- Record actual delivery or retrieval where required
- Enforce command and API idempotency

## Public APIs

```text
GET    /api/v1/artifacts/{artifactId}
GET    /api/v1/workflows/{workflowId}/artifacts
POST   /api/v1/artifacts/{artifactId}/download-sessions
```

## Consumes Commands

- `PrepareArtifactDelivery`

## Publishes Events

- `ArtifactReady`
- `ArtifactDelivered`
- `ArtifactDeliveryFailed`

## Inputs

- Successfully validated IFCModel artifact reference

## Outputs

- DeliverableArtifact
- Authorized DownloadSession
- DeliveryRecord

## Does Not Own

- Ingestion
- Workflow orchestration
- Segmentation
- Geometry generation
- IFC generation or validation

---

# 12. Command Ownership Matrix

```text
StartSegmentation
    Producer: workflow-service
    Consumer: segmentation-service

GenerateGeometry
    Producer: workflow-service
    Consumer: geometry-service

GenerateIFC
    Producer: workflow-service
    Consumer: ifc-service

ValidateIFC
    Producer: workflow-service
    Consumer: ifc-service

PrepareArtifactDelivery
    Producer: workflow-service
    Consumer: delivery-service
```

Only `workflow-service` may issue MVP processing commands.

---

# 13. Event Ownership Matrix

```text
project-service
    ProjectCreated
    ProjectUpdated
    SiteCreated
    SiteUpdated

ingestion-service
    IngestionRequested
    PointCloudFileRegistered
    IngestionValidated
    CanonicalPointCloudCreated
    IngestionFailed

workflow-service
    WorkflowStarted
    WorkflowStageStarted
    WorkflowStageCompleted
    WorkflowRetried
    WorkflowCompleted
    WorkflowFailed
    WorkflowCancelled

segmentation-service
    SegmentationCompleted
    SegmentationFailed

geometry-service
    GeometryGenerated
    GeometryGenerationFailed

ifc-service
    IFCGenerated
    IFCGenerationFailed
    IFCValidationCompleted
    IFCValidationFailed

delivery-service
    ArtifactReady
    ArtifactDelivered
    ArtifactDeliveryFailed
```

Only the owning service publishes the authoritative event.

---

# 14. API Ownership Matrix

```text
project-service
    Project and Site APIs

ingestion-service
    Ingestion Request, Point Cloud File,
    Upload Session, and Upload Completion Webhook APIs

workflow-service
    Workflow query, stage query, and cancellation APIs

delivery-service
    Artifact metadata, workflow artifact,
    and download session APIs

segmentation-service
    No public business API in MVP

geometry-service
    No public business API in MVP

ifc-service
    No public business API in MVP
```

Processing services are invoked through Temporal-orchestrated commands.

---

# 15. Data Ownership and Persistence

- Each backend service owns its PostgreSQL operational state.
- Direct database sharing and cross-service table access are prohibited.
- Redis may be used only for cache or temporary state.
- Large artifacts are stored in Blob Storage or Azurite through an approved abstraction.
- Producers own metadata for processing results they create.
- Delivery owns delivery-facing availability, download sessions, and delivery records.
- Services exchange artifact references rather than binary content.

---

# 16. Runtime and Technology Standards

Backend services shall use:

- Python 3.12+
- FastAPI for owned HTTP APIs
- Pydantic for API, command, and event validation
- PostgreSQL as system of record
- Redis only for cache and temporary state
- Temporal for durable workflow orchestration
- Azure Service Bus for cross-context asynchronous transport
- Azure Blob Storage or Azurite for large artifacts
- OpenTelemetry-compatible observability

All services must run locally through Docker Compose and deploy to AKS without code redesign.

---

# 17. Reliability Requirements

Every command consumer must support:

- At-least-once delivery
- Command idempotency
- Explicit message settlement
- Bounded retry behavior
- Dead-letter handling
- Processing deadlines
- Correlation, causation, and trace propagation
- Reliable event publication after owned state is committed

Processing services report outcomes through integration events and do not call the next processing service directly.

---

# 18. Security Requirements

- Service identities use least-privilege access.
- Portals cannot access Temporal or Azure Service Bus directly.
- Command queues authorize only approved senders and receivers.
- Storage references must not contain persistent credentials.
- Upload and download access must be short-lived and scoped.
- Secrets, tokens, keys, and connection strings must not appear in messages or logs.
- Authorization is enforced by the owning service.

---

# 19. Observability Requirements

Each service shall emit OpenTelemetry-compatible:

- Traces
- Metrics
- Structured logs

Relevant identifiers shall include, where applicable:

- correlationId
- causationId
- traceId
- ingestionRequestId
- workflowId
- projectId
- siteId
- commandId
- eventId
- subjectId
- artifactId

Sensitive payloads, access URLs, authorization headers, and large message bodies must not be logged.

---

# 20. Health and Deployment Requirements

Each deployable backend service shall expose:

```text
GET /health/live
GET /health/ready
```

Each service shall provide:

- Container image
- Docker Compose configuration
- Environment-based configuration
- Automated tests
- OpenTelemetry integration
- Terraform-supported cloud dependencies
- GitHub Actions build and deployment support

For MVP, contexts may share deployment infrastructure, but ownership and code boundaries must remain intact.

---

# 21. Service Boundary Rules

- Source-format parsing belongs only to `ingestion-service`.
- Temporal orchestration belongs only to `workflow-service`.
- AI segmentation belongs only to `segmentation-service`.
- Geometry generation belongs only to `geometry-service`.
- IFC generation and validation belong only to `ifc-service`.
- Delivery preparation and download authorization belong only to `delivery-service`.
- Business Project and Site ownership belongs only to `project-service`.
- No service may directly mutate another service's state.
- No processing service may dispatch the next processing stage.

---

# 22. Local-First and Cloud Compatibility

The same service boundaries, APIs, commands, events, schemas, and ownership rules apply locally and in Azure.

The following principle is mandatory:

```text
Same Code
Same Containers
Same Contracts
Different Configuration
```

---

# 23. Governance

Architecture review is required for:

- Adding or removing a service
- Merging or splitting service ownership
- Introducing direct database sharing
- Introducing a new cross-context API, command, or event
- Giving a portal direct access to processing services
- Moving orchestration outside `workflow-service`
- Moving source parsing outside `ingestion-service`
- Adding runtime-specific information to cross-context contracts

---

# 24. Decision Outcome

The Scan2BIM Platform adopts the services, ownership boundaries, public APIs, commands, events, and operational requirements defined in this catalog.

All service specifications, schemas, workflows, infrastructure, and implementation code shall align with this document.
