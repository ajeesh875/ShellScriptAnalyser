# Scan2BIM Bounded Contexts

Version: 1.1

Status: Accepted

Owner: Ajeesh Kumar A

Related Documents

- Vision.md
- ADR-001 Technology Constitution
- ADR-002 Local First Development Strategy
- ADR-003 Canonical Point Cloud Model
- DomainModel.md
- ServiceCatalog.md
- EventContracts.md
- APIContracts.md
- QueueContracts.md

---

# 1. Purpose

This document defines the authoritative bounded contexts of the Scan2BIM Platform.

It establishes:

- Business capability boundaries
- Domain ownership
- Service-alignment boundaries
- Command and event ownership
- API ownership
- Data ownership and isolation
- Permitted cross-context interactions

The objective is to allow each context to evolve independently while preserving the end-to-end Scan2BIM workflow.

---

# 2. Architecture Principles

The platform follows:

- Domain-Driven Design
- Microservice Architecture
- Event-Driven Architecture
- Ingestion-First Architecture
- Channel-Independent Ingestion
- Temporal-Orchestrated Processing
- Local-First, Cloud-Ready Delivery

Rules:

- Each bounded context owns its business capabilities, internal model, state, APIs, commands, and events.
- A context must not directly read or modify another context's database.
- Cross-context interaction shall occur only through approved APIs, commands, integration events, and Temporal workflow interactions.
- Commands request work from one owning context.
- Integration events report facts that have already occurred.
- Temporal owns durable orchestration and workflow state.
- Azure Service Bus transports approved cross-context commands and events.
- Large artifacts are exchanged by stable artifact references, not embedded message payloads.

---

# 3. Context Landscape

The platform contains:

- Project Context
- Ingestion Context
- Workflow Context
- Segmentation Context
- Geometry Context
- IFC Context
- Delivery Context

The Upload Portal is a client application, not a bounded context.

The Upload Portal communicates through approved APIs and never calls Temporal, Azure Service Bus, or processing services directly.

---

# 4. End-to-End Context Flow

```text
Upload Portal or Approved External Channel
    ↓
Ingestion Context
    ↓ CanonicalPointCloudCreated
Workflow Context
    ↓ StartSegmentation
Segmentation Context
    ↓ SegmentationCompleted
Workflow Context
    ↓ GenerateGeometry
Geometry Context
    ↓ GeometryGenerated
Workflow Context
    ↓ GenerateIFC
IFC Context
    ↓ IFCGenerated
Workflow Context
    ↓ ValidateIFC
IFC Context
    ↓ IFCValidationCompleted
Workflow Context
    ↓ PrepareArtifactDelivery
Delivery Context
    ↓ ArtifactReady
Workflow Context
    ↓ WorkflowCompleted
```

Processing contexts do not invoke the next processing context directly.

---

# 5. Project Context

## 5.1 Purpose

Owns the business organization of Scan2BIM work through Projects and Sites.

## 5.2 Owned Domain Objects

- Project
- Site

## 5.3 Responsibilities

- Project lifecycle management
- Site registration and lifecycle management
- Project and site metadata
- Customer or engagement grouping
- Business-level visibility and reporting projections

## 5.4 Public APIs

- Create, get, list, and update Projects
- Create, get, list, and update Sites

Detailed contracts are defined in `api-contracts.md`.

## 5.5 Published Events

- `ProjectCreated`
- `ProjectUpdated`
- `SiteCreated`
- `SiteUpdated`

## 5.6 Consumed Events

For reporting or visibility projections only:

- `IngestionRequested`
- `IngestionFailed`
- `WorkflowStarted`
- `WorkflowCompleted`
- `WorkflowFailed`
- `WorkflowCancelled`
- `ArtifactReady`
- `ArtifactDelivered`

Consumption does not transfer ownership of Ingestion Requests, Workflows, or Artifacts.

## 5.7 Does Not Own

- File ingestion
- Point cloud normalization
- Workflow orchestration
- Segmentation
- Geometry generation
- IFC generation or validation
- Artifact delivery

---

# 6. Ingestion Context

## 6.1 Purpose

Provides the single normalized entry point for point cloud data and creates the Canonical Point Cloud representation required by downstream processing.

