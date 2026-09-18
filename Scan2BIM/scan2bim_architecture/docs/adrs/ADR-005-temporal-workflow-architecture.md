# ADR-005: Temporal Workflow Architecture

Version: 1
Status: Accepted  
Date: 2026-09-18  
Owner: Ajeesh Kumar A

## Related authoritative documents

- `vision.md`
- `ADR-001-technology-constitution.md`
- `ADR-002-local-first-development.md`
- `ADR-003-canonical-point-cloud-model.md`
- `ADR-004-event-driven-architecture.md`
- `bounded-contexts.md`
- `service-catalog.md`
- `event-contracts.md`
- `api-contracts.md`
- `queue-contracts.md`
- `workflow-contracts.md`

## 1. Context

Scan2BIM processing is asynchronous, long-running, and distributed across independently owned services. The current target service model separates Ingestion, Workflow, Segmentation, Geometry, IFC, and Delivery. Earlier Root Service and combined post-processing documents are historical references and shall not override this target architecture.

Temporal is the durable workflow engine. Azure Service Bus transports processing commands and outcome events. PostgreSQL stores the business-facing workflow projection and reliable messaging records.

No distributed transaction is assumed across Temporal, PostgreSQL, Azure Service Bus, or Blob Storage. Consistency shall use deterministic identities, idempotent activities and signals, local transactions, outbox/inbox, and reconciliation.

## 2. Decision

The Workflow Context shall implement one primary Temporal workflow type:

```text
ScanToBimWorkflow
```

`workflow-service` owns the Temporal client, workflow and activity workers, workflow definition, orchestration activities, event-to-workflow signal adapter, workflow projection, and workflow APIs.

Processing algorithms shall remain in their owning processing services and shall not execute inside Temporal workflow code.

## 3. Authoritative lifecycle

```text
Canonical inputs ready
    ↓
WorkflowStarted
    ↓
StartSegmentation
    ↓
SegmentationCompleted
    ↓
GenerateGeometry
    ↓
GeometryGenerated
    ↓
GenerateIFC
    ↓
IFCGenerated
    ↓
ValidateIFC
    ↓
IFCValidationCompleted
    ↓
PrepareArtifactDelivery
    ↓
ArtifactReady
    ↓
WorkflowCompleted
```

For each processing stage, the corresponding accepted failure event may trigger retry or terminal workflow failure. `ArtifactDelivered` records actual retrieval or delivery and does not block workflow completion.

## 4. Workflow identity

The Temporal Workflow ID and platform business `workflowId` shall use the same deterministic value:

```text
scan2bim:{ingestionRequestId}
```

Rules:

- One MVP Scan-to-BIM workflow is permitted per Ingestion Request.
- Repeated start attempts with the same identifier shall not create another workflow.
- Temporal Run ID is runtime metadata and is not the business `workflowId`.
- Reprocessing is not silently performed under the original identifier. A future reprocessing contract shall define a separate run identity.

## 5. Workflow initiation ownership

The Ingestion Context owns validation, source registration, canonicalization, and the decision that all required canonical inputs are ready. The Workflow Context owns creation and execution of the Temporal workflow.

For Event Contract Version 1.0, `workflow-service` consumes `CanonicalPointCloudCreated`. That event means one canonical artifact was created; it does not alone prove that a multi-file request is ready.

The idempotent readiness check shall:

1. Retrieve the Ingestion Request through the approved Ingestion API.
2. Confirm `status == READY_FOR_WORKFLOW`.
3. Retrieve all files through the approved files API, following pagination completely.
4. Confirm that the registered file count equals the requested file count.
5. Confirm that every required file has status `CANONICALIZED` and a non-null `canonicalArtifactId`.
6. Build the complete immutable workflow input.
7. Start or reconcile the workflow using the deterministic `workflowId`.

The Workflow Context shall not access the Ingestion database directly. If readiness is false, the event is recorded idempotently and no partial workflow is started. A later canonical event repeats the same check safely.

A future event contract may introduce a dedicated readiness event, but it is not added by this ADR.

## 6. Reconciled workflow start

Temporal start and PostgreSQL persistence cannot be atomic. The Workflow Context shall use the following internal initiation state:

```text
START_REQUESTED
START_ACCEPTED
START_FAILED
```

Initiation flow:

1. Persist `START_REQUESTED` with the deterministic `workflowId` and ingestion identity.
2. Request Temporal workflow start with an ID-reuse policy that rejects a duplicate active or completed workflow identifier.
3. Treat an already-existing workflow as idempotent success only when it represents the same Ingestion Request and workflow type.
4. Persist `START_ACCEPTED` and the public `STARTED` projection.
5. Persist `WorkflowStarted` in the same local transaction as the accepted projection.
6. Publish `WorkflowStarted` through the outbox.

A reconciler shall resume unresolved `START_REQUESTED` records. No distributed transaction between PostgreSQL and Temporal is assumed.

## 7. Workflow input

Workflow input is immutable and versioned:

```json
{
  "workflowContractVersion": "1.0",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "ingestionRequestId": "uuid",
  "projectId": "uuid",
  "siteId": "uuid",
  "correlationId": "uuid",
  "canonicalArtifacts": [
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
  ]
}
```

The artifact-reference shape shall match the Common Artifact Reference contract. Input shall not contain binary data, source parser structures, secrets, or signed URLs.

## 8. Workflow state model

Public workflow statuses shall match the API Contract and Workflow
Contract:

- STARTED
- IN_PROGRESS
- CANCELLATION_REQUESTED
- COMPLETED
- FAILED
- CANCELLED

The final cancellation state is `CANCELLED`.

`CANCELLATION_REQUESTED` is an accepted cancellation-action response and internal transitional projection. It shall be added to the public status enumeration before being returned by workflow GET/list APIs as a normal status.

Stages:

```text
SEGMENTATION
GEOMETRY_EXTRACTION
IFC_GENERATION
IFC_VALIDATION
ARTIFACT_PREPARATION
COMPLETED
```

Each stage records status, logical attempt, timestamps, command identity, expected outcomes, result subject identity, and safe failure information.

## 9. Stage execution pattern

Every stage shall use the same deterministic pattern:

1. Execute an activity that atomically updates the Workflow projection and adds `WorkflowStageStarted` to the event outbox.
2. Execute a command-publication activity that atomically records the command outbox record and stage command identity.
3. Wait for the approved success or failure signal.
4. On success, execute an activity that updates the stage projection and adds `WorkflowStageCompleted` to the outbox.
5. On retry, record `WorkflowRetried`, create a new command identity, increment the logical attempt, and repeat the stage.
6. On terminal failure, record the failed projection and `WorkflowFailed` outbox record.

Stage mapping:

| Stage | Command | Success | Failure |
|---|---|---|---|
| `SEGMENTATION` | `StartSegmentation` | `SegmentationCompleted` | `SegmentationFailed` |
| `GEOMETRY_EXTRACTION` | `GenerateGeometry` | `GeometryGenerated` | `GeometryGenerationFailed` |
| `IFC_GENERATION` | `GenerateIFC` | `IFCGenerated` | `IFCGenerationFailed` |
| `IFC_VALIDATION` | `ValidateIFC` | `IFCValidationCompleted` | `IFCValidationFailed` |
| `ARTIFACT_PREPARATION` | `PrepareArtifactDelivery` | `ArtifactReady` | `ArtifactDeliveryFailed` |

IFC delivery preparation proceeds only when validation status is `PASSED` or `PASSED_WITH_WARNINGS`, consistent with the accepted event contract.

## 10. Temporal activities

Workflow code decides sequence. Activities perform side effects.

Approved activity responsibilities:

- Query approved readiness information
- Persist Workflow projections
- Create command and event outbox records
- Read or reconcile service-owned operational state
- Record audit state

Activities shall be idempotent and shall not perform segmentation, geometry extraction, IFC generation, IFC validation, or artifact delivery.

A command-publication activity records publication intent. The independent outbox publisher performs the broker send. The activity shall not claim that the command has been consumed.

## 11. Event-to-workflow signalling

`workflow-service` consumes its event subscription and handles an outcome event as follows:

1. Validate envelope and version.
2. Persist or confirm the inbox record.
3. Resolve `workflowId` and verify the event belongs to the expected workflow and stage.
4. Signal Temporal with `eventId`, event type, logical attempt, result references, and safe failure data.
5. Record signal acceptance.
6. Complete the Service Bus event after signal acceptance and durable inbox state.

