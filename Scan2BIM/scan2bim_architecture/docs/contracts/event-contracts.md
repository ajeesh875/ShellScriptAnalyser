# Scan2BIM Event Contracts

Version: 1.0

Status: Accepted

Owner: Ajeesh Kumar A

Related Documents

- Vision.md
- ADR-001 Technology Constitution
- ADR-002 Local First Development Strategy
- ADR-003 Canonical Point Cloud Model
- DomainModel.md
- BoundedContexts.md
- ServiceCatalog.md

---

# 1. Purpose

This document defines the integration event contracts used by the Scan2BIM Platform.

It establishes:

- Event naming and ownership
- The standard event envelope
- Event-specific payload expectations
- Correlation and traceability requirements
- Artifact and error references
- Versioning and compatibility rules
- Idempotency, ordering, retry, replay, and dead-letter principles
- Security, privacy, observability, and validation rules
- Local and cloud contract consistency

These contracts are the authoritative definitions for facts published between Scan2BIM bounded contexts.

---

# 2. Scope

This document defines integration events published after a meaningful business or processing fact has occurred.

Examples include:

- An ingestion request was accepted.
- A source point cloud file was registered.
- Ingestion validation completed successfully.
- A canonical point cloud was created.
- A workflow started, completed, failed, or was cancelled.
- Segmentation completed or failed.
- Geometry generation completed or failed.
- IFC generation or validation completed or failed.
- An artifact became ready or was delivered.

This document does not define:

- REST API request or response contracts
- Azure Service Bus queue, topic, subscription, or session names
- Processing commands
- Temporal workflow or activity input models
- Database schemas
- Physical canonical point cloud schemas
- Internal in-process events
- User interface state models
- Retry counts, lock duration, time-to-live, or dead-letter thresholds

Those concerns are defined separately in:

- `api-contracts.md`
- `queue-contracts.md`
- `workflow-contracts.md`
- `contracts/schemas/`

---

# 3. Event and Command Distinction

An event describes a fact that has already occurred.

Examples:

- `IngestionValidated`
- `CanonicalPointCloudCreated`
- `SegmentationCompleted`
- `IFCGenerated`

A command requests that an action be performed.

Examples:

- `StartSegmentation`
- `GenerateGeometry`
- `GenerateIFC`
- `PrepareArtifactDelivery`

Commands are not events and are not defined in this document.

Commands shall be defined in `queue-contracts.md` and workflow interaction specifications.

Integration event names must use PascalCase and past tense.

---

# 4. Processing and Delivery Lifecycle

The authoritative MVP lifecycle is:

```text
IngestionRequested
    ↓
PointCloudFileRegistered
    ↓
IngestionValidated
    ↓
CanonicalPointCloudCreated
    ↓
WorkflowStarted
    ↓
SegmentationCompleted
    ↓
GeometryGenerated
    ↓
IFCGenerated
    ↓
IFCValidationCompleted
    ↓
ArtifactReady
    ↓
WorkflowCompleted
```

Failure events may terminate, pause, or trigger retry of the associated stage according to workflow policy.

`ArtifactReady` means the output is available for authorized retrieval.

`ArtifactDelivered` means an actual delivery or retrieval action completed. Workflow completion shall not wait indefinitely for a user to download an artifact.

For ingestion requests containing multiple files, workflow initiation shall occur only after all required source files have been registered, validated, and converted into the required canonical artifacts.

---

# 5. Event Design Principles

## 5.1 Events Represent Facts

An event represents a completed, failed, cancelled, or otherwise finalized state transition.

Events must not represent an instruction or future action.

## 5.2 Events Are Immutable

Published events must not be modified.

A correction must be represented by a new event.

## 5.3 Events Are Independently Processable

An event must contain sufficient identity, correlation, and reference information for an authorized consumer to process it without accessing the producer's internal database.

## 5.4 Events Remain Small