## 6.2 Supported Channels

- Scan2BIM Upload Portal
- External Customer Portal
- REST API
- Webhook
- Bulk Upload Utility
- Future Automated Sources

## 6.3 Owned Domain Objects

- IngestionRequest
- PointCloudFile
- CanonicalPointCloud
- Source artifact registration metadata
- Canonical artifact registration metadata

## 6.4 Responsibilities

- Accept ingestion requests
- Create upload sessions
- Receive authenticated upload-completion notifications
- Validate file identity, size, checksum, format, and permitted source
- Register source files and storage references
- Execute source-format adapters
- Create and validate Canonical Point Cloud artifacts
- Track ingestion status and audit information
- Trigger workflow creation only after all required canonical artifacts are ready

## 6.5 Owned Adapters

- PLY Adapter
- PCD Adapter
- XYZ Adapter
- NPY Adapter
- E57 Adapter
- Future approved format adapters

## 6.6 Public APIs

- Ingestion Request APIs
- Point Cloud Upload Session APIs
- Point Cloud File Query APIs
- Upload Completion Webhook

## 6.7 Published Events

- `IngestionRequested`
- `PointCloudFileRegistered`
- `IngestionValidated`
- `CanonicalPointCloudCreated`
- `IngestionFailed`

## 6.8 Consumed Commands and Events

None for the MVP baseline.

## 6.9 Invariants

- Every source file belongs to an Ingestion Request.
- Canonicalization occurs only after source registration and validation.
- Workflow creation occurs only after all required canonical artifacts are created successfully.
- Source-format details do not leak into downstream processing contracts.

## 6.10 Does Not Own

- Temporal workflow execution
- AI inference
- Geometry generation
- IFC generation or validation
- Deliverable preparation

---

# 7. Workflow Context

## 7.1 Purpose

Owns durable orchestration and lifecycle management of the Scan2BIM processing workflow.

## 7.2 Owned Domain Objects

- Workflow
- WorkflowStage execution state
- Retry and cancellation state

## 7.3 Responsibilities

- Create workflows after canonical input readiness
- Maintain workflow and stage state
- Issue processing commands through Azure Service Bus
- Consume processing outcome events
- Apply Temporal retry, timeout, cancellation, and compensation policy
- Coordinate progression without implementing processing logic
- Complete the workflow when required deliverable artifacts are ready

## 7.4 Public APIs

- Get and list Workflows
- Get Workflow stages
- Request Workflow cancellation

## 7.5 Published Commands

- `StartSegmentation`
- `GenerateGeometry`
- `GenerateIFC`
- `ValidateIFC`
- `PrepareArtifactDelivery`

## 7.6 Published Events

- `WorkflowStarted`
- `WorkflowStageStarted`
- `WorkflowStageCompleted`
- `WorkflowRetried`
- `WorkflowCompleted`
- `WorkflowFailed`
- `WorkflowCancelled`

## 7.7 Consumed Events

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

## 7.8 Invariants

- Only the Workflow Context determines the next processing stage.
- Processing services do not command downstream processing services.
- Workflow completion depends on required `ArtifactReady` facts, not end-user download.
- `ArtifactDelivered` is an audit or consumption fact and does not block workflow completion.

## 7.9 Does Not Own

- Source file parsing
- Segmentation algorithms
- Geometry algorithms
- IFC generation or validation logic
- Artifact delivery implementation

---

# 8. Segmentation Context

## 8.1 Purpose

Owns semantic interpretation of Canonical Point Cloud data.

## 8.2 Owned Domain Objects

- SegmentationResult
- Segmentation result artifact metadata

## 8.3 Responsibilities

- Execute approved AI inference
- Perform semantic segmentation and object classification
- Generate labels and confidence metrics
- Persist Segmentation Result metadata
- Store segmentation artifacts through the approved artifact abstraction
- Report completion or failure

## 8.4 Consumed Commands

- `StartSegmentation`

## 8.5 Published Events

- `SegmentationCompleted`
- `SegmentationFailed`

## 8.6 Inputs and Outputs

Input:

- One or more Canonical Point Cloud artifact references

Output:

- SegmentationResult and its artifact reference

## 8.7 Invariants