Temporal workflow state shall deduplicate by `eventId`. If a process stops after Temporal accepts a signal but before the adapter records acceptance, redelivery is safe because the workflow ignores an already-applied `eventId`.

A valid but unexpected or stale event shall be recorded for reconciliation and shall not advance the wrong stage. A future-attempt event shall not satisfy a previous attempt.

## 12. Retry policy

- Temporal owns logical stage retry decisions.
- Broker redelivery is not a new stage attempt.
- A new logical attempt receives a new `commandId` and incremented `attempt`.
- Retry decisions consider the failure event's `retryable` value, stage policy, elapsed workflow time, and command deadline.
- Exact retry counts and intervals are configuration validated through workload testing.
- Non-retryable or exhausted failures transition to `FAILED` and publish `WorkflowFailed`.

## 13. Timeouts

The workflow distinguishes:

- Activity schedule-to-close timeout
- Activity start-to-close timeout
- Stage outcome wait timeout
- End-to-end workflow timeout
- Cancellation grace period

Durations are stage configuration, not contract constants. A stage timeout shall not be represented as a processing-service failure event unless that service observed and owns the failure. The Workflow Context records the resulting workflow failure.

## 14. Cancellation

Cancellation is requested only through the Workflow API.

- `workflow-service` validates idempotency and current state.
- Temporal cancellation is requested.
- The workflow stops issuing new processing commands.
- In-flight processing is not forcefully terminated in the MVP because no processing cancellation commands are currently defined.
- Late outcomes from cancelled work may be recorded for audit but shall not advance the workflow.
- Final cancellation persists `CANCELLED` and publishes `WorkflowCancelled` through the outbox.
- Cancellation does not delete source artifacts, processing evidence, or audit records.

## 15. Compensation

MVP compensation means controlled state correction or cleanup, not reversal of completed AI or geometry work. Permitted actions include marking an output non-deliverable, expiring a delivery session, cleaning temporary work under retention policy, and recording a terminal workflow state.

## 16. Determinism and versioning

Workflow code shall not perform network, database, file-system, environment, or direct wall-clock operations. External effects execute in activities. Workflow-safe APIs shall be used for time, UUID-like identities, and version branches.

Running histories must remain replayable. Branching changes shall use Temporal-safe patching/versioning. CI shall replay representative histories before deployment. Breaking workflow changes require coexistence or migration planning.

The bounded MVP lifecycle does not require Continue-As-New. Introducing it requires a reviewed workflow change.

## 17. Worker model

Logical Temporal task queue:

```text
scan2bim-workflow-v1
```

Temporal task queues are not Azure Service Bus entities. Environment prefixes are permitted. Worker concurrency and deployment scaling are configuration concerns.

## 18. Projection and query model

Temporal persistence is the durable orchestration record. `workflow-service` PostgreSQL is the business-facing query projection. Public clients use the Workflow APIs and never query Temporal directly.

Projection reconciliation shall compare unresolved local initiation/outbox/inbox state with Temporal workflow existence and safe workflow queries. It shall not query Temporal's database directly.

## 19. Security and observability

Only approved `workflow-service` identities may start, signal, query operationally, or cancel Temporal workflows. Workflows and histories shall contain no credentials or temporary storage URLs.

Telemetry shall cover initiation, reconciliation, stage transitions, activity attempts, command publication intent, signals, retries, timeouts, cancellation, completion, and failure with the approved correlation identities.

## 20. Testing requirements

Implementation shall test deterministic replay, single and multi-file readiness, duplicate start, start reconciliation, each success and failure path, retryable and non-retryable failures, duplicate/stale/out-of-order signals, worker restart, activity retry, stage timeout, cancellation, late events after cancellation, and contract-version rejection.

## 21. Governance

Architecture review is required for a new workflow, lifecycle stage, stage order, signal, public query, direct external Temporal access, processing logic in workflows, breaking history change, reprocessing model, processing cancellation command, or new initiation event.

## 22. Decision outcome

Scan2BIM adopts `ScanToBimWorkflow` as the single durable MVP orchestrator, with deterministic identifiers and code, side effects in idempotent activities, outbox-published processing commands, event-to-workflow signalling deduplicated by `eventId`, explicit readiness and start reconciliation, bounded retry and timeout policy, cancellation without uncontracted force-stop behavior, business-facing status projection, and replay-safe evolution.