Point clouds, segmentation outputs, geometry models, images, validation reports, and IFC files must not be embedded in integration events.

Events shall contain identifiers and artifact references only.

## 5.5 Events Are Source-Format Independent

Events must not assume E57 or any other source format as the internal processing representation.

`sourceFormat` may be retained for traceability, but downstream behavior must use canonical artifacts.

## 5.6 Events Are Channel Independent

Events must not depend on whether ingestion originated from:

- Scan2BIM Upload Portal
- External Customer Portal
- REST API
- Webhook
- Bulk Upload Utility
- Future Automated Source

`sourceChannel` may be recorded for audit and traceability only.

## 5.7 Events Are Idempotently Consumable

Consumers must safely handle duplicate delivery by using `eventId` or an approved business idempotency key.

## 5.8 Events Are Traceable

Events shall propagate correlation, causation, workflow, and OpenTelemetry trace identifiers when applicable.

## 5.9 Logical Contracts Are Transport Neutral

The logical event name, envelope, payload, and versioning rules must remain identical across local messaging and Azure Service Bus.

---

# 6. Standard Event Envelope

Every Scan2BIM integration event shall use this logical envelope:

```json
{
  "eventId": "uuid",
  "eventType": "CanonicalPointCloudCreated",
  "eventVersion": "1.0",
  "occurredAt": "2026-08-20T10:30:00Z",
  "producer": "ingestion-service",
  "correlationId": "uuid",
  "causationId": "uuid-or-null",
  "traceId": "trace-identifier-or-null",
  "ingestionRequestId": "uuid-or-null",
  "workflowId": "workflow-identifier-or-null",
  "projectId": "uuid-or-null",
  "siteId": "uuid-or-null",
  "subjectId": "uuid",
  "subjectType": "CanonicalPointCloud",
  "data": {},
  "metadata": {}
}
```

---

# 7. Standard Envelope Fields

## 7.1 eventId

Globally unique identifier for the event occurrence.

Required: Yes

Rules:

- Must be immutable.
- Must be used for event-level deduplication.
- Republishing the same logical event after a transport failure must retain the same `eventId`.
- A new business occurrence must receive a new `eventId`.

## 7.2 eventType

Stable PascalCase event name describing an occurred fact.

Required: Yes

## 7.3 eventVersion

Version of the event contract.

Required: Yes

Initial value: `1.0`

## 7.4 occurredAt

UTC timestamp when the represented fact occurred.

Required: Yes

Format: ISO 8601 UTC

## 7.5 producer

Logical service that owns and publishes the event.

Required: Yes

## 7.6 correlationId

Identifier correlating all work in the same end-to-end business flow.

Required: Yes

The value must be propagated unchanged across services.

## 7.7 causationId

Identifier of the command or preceding event that directly caused the current event.

Required:

- No for initial entry events
- Yes when a direct triggering message exists

## 7.8 traceId

Distributed tracing identifier aligned with OpenTelemetry propagation.

Required when an active trace exists.

`traceId` does not replace `correlationId`.

## 7.9 ingestionRequestId

Identifier of the originating ingestion request.

Required for ingestion and downstream Scan2BIM processing events.

## 7.10 workflowId

Identifier of the active Scan2BIM workflow execution.

Required for events occurring after workflow creation.

May be null for pre-workflow ingestion events.

## 7.11 projectId

Identifier of the owning project.

Required when the flow is associated with a project.

## 7.12 siteId

Identifier of the physical site.

Required when the flow is associated with a site.

## 7.13 subjectId

Identifier of the primary domain object represented by the event.

Required: Yes

## 7.14 subjectType

Type of the primary domain object.

Required: Yes

Approved initial values:

- `Project`
- `Site`
- `IngestionRequest`
- `PointCloudFile`
- `CanonicalPointCloud`
- `Workflow`
- `SegmentationResult`
- `GeometryModel`
- `IFCModel`
- `Artifact`