- Original source formats are not parsed in this context.
- Runtime-specific model technology is not exposed in cross-context contracts.
- The context does not invoke Geometry processing directly.

## 8.8 Does Not Own

- Ingestion or canonicalization
- Workflow orchestration
- Geometry generation
- IFC generation
- Artifact delivery

---

# 9. Geometry Context

## 9.1 Purpose

Transforms Segmentation Results into structured, BIM-ready Geometry Models.

## 9.2 Owned Domain Objects

- GeometryModel
- Geometry artifact metadata

## 9.3 Responsibilities

- Extract object boundaries
- Reconstruct shapes
- Derive spatial relationships
- Validate geometry
- Produce BIM-ready Geometry Models and artifact references
- Report completion or failure

## 9.4 Consumed Commands

- `GenerateGeometry`

## 9.5 Published Events

- `GeometryGenerated`
- `GeometryGenerationFailed`

## 9.6 Inputs and Outputs

Input:

- SegmentationResult artifact reference
- Canonical artifact identifiers where required

Output:

- GeometryModel and geometry artifact reference

## 9.7 Invariants

- Source point cloud formats are not parsed in this context.
- The context does not perform semantic segmentation.
- The context does not invoke IFC generation directly.

## 9.8 Does Not Own

- Ingestion
- Workflow orchestration
- AI segmentation
- IFC generation or validation
- Artifact delivery

---

# 10. IFC Context

## 10.1 Purpose

Owns creation and validation of interoperable IFC Models from Geometry Models.

## 10.2 Owned Domain Objects

- IFCModel
- IFC output artifact metadata
- IFC validation result and report metadata

## 10.3 Responsibilities

- Generate IFC Models
- Apply the requested logical IFC schema and generation profile
- Validate generated IFC Models against the approved policy
- Produce validation reports
- Report generation and validation outcomes

## 10.4 Consumed Commands

- `GenerateIFC`
- `ValidateIFC`

## 10.5 Published Events

- `IFCGenerated`
- `IFCGenerationFailed`
- `IFCValidationCompleted`
- `IFCValidationFailed`

## 10.6 Inputs and Outputs

Inputs:

- GeometryModel and geometry artifact reference
- Generated IFC artifact for validation

Outputs:

- IFCModel
- IFC artifact reference
- IFC validation outcome and optional report artifact reference

## 10.7 Invariants

- `IFCGenerated` does not make an output delivery-ready.
- Delivery preparation follows a permitted validation result.
- The context does not invoke Delivery directly.

## 10.8 Does Not Own

- Ingestion
- Workflow orchestration
- Segmentation
- Geometry generation
- Artifact delivery and download authorization

---

# 11. Delivery Context

## 11.1 Purpose

Owns deliverable preparation, authorized access, and delivery tracking for generated outputs.

## 11.2 Owned Domain Objects

- DeliverableArtifact
- DownloadSession
- DeliveryRecord

`DeliverableArtifact` is the delivery view of an approved generated artifact. The producing context retains ownership of its processing result and artifact metadata.

## 11.3 Responsibilities

- Prepare validated outputs for delivery
- Publish artifact readiness
- Expose artifact metadata APIs
- Create short-lived authorized download sessions
- Track actual delivery or retrieval where required
- Notify readiness, delivery, and delivery failure

## 11.4 Public APIs

- Get Artifact metadata
- List Workflow Artifacts
- Create Download Session

## 11.5 Consumed Commands

- `PrepareArtifactDelivery`

## 11.6 Published Events

- `ArtifactReady`
- `ArtifactDelivered`
- `ArtifactDeliveryFailed`

## 11.7 Inputs and Outputs

Input:

- Successfully validated IFCModel artifact reference

Outputs:

- DeliverableArtifact
- DownloadSession
- DeliveryRecord

## 11.8 Invariants

- `ArtifactReady` is distinct from `ArtifactDelivered`.
- Creating a download session does not by itself prove delivery.
- Download authorization and storage access are short-lived and least-privileged.
- The context does not alter generated IFC content.

## 11.9 Does Not Own

- Source ingestion
- Workflow orchestration
- Segmentation
- Geometry generation
- IFC generation or validation

---

# 12. Context Interaction Matrix