## 7.15 data

Event-specific business payload.

Required: Yes

The payload must not expose producer database structures or contain binary artifacts, credentials, or access tokens.

## 7.16 metadata

Optional cross-cutting metadata.

Approved initial fields may include:

- `sourceChannel`
- `environment`
- `modelVersion`
- `adapterVersion`

Consumer business logic must not depend on undeclared metadata.

Multitenancy metadata shall not be introduced until multitenancy is formally modeled.

---

# 8. Common Artifact Reference

Events that reference stored artifacts shall use this logical structure:

```json
{
  "artifactId": "uuid",
  "artifactType": "CANONICAL_POINT_CLOUD",
  "fileName": "canonical-point-cloud",
  "contentType": "application/octet-stream",
  "storageReference": "logical-storage-reference",
  "checksumAlgorithm": "SHA256",
  "checksum": "checksum-value",
  "sizeBytes": 123456,
  "version": "1.0"
}
```

Rules:

- `storageReference` must be a stable logical reference and must not contain credentials.
- Expiring URLs must not be used as permanent identifiers.
- Large artifact content must not be embedded in the event.
- Access to the referenced artifact must use approved authorization mechanisms.
- The final schema shall be defined under `contracts/schemas/common/`.

---

# 9. Common Error Contract

Failure events shall use this logical structure:

```json
{
  "errorCode": "SEGMENTATION_EXECUTION_FAILED",
  "errorCategory": "PROCESSING",
  "message": "Segmentation processing failed.",
  "retryable": true,
  "failedStage": "SEGMENTATION",
  "attempt": 1,
  "detailsReference": "diagnostic-reference-or-null"
}
```

Rules:

- `errorCode` must be stable and machine-readable.
- `message` must be safe for operational display.
- `retryable` indicates whether automated retry may be attempted.
- Stack traces, credentials, tokens, and sensitive infrastructure details are prohibited.
- Detailed diagnostics belong in secured telemetry or a diagnostic artifact.

---

# 10. Project Context Events

## 10.1 ProjectCreated

Producer: `project-service`

Subject Type: `Project`

Meaning: A project was created.

Required Data:

```json
{
  "projectId": "uuid",
  "projectName": "project-name",
  "status": "ACTIVE"
}
```

## 10.2 ProjectUpdated

Producer: `project-service`

Subject Type: `Project`

Meaning: Project business information was updated.

Required Data:

```json
{
  "projectId": "uuid",
  "changedFields": ["projectName"],
  "status": "ACTIVE"
}
```

Rules:

- Complete record snapshots should not be published unless formally required.
- Sensitive customer information must not be included unnecessarily.

## 10.3 SiteCreated

Producer: `project-service`

Subject Type: `Site`

Meaning: A site was registered under a project.

Required Data:

```json
{
  "siteId": "uuid",
  "projectId": "uuid",
  "siteName": "site-name",
  "siteType": "TELECOM_SHELTER"
}
```

## 10.4 SiteUpdated

Producer: `project-service`

Subject Type: `Site`

Meaning: Site business information was updated.

Required Data:

```json
{
  "siteId": "uuid",
  "projectId": "uuid",
  "changedFields": ["siteName"]
}
```

---

# 11. Ingestion Context Events

## 11.1 IngestionRequested

Producer: `ingestion-service`

Subject Type: `IngestionRequest`

Meaning: An ingestion request was accepted by the Ingestion Context.

Potential Consumers:

- `project-service`
- Audit projections

Required Data:

```json
{
  "sourceChannel": "UPLOAD_PORTAL",
  "sourceReference": "external-reference-or-null",
  "requestedFileCount": 1,
  "requestedBy": "requester-reference-or-null"
}
```

Rules:

- This event does not mean that files are valid.
- This event does not start downstream processing.

## 11.2 PointCloudFileRegistered

Producer: `ingestion-service`

Subject Type: `PointCloudFile`

Meaning: A source point cloud file was registered and stored as a traceable artifact.

Potential Consumers:

- Audit projections

Required Data:

```json
{
  "pointCloudFileId": "uuid",
  "sourceFormat": "PLY",
  "originalFileName": "scan.ply",
  "artifact": {
    "artifactId": "uuid",
    "artifactType": "SOURCE_POINT_CLOUD",
    "fileName": "scan.ply",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  }
}
```

## 11.3 IngestionValidated

Producer: `ingestion-service`

Subject Type: `IngestionRequest`

Meaning: The ingestion request and its registered source files passed ingestion validation.

Potential Consumers:

- Audit projections

Required Data:

```json
{
  "validationStatus": "VALID",
  "pointCloudFileIds": ["uuid"],
  "validatedAt": "2026-08-20T10:30:00Z"
}
```

Rules:

- Canonical normalization shall occur only after source file registration and ingestion validation.
- Workflow creation shall occur only after all required canonical point cloud artifacts have been created successfully.

## 11.4 CanonicalPointCloudCreated

Producer: `ingestion-service`

Subject Type: `CanonicalPointCloud`

Meaning: One registered source point cloud was normalized into the Canonical Point Cloud Model.

Potential Consumers:

- `workflow-service`
- Audit projections

Required Data:

```json
{
  "pointCloudFileId": "uuid",
  "canonicalArtifactId": "uuid",
  "sourceFormat": "PLY",
  "adapterName": "ply-adapter",
  "adapterVersion": "1.0",
  "canonicalModelVersion": "1.0",
  "validationStatus": "VALID",
  "pointCount": 1000000,
  "availableAttributes": ["POSITION", "COLOR", "SEMANTIC_LABEL"],
  "artifact": {
    "artifactId": "uuid",
    "artifactType": "CANONICAL_POINT_CLOUD",
    "fileName": "canonical-point-cloud",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  }
}
```

Rules:

- `sourceFormat` is retained for traceability only.
- Consumers must use the canonical artifact.
- The physical canonical serialization is not defined by this contract.

## 11.5 IngestionFailed

Producer: `ingestion-service`

Subject Type: `IngestionRequest`

Meaning: The ingestion request failed before successful canonical processing.

Potential Consumers:

- `project-service`
- Operational monitoring projections

Required Data:

```json
{
  "pointCloudFileId": "uuid-or-null",
  "stage": "VALIDATION",
  "error": {
    "errorCode": "UNSUPPORTED_POINT_CLOUD_FORMAT",
    "errorCategory": "INGESTION",
    "message": "The point cloud format is not supported.",
    "retryable": false,
    "failedStage": "INGESTION_VALIDATION",
    "attempt": 1,
    "detailsReference": null
  }
}
```

---

# 12. Workflow Context Events

## 12.1 WorkflowStarted

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: A Scan2BIM workflow execution started after the required canonical artifacts became available.

Potential Consumers:

- `project-service`
- Status projections
- Operational monitoring projections

Required Data:

```json
{
  "workflowType": "SCAN_TO_BIM",
  "status": "STARTED",
  "currentStage": "SEGMENTATION",
  "canonicalArtifactIds": ["uuid"]
}
```

Rules:

- The Upload Portal shall obtain workflow status through approved APIs or a status projection mechanism.
- The Upload Portal shall not directly consume Azure Service Bus integration events.

## 12.2 WorkflowStageStarted

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: A workflow stage started.

Required Data:

```json
{
  "stage": "SEGMENTATION",
  "status": "IN_PROGRESS",
  "attempt": 1,
  "startedAt": "2026-08-20T10:35:00Z"
}
```

Permitted initial stage values:

- `SEGMENTATION`
- `GEOMETRY_EXTRACTION`
- `IFC_GENERATION`
- `IFC_VALIDATION`
- `ARTIFACT_PREPARATION`