```text
Project → Ingestion
    Project and Site identifiers through approved APIs

Ingestion → Workflow
    CanonicalPointCloudCreated and IngestionFailed events

Workflow → Segmentation
    StartSegmentation command

Segmentation → Workflow
    SegmentationCompleted or SegmentationFailed event

Workflow → Geometry
    GenerateGeometry command

Geometry → Workflow
    GeometryGenerated or GeometryGenerationFailed event

Workflow → IFC
    GenerateIFC and ValidateIFC commands

IFC → Workflow
    IFCGenerated, IFCGenerationFailed,
    IFCValidationCompleted, or IFCValidationFailed event

Workflow → Delivery
    PrepareArtifactDelivery command

Delivery → Workflow
    ArtifactReady or ArtifactDeliveryFailed event

Delivery → Project Projection
    ArtifactReady or ArtifactDelivered event
```

---

# 13. Data and Artifact Ownership Rules

- Each context owns its operational state in PostgreSQL.
- Direct cross-context database access is prohibited.
- Each producing context owns the metadata for the processing result it creates.
- Large files are stored through the approved Blob Storage abstraction.
- Cross-context messages carry stable artifact references, not embedded files.
- Delivery owns delivery-facing artifact availability, download sessions, and delivery records.
- Redis is not a system of record.

---

# 14. API, Command, and Event Ownership

```text
Project Context
    APIs: Projects and Sites
    Events: ProjectCreated, ProjectUpdated, SiteCreated, SiteUpdated

Ingestion Context
    APIs: Ingestion Requests, Upload Sessions, Point Cloud Files, Upload Webhook
    Events: IngestionRequested, PointCloudFileRegistered,
            IngestionValidated, CanonicalPointCloudCreated, IngestionFailed

Workflow Context
    APIs: Workflow query, stage query, cancellation
    Commands: StartSegmentation, GenerateGeometry, GenerateIFC,
              ValidateIFC, PrepareArtifactDelivery
    Events: WorkflowStarted, WorkflowStageStarted,
            WorkflowStageCompleted, WorkflowRetried,
            WorkflowCompleted, WorkflowFailed, WorkflowCancelled

Segmentation Context
    Command: StartSegmentation
    Events: SegmentationCompleted, SegmentationFailed

Geometry Context
    Command: GenerateGeometry
    Events: GeometryGenerated, GeometryGenerationFailed

IFC Context
    Commands: GenerateIFC, ValidateIFC
    Events: IFCGenerated, IFCGenerationFailed,
            IFCValidationCompleted, IFCValidationFailed

Delivery Context
    APIs: Artifact metadata, workflow artifacts, download sessions
    Command: PrepareArtifactDelivery
    Events: ArtifactReady, ArtifactDelivered, ArtifactDeliveryFailed
```

---

# 15. Microservice Alignment

```text
Project Context       → project-service
Ingestion Context     → ingestion-service
Workflow Context      → workflow-service
Segmentation Context  → segmentation-service
Geometry Context      → geometry-service
IFC Context           → ifc-service
Delivery Context      → delivery-service
```

The Upload Portal remains a separate client application.

For MVP deployment, services may share deployment infrastructure, but source-code boundaries, ownership, contracts, and data access rules must remain isolated.

---

# 16. Local-First and Cloud Compatibility

All contexts and service interactions must operate locally through Docker Compose and deploy to AKS without redesign.

The same logical APIs, commands, events, identifiers, and ownership rules apply in both environments.

Local infrastructure adapters may replace cloud infrastructure only through configuration.

---

# 17. Governance

Architecture review is required for:

- Adding, removing, merging, or splitting a bounded context
- Moving domain ownership between contexts
- Adding direct database sharing
- Adding a cross-context API, command, or event
- Allowing a processing service to invoke the next stage directly
- Allowing a portal to call Temporal, Azure Service Bus, or a processing service directly
- Moving source-format parsing outside Ingestion
- Moving orchestration logic outside Workflow

---

# 18. Decision Outcome

The Scan2BIM Platform adopts the bounded contexts, ownership rules, and interaction model defined in this document.

All services, APIs, commands, events, schemas, workflows, and AI-generated code shall align with these boundaries.