## 12.3 WorkflowStageCompleted

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: A workflow stage completed successfully.

Required Data:

```json
{
  "stage": "SEGMENTATION",
  "status": "COMPLETED",
  "attempt": 1,
  "completedAt": "2026-08-20T10:45:00Z",
  "resultSubjectId": "uuid",
  "resultSubjectType": "SegmentationResult"
}
```

## 12.4 WorkflowRetried

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: A workflow stage was scheduled for another attempt.

Required Data:

```json
{
  "stage": "SEGMENTATION",
  "previousAttempt": 1,
  "nextAttempt": 2,
  "reasonCode": "TRANSIENT_PROCESSING_FAILURE"
}
```

## 12.5 WorkflowCompleted

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: The Scan2BIM processing workflow completed after the required deliverable artifacts became ready.

Potential Consumers:

- `project-service`
- Status projections
- Operational monitoring projections

Required Data:

```json
{
  "status": "COMPLETED",
  "completedAt": "2026-08-20T11:30:00Z",
  "ifcModelId": "uuid",
  "readyArtifactIds": ["uuid"]
}
```

Rules:

- Workflow completion may depend on `ArtifactReady`.
- Workflow completion shall not wait for end-user download or `ArtifactDelivered`.

## 12.6 WorkflowFailed

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: The workflow reached a terminal failed state.

Required Data:

```json
{
  "status": "FAILED",
  "failedStage": "GEOMETRY_EXTRACTION",
  "failedAt": "2026-08-20T11:00:00Z",
  "error": {
    "errorCode": "GEOMETRY_EXTRACTION_FAILED",
    "errorCategory": "PROCESSING",
    "message": "Geometry extraction failed.",
    "retryable": false,
    "failedStage": "GEOMETRY_EXTRACTION",
    "attempt": 3,
    "detailsReference": "diagnostic-reference"
  }
}
```

## 12.7 WorkflowCancelled

Producer: `workflow-service`

Subject Type: `Workflow`

Meaning: The workflow was cancelled through an approved cancellation action.

Required Data:

```json
{
  "status": "CANCELLED",
  "cancelledAt": "2026-08-20T11:00:00Z",
  "cancelledBy": "requester-reference",
  "reason": "user-requested-cancellation"
}
```

---

# 13. Segmentation Context Events

## 13.1 SegmentationCompleted

Producer: `segmentation-service`

Subject Type: `SegmentationResult`

Meaning: Semantic segmentation completed successfully.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "segmentationResultId": "uuid",
  "canonicalArtifactIds": ["uuid"],
  "modelName": "logical-model-name",
  "modelVersion": "version",
  "detectedClasses": ["WALL", "FLOOR", "CEILING"],
  "resultArtifact": {
    "artifactId": "uuid",
    "artifactType": "SEGMENTATION_RESULT",
    "fileName": "segmentation-result",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  }
}
```

## 13.2 SegmentationFailed

Producer: `segmentation-service`

Subject Type: `CanonicalPointCloud`

Meaning: Segmentation failed for a canonical point cloud input.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "canonicalArtifactIds": ["uuid"],
  "modelVersion": "version",
  "error": {
    "errorCode": "SEGMENTATION_EXECUTION_FAILED",
    "errorCategory": "PROCESSING",
    "message": "Segmentation processing failed.",
    "retryable": true,
    "failedStage": "SEGMENTATION",
    "attempt": 1,
    "detailsReference": "diagnostic-reference"
  }
}
```

---

# 14. Geometry Context Events

## 14.1 GeometryGenerated

Producer: `geometry-service`

Subject Type: `GeometryModel`

Meaning: BIM-ready geometry was generated successfully.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "geometryModelId": "uuid",
  "segmentationResultId": "uuid",
  "geometryVersion": "1.0",
  "objectCount": 150,
  "geometryArtifact": {
    "artifactId": "uuid",
    "artifactType": "GEOMETRY_MODEL",
    "fileName": "geometry-model.json",
    "contentType": "application/json",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  }
}
```

## 14.2 GeometryGenerationFailed

Producer: `geometry-service`

Subject Type: `SegmentationResult`

Meaning: Geometry extraction or generation failed for a segmentation result.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "segmentationResultId": "uuid",
  "error": {
    "errorCode": "GEOMETRY_EXTRACTION_FAILED",
    "errorCategory": "PROCESSING",
    "message": "Geometry generation failed.",
    "retryable": true,
    "failedStage": "GEOMETRY_EXTRACTION",
    "attempt": 1,
    "detailsReference": "diagnostic-reference"
  }
}
```

---

# 15. IFC Context Events

## 15.1 IFCGenerated

Producer: `ifc-service`

Subject Type: `IFCModel`

Meaning: An IFC model was generated and awaits required validation.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "ifcModelId": "uuid",
  "geometryModelId": "uuid",
  "ifcSchema": "IFC4",
  "validationStatus": "PENDING",
  "ifcOutputReference": {
    "artifactId": "uuid",
    "artifactType": "IFC_MODEL_UNVALIDATED",
    "fileName": "scan2bim-output.ifc",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  }
}
```

Rules:

- `IFCGenerated` does not mean the IFC model is ready for delivery.
- Delivery readiness depends on the required validation outcome.

## 15.2 IFCValidationCompleted

Producer: `ifc-service`

Subject Type: `IFCModel`

Meaning: IFC validation completed with an outcome permitted by the current validation policy.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "ifcModelId": "uuid",
  "validationStatus": "PASSED",
  "validationReportArtifactId": "uuid-or-null",
  "warnings": []
}
```

Permitted initial successful statuses:

- `PASSED`
- `PASSED_WITH_WARNINGS`

MVP validation reports performed checks without claiming telecom-grade precision.

## 15.3 IFCValidationFailed

Producer: `ifc-service`

Subject Type: `IFCModel`

Meaning: The generated IFC model did not meet the required validation policy.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "ifcModelId": "uuid",
  "validationStatus": "FAILED",
  "validationReportArtifactId": "uuid-or-null",
  "error": {
    "errorCode": "IFC_VALIDATION_FAILED",
    "errorCategory": "VALIDATION",
    "message": "IFC validation failed.",
    "retryable": false,
    "failedStage": "IFC_VALIDATION",
    "attempt": 1,
    "detailsReference": "diagnostic-reference"
  }
}
```

## 15.4 IFCGenerationFailed

Producer: `ifc-service`

Subject Type: `GeometryModel`

Meaning: IFC generation failed for a geometry model.

Potential Consumers:

- `workflow-service`

Required Data:

```json
{
  "geometryModelId": "uuid",
  "error": {
    "errorCode": "IFC_GENERATION_FAILED",
    "errorCategory": "PROCESSING",
    "message": "IFC generation failed.",
    "retryable": false,
    "failedStage": "IFC_GENERATION",
    "attempt": 1,
    "detailsReference": "diagnostic-reference"
  }
}
```

---

# 16. Delivery Context Events

## 16.1 ArtifactReady

Producer: `delivery-service`

Subject Type: `Artifact`

Meaning: A generated artifact is available for authorized delivery or download.

Potential Consumers:

- `workflow-service`
- `project-service`
- Status projections

Required Data:

```json
{
  "artifactId": "uuid",
  "artifactType": "IFC_MODEL",
  "deliveryStatus": "READY",
  "availableAt": "2026-08-20T11:30:00Z",
  "artifact": {
    "artifactId": "uuid",
    "artifactType": "IFC_MODEL",
    "fileName": "scan2bim-output.ifc",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  }
}
```

Rules:

- Download authorization is an API and security concern.
- Expiring download URLs must not be published as permanent artifact identifiers.

## 16.2 ArtifactDelivered

Producer: `delivery-service`

Subject Type: `Artifact`

Meaning: An actual artifact delivery or retrieval action completed.

Potential Consumers:

- `project-service`
- Audit projections

Required Data:

```json
{
  "artifactId": "uuid",
  "deliveryChannel": "PORTAL_DOWNLOAD",
  "deliveryStatus": "DELIVERED",
  "deliveredAt": "2026-08-20T11:45:00Z",
  "consumerReference": "consumer-reference-or-null"
}
```

Rules:

- `ArtifactDelivered` is separate from `ArtifactReady`.
- Workflow completion shall not wait indefinitely for user download.

## 16.3 ArtifactDeliveryFailed

Producer: `delivery-service`

Subject Type: `Artifact`

Meaning: Artifact preparation or delivery failed.

Potential Consumers:

- `workflow-service`, when the failure affects required artifact readiness
- Operational monitoring projections

Required Data:

```json
{
  "artifactId": "uuid",
  "deliveryChannel": "PORTAL_DOWNLOAD",
  "error": {
    "errorCode": "ARTIFACT_DELIVERY_FAILED",
    "errorCategory": "DELIVERY",
    "message": "Artifact delivery failed.",
    "retryable": true,
    "failedStage": "ARTIFACT_DELIVERY",
    "attempt": 1,
    "detailsReference": "diagnostic-reference"
  }
}
```

---

# 17. Event Ownership Matrix

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
    IFCValidationCompleted
    IFCValidationFailed
    IFCGenerationFailed

delivery-service
    ArtifactReady
    ArtifactDelivered
    ArtifactDeliveryFailed
```

Only the owning service may publish the authoritative event for its bounded context.

---

# 18. Event Processing Rules

## 18.1 At-Least-Once Delivery

Consumers must assume that an event may be delivered more than once.

Consumers must not assume exactly-once delivery.

## 18.2 Idempotency

Each consumer must maintain an idempotency record using:

- `eventId`
- Consumer identity
- Processing outcome

Repeated processing must not create duplicate business effects.

## 18.3 Ordering

Consumers must not assume global ordering.

Where per-subject ordering is required, the transport contract may define partitioning, sessions, or sequence information.

## 18.4 Reliable Publication

An event must not be published for uncommitted business state.

Services requiring atomic persistence and publication should use a reliable pattern such as transactional outbox.

The implementation decision belongs in the Event-Driven Architecture ADR.

## 18.5 Retries

Transient consumer failures should be retried according to approved messaging policy.

Permanent failures must be surfaced for dead-letter handling.

## 18.6 Dead-Letter Handling

Dead-letter handling must preserve:

- Original message
- Failure reason
- Processing attempt information
- Consumer identity
- Correlation identifiers

## 18.7 Replay

Controlled replay must be auditable and must not duplicate business outcomes.

---

# 19. Event Versioning and Compatibility

## 19.1 Versioning Rule

Every event includes `eventVersion`.

Initial version: `1.0`

## 19.2 Backward-Compatible Changes

Examples:

- Adding an optional field
- Adding optional metadata
- Adding an enum value when consumers tolerate unknown values

Consumers must handle unknown optional fields and enum values safely.

## 19.3 Breaking Changes

Examples:

- Removing or renaming a field
- Changing field meaning or type
- Making an optional field required

Breaking changes require:

- A new major version
- Consumer migration planning
- Parallel compatibility when required
- Architecture approval

---

# 20. Security and Privacy Rules

Events must not contain:

- Passwords
- Secrets
- Access tokens
- Connection strings
- Embedded storage credentials
- Private keys
- Full stack traces
- Unnecessary personal information

Storage references must not bypass access control.

Sensitive diagnostics belong in secured telemetry or artifacts.

---

# 21. Observability Rules

Event publication and consumption must emit OpenTelemetry-compatible telemetry.

Relevant dimensions include:

- `eventId`
- `eventType`
- `eventVersion`
- `producer`
- `consumer`
- `correlationId`
- `causationId`
- `traceId`
- `ingestionRequestId`
- `workflowId`
- `subjectId`
- `processingOutcome`

Event payloads must not be logged in full when they may contain sensitive or high-volume metadata.

---

# 22. Validation Rules

Event envelopes and payloads shall be represented by versioned Pydantic models.

Before publication:

- Envelope validation must pass.
- Event-specific payload validation must pass.
- Required identifiers must be present.
- `eventType` and payload model must match.
- Artifact references must be valid.

On consumption:

- The event version must be supported.
- The schema must be validated.
- Unsupported major versions must be rejected safely.
- Validation failures must be observable and eligible for dead-letter handling.

Schemas shall be maintained under:

```text
contracts/schemas/events/
```

---

# 23. Local-First Compatibility

The same logical contracts shall be used in:

- Docker Compose local environments
- Automated test environments
- Azure cloud environments
- AKS deployments

Event names, envelopes, payload schemas, versioning rules, and consumer behavior must remain equivalent.

This supports:

```text
Same Code
Same Contracts
Different Configuration
```

---

# 24. Legacy Contract Transition

Earlier Scan2BIM references contain message names such as:

- `WEBHOOK_EVENT`
- `SEGMENTATION_START`
- `SEGMENTATION_COMPLETE`
- `POST_PROCESSING_AND_UPLOAD_START`
- `POST_PROCESSING_AND_UPLOAD_COMPLETE`

The current architecture separates:

- Integration events
- Processing commands
- Temporal workflow interactions
- API and webhook contracts

Legacy message names shall not be copied directly into the new architecture.

Their required semantics may be mapped during migration, but the ownership, names, envelope, and version rules in this document govern new implementation.

---

# 25. Event Catalog Summary

## Project Events

- `ProjectCreated`
- `ProjectUpdated`
- `SiteCreated`
- `SiteUpdated`

## Ingestion Events

- `IngestionRequested`
- `PointCloudFileRegistered`
- `IngestionValidated`
- `CanonicalPointCloudCreated`
- `IngestionFailed`

## Workflow Events

- `WorkflowStarted`
- `WorkflowStageStarted`
- `WorkflowStageCompleted`
- `WorkflowRetried`
- `WorkflowCompleted`
- `WorkflowFailed`
- `WorkflowCancelled`

## Segmentation Events

- `SegmentationCompleted`
- `SegmentationFailed`

## Geometry Events

- `GeometryGenerated`
- `GeometryGenerationFailed`

## IFC Events

- `IFCGenerated`
- `IFCValidationCompleted`
- `IFCValidationFailed`
- `IFCGenerationFailed`

## Delivery Events

- `ArtifactReady`
- `ArtifactDelivered`
- `ArtifactDeliveryFailed`

---

# 26. Governance

All Scan2BIM integration events must comply with this document.

Architecture review is required for:

- A new cross-context event
- A breaking event contract change
- Change of event ownership
- A new major version
- Large event payload introduction
- Source-format-specific event contracts
- Credentials or direct storage access in payloads
- Direct event coupling that bypasses workflow or bounded-context ownership

Events must not be introduced only for implementation convenience.

Every event must represent a meaningful business or processing fact.

---

# 27. Decision Outcome

The Scan2BIM Platform adopts the event contracts and governance rules defined in this document.

All services shall use:

- Standard event envelopes
- Versioned event payloads
- Idempotent consumers
- Correlation, causation, and trace identifiers
- Artifact references instead of embedded large payloads
- Explicit bounded-context event ownership
- Source-format-independent contracts
- Identical logical contracts across local and cloud environments

Final event schemas shall be implemented as versioned Pydantic models under:

```text
contracts/schemas/events/
```

Commands, queues, topics, subscriptions, sessions, retry policies, and dead-letter configuration shall be defined separately in `queue-contracts.md`.