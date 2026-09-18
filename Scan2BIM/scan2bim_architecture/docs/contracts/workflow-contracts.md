# Scan2BIM Workflow Contracts

Version: 1.0  
Status: Accepted  
Date: 2026-09-18  
Owner: Ajeesh Kumar A

## Related authoritative documents

- `vision.md`
- `ADR-001-technology-constitution.md`
- `ADR-002-local-first-development.md`
- `ADR-003-canonical-point-cloud-model.md`
- `ADR-004-event-driven-architecture.md`
- `ADR-005-temporal-workflow-architecture.md`
- `ADR-006-storage-data-ownership.md`
- `bounded-contexts.md`
- `service-catalog.md`
- `event-contracts.md`
- `api-contracts.md`
- `queue-contracts.md`

## 1. Purpose

This document defines the exact logical Temporal contracts for the MVP `ScanToBimWorkflow`: workflow identity, input, result, signals, queries, activity boundaries, state, attempts, timeouts, cancellation, reconciliation, determinism, and compatibility.

It does not define processing algorithms, Service Bus command payloads, event payloads, public REST endpoints, or physical Python class names.

## 2. Workflow ownership

`workflow-service` owns:

- Temporal client
- `ScanToBimWorkflow`
- Workflow and activity workers
- Workflow start and reconciliation
- Workflow projection
- Event-to-workflow signal adapter
- Public workflow query and cancellation APIs

Processing services own computation and outcome events. The Upload Portal and external clients never access Temporal directly.

## 3. Workflow type and identity

Workflow type:

```text
ScanToBimWorkflow
```

Workflow ID and business `workflowId`:

```text
scan2bim:{ingestionRequestId}
```

Logical Temporal task queue:

```text
scan2bim-workflow-v1
```

Rules:

- One MVP workflow is allowed per Ingestion Request.
- Temporal Run ID is runtime metadata.
- Duplicate start for the same Ingestion Request is idempotent.
- Reprocessing requires a future contract with a distinct run identity.
- ID reuse shall reject another run under the same business workflow identity.

## 4. Readiness precondition

For Event Contract Version 1.0, `CanonicalPointCloudCreated` causes an idempotent readiness evaluation. It does not itself prove that a multi-file request is complete.

Before starting, `workflow-service` shall use approved Ingestion APIs to verify:

- Ingestion Request status is `READY_FOR_WORKFLOW`.
- Every page of registered files has been retrieved.
- Registered file count equals requested file count.
- Every required file is `CANONICALIZED`.
- Every required file has a non-null `canonicalArtifactId`.

No partial workflow may start. The Workflow Context shall not query the Ingestion database directly.

## 5. Workflow input contract

```json
{
  "workflowContractVersion": "1.0",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "ingestionRequestId": "uuid",
  "projectId": "uuid",
  "siteId": "uuid",
  "correlationId": "uuid",
  "requestedFileCount": 1,
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
  ],
  "requestedAt": "2026-09-18T06:30:00Z"
}
```

Validation:

- `workflowId` must equal `scan2bim:{ingestionRequestId}`.
- `requestedFileCount` must be positive.
- Number of unique `canonicalArtifacts` must equal `requestedFileCount`.
- Every artifact type must be `CANONICAL_POINT_CLOUD`.
- Artifact references must match the accepted Common Artifact Reference.
- Input is immutable after start.
- Secrets, signed URLs, binaries, and parser-specific source structures are prohibited.

## 6. Public and internal statuses

Public Workflow status:

```text
STARTED
IN_PROGRESS
CANCELLATION_REQUESTED
COMPLETED
FAILED
CANCELLED
```

Internal initiation status:

```text
START_REQUESTED
START_ACCEPTED
START_FAILED
```

Stage execution status:

```text
PENDING
IN_PROGRESS
RETRY_SCHEDULED
COMPLETED
FAILED
CANCELLED
TIMED_OUT
```

## 7. Stage enumeration and mapping

| Stage | Command | Success event | Failure event | Success result type |
|---|---|---|---|---|
| `SEGMENTATION` | `StartSegmentation` | `SegmentationCompleted` | `SegmentationFailed` | `SegmentationResult` |
| `GEOMETRY_EXTRACTION` | `GenerateGeometry` | `GeometryGenerated` | `GeometryGenerationFailed` | `GeometryModel` |
| `IFC_GENERATION` | `GenerateIFC` | `IFCGenerated` | `IFCGenerationFailed` | `IFCModel` |
| `IFC_VALIDATION` | `ValidateIFC` | `IFCValidationCompleted` | `IFCValidationFailed` | `IFCModel` |
| `ARTIFACT_PREPARATION` | `PrepareArtifactDelivery` | `ArtifactReady` | `ArtifactDeliveryFailed` | `Artifact` |

`COMPLETED` is a terminal workflow marker, not a command-producing stage.

## 8. Workflow stage-state contract

```json
{
  "stage": "SEGMENTATION",
  "status": "IN_PROGRESS",
  "attempt": 1,
  "commandId": "uuid",
  "startedAt": "2026-09-18T06:35:00Z",
  "completedAt": null,
  "expectedSuccessEvent": "SegmentationCompleted",
  "expectedFailureEvent": "SegmentationFailed",
  "resultSubjectId": null,
  "resultSubjectType": null,
  "lastAppliedEventId": null,
  "failure": null
}
```

One workflow has at most one current active stage attempt.

## 9. Reconciled start contract

Start persistence cannot be atomic with Temporal.

The initiation record shall contain:

```json
{
  "workflowId": "scan2bim:ingestion-request-uuid",
  "ingestionRequestId": "uuid",
  "workflowType": "ScanToBimWorkflow",
  "status": "START_REQUESTED",
  "requestedAt": "2026-09-18T06:30:00Z",
  "acceptedAt": null,
  "failureCode": null
}
```

Required flow:

1. Persist `START_REQUESTED`.
2. Request Temporal start with the deterministic ID.
3. Verify an already-existing workflow has the same type and Ingestion Request.
4. Persist `START_ACCEPTED`, public `STARTED`, and `WorkflowStarted` outbox intent.
5. Publish the event through the outbox.

The reconciler resumes unresolved `START_REQUESTED` records. `START_FAILED` is used only after a non-transient, investigated start failure. It is not a normal public workflow status.

## 10. Stage execution contract

For every stage and attempt, workflow code shall:

1. Invoke an idempotent activity that persists the stage projection and `WorkflowStageStarted` outbox intent.
2. Invoke an idempotent activity that persists the command outbox intent and its `commandId`.
3. Wait for a matching success or failure signal.
4. On success, invoke an activity that persists the result reference, completes the stage, and adds `WorkflowStageCompleted` to the outbox.
5. On a retry decision, invoke an activity that persists `WorkflowRetried`, increments `attempt`, and creates a new `commandId`.
6. On terminal failure, invoke an activity that persists terminal state and `WorkflowFailed` outbox intent.

The independent outbox publisher sends commands and events. An activity records publication intent and does not claim broker consumption.

## 11. Processing outcome signal

Logical signal name:

```text
applyProcessingOutcomeV1
```

Signal payload:

```json
{
  "signalVersion": "1.0",
  "eventId": "uuid",
  "eventType": "SegmentationCompleted",
  "eventVersion": "1.0",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "stage": "SEGMENTATION",
  "attempt": 1,
  "occurredAt": "2026-09-18T07:00:00Z",
  "resultSubjectId": "uuid-or-null",
  "resultSubjectType": "SegmentationResult-or-null",
  "resultArtifactIds": ["uuid"],
  "validationStatus": null,
  "error": null
}
```

Failure example uses the same shape with null result fields and the accepted Common Error Contract in `error`.

Signal validation:

- `workflowId` must equal the receiving workflow ID.
- `eventType` must be allowed for `stage`.
- `attempt` must equal the current stage attempt.
- `eventId` is the signal-deduplication key.
- The signal must be compatible with the expected event version.
- IFC validation success requires `PASSED` or `PASSED_WITH_WARNINGS`.
- A stale, future-attempt, unexpected-stage, or already-applied signal shall not advance state.

## 12. Signal adapter settlement

The Service Bus event adapter shall:

1. Validate the integration-event envelope and version.
2. Persist or confirm the inbox record.
3. Verify workflow, stage, and attempt correlation.
4. Send `applyProcessingOutcomeV1`.
5. Record signal acceptance.
6. Complete the Service Bus event only after Temporal acknowledges the signal request and inbox state is durable.

The workflow deduplicates `eventId`. If the adapter stops after signal acceptance but before recording it, redelivery is safe.

## 13. Workflow result contract

Successful result:

```json
{
  "workflowContractVersion": "1.0",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "status": "COMPLETED",
  "completedAt": "2026-09-18T08:30:00Z",
  "ifcModelId": "uuid",
  "readyArtifactIds": ["uuid"]
}
```

Failed result:

```json
{
  "workflowContractVersion": "1.0",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "status": "FAILED",
  "completedAt": "2026-09-18T08:30:00Z",
  "failedStage": "GEOMETRY_EXTRACTION",
  "failure": {
    "errorCode": "GEOMETRY_EXTRACTION_FAILED",
    "errorCategory": "PROCESSING",
    "message": "Geometry generation failed.",
    "retryable": false,
    "failedStage": "GEOMETRY_EXTRACTION",
    "attempt": 3,
    "detailsReference": "diagnostic-reference-or-null"
  }
}
```

Cancelled result has status `CANCELLED`, `completedAt`, requester reference, and safe cancellation reason.

## 14. Workflow query contracts

Temporal queries are operational and not public APIs.

### getWorkflowStateV1

```json
{
  "queryVersion": "1.0",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "status": "IN_PROGRESS",
  "currentStage": "GEOMETRY_EXTRACTION",
  "currentAttempt": 1,
  "startedAt": "2026-09-18T06:30:00Z",
  "updatedAt": "2026-09-18T07:10:00Z",
  "completedAt": null,
  "readyArtifactIds": [],
  "failure": null
}
```

### getStageStatesV1

Returns the ordered list of Workflow Stage State records.

Rules:

- Queries are read only and deterministic.
- Public API responses are served from the Workflow PostgreSQL projection.
- Reconciliation may use safe Temporal queries but shall not access Temporal persistence directly.

## 15. Cancellation contract

Public cancellation remains the API contract. The Temporal workflow receives a cancellation request through the Temporal cancellation mechanism, not a custom public signal.

On cancellation:

- Stop issuing new processing commands.
- Mark current and pending stages according to the stage-state model.
- Do not force-stop an in-flight processing service because no cancellation commands are defined for MVP.
- Ignore late outcome events for progression while retaining audit evidence.
- Persist public `CANCELLED` and `WorkflowCancelled` outbox intent.
- Do not delete source, result, or audit artifacts.

## 16. Retry contract

A retry decision requires:

- Failure event marked retryable
- Stage policy permitting retry
- Remaining attempt allowance
- Remaining workflow and command deadline
- Workflow not cancellation requested or terminal

A new attempt receives a new `commandId`. Broker redelivery retains the existing `commandId` and attempt.

Configuration shape:

```json
{
  "policyVersion": "1.0",
  "stage": "SEGMENTATION",
  "maximumAttempts": 3,
  "initialIntervalSeconds": 30,
  "backoffCoefficient": 2.0,
  "maximumIntervalSeconds": 300,
  "stageTimeoutSeconds": 14400
}
```

The values above are examples, not production defaults. Accepted runtime values must be configuration validated through workload testing.

## 17. Timeout contract

Configured timeout categories:

- Activity schedule-to-close
- Activity start-to-close
- Stage outcome wait
- End-to-end workflow
- Cancellation grace period

A workflow timeout is owned by the Workflow Context. It shall not be misreported as a processing-service failure unless the processing service itself observed and published that failure.

## 18. Activity responsibility contracts

| Activity responsibility | Input | Durable effect | Idempotency key |
|---|---|---|---|
| Evaluate readiness | Ingestion Request identity | None or readiness audit | `workflowId + readiness-version` |
| Record workflow start | Workflow identity and input summary | Projection plus `WorkflowStarted` outbox | `workflowId` |
| Record stage start | Stage and attempt | Stage projection plus event outbox | `workflowId + stage + attempt + START` |
| Record command intent | Command envelope | Command outbox plus command identity | `commandId` |
| Record stage completion | Outcome signal | Stage projection plus event outbox | `eventId + COMPLETE` |
| Record retry | Failure and next attempt | Retry state plus `WorkflowRetried` outbox | `workflowId + stage + nextAttempt` |
| Record terminal failure | Failure decision | Workflow projection plus `WorkflowFailed` outbox | `workflowId + terminal-failure` |
| Record cancellation | Cancellation identity | Workflow projection plus `WorkflowCancelled` outbox | `workflowId + cancellation` |
| Record completion | Ready artifact result | Projection plus `WorkflowCompleted` outbox | `workflowId + completion` |

Activities shall not execute processing algorithms or return large artifacts.

## 19. Determinism and evolution

Workflow code shall not directly perform network, database, filesystem, environment, random, or wall-clock operations. Temporal-safe APIs and activities shall be used.

Workflow input, signal, query, result, and policy contracts are versioned independently. Changes affecting replayed branching require Temporal-safe patching/versioning and replay tests. Existing history paths shall not be removed while running histories require them.

Continue-As-New is not required for the bounded MVP history. Introducing it requires architecture review.

## 20. Failure and reconciliation rules

Reconciliation shall cover:

- `START_REQUESTED` without known Temporal start outcome
- Start accepted but projection or event outbox incomplete
- Command outbox unresolved
- Event inbox recorded but signal acceptance unresolved
- Projection behind Temporal state
- Late event after terminal workflow state

Reconciliation must be idempotent, observable, and must not invent a new workflow, attempt, command, result, or event identity.

## 21. Security and observability

Only approved `workflow-service` identities may start, signal, query operationally, or cancel workflows. Inputs, signals, histories, and logs shall not contain secrets or signed URLs.

Telemetry shall include `workflowId`, `ingestionRequestId`, `correlationId`, `traceId`, `commandId`, `eventId`, stage, attempt, activity, signal result, retry decision, timeout, and reconciliation outcome where applicable.

## 22. Testing requirements

Required tests:

- Input validation
- Single-file and multi-file readiness
- Pagination completeness
- Duplicate and reconciled start
- Every stage success and failure path
- Retryable, non-retryable, and exhausted retry
- Duplicate, stale, future-attempt, and out-of-order signal
- Signal accepted before inbox acceptance persistence
- Activity retry and worker restart
- Lock-loss outcome redelivery reconciliation
- Stage and workflow timeouts
- Cancellation and late outcomes
- Deterministic replay across versions
- Public projection reconciliation

## 23. Local-first requirements

The same workflow code and contracts shall run in local Temporal and AKS-hosted Temporal. Environment-specific task queue prefixes, worker concurrency, and timeout values are configuration only.

## 24. Governance

Architecture approval is required for another workflow type, new stage, stage-order change, new command or outcome event, custom public signal, processing cancellation command, changed workflow identity, reprocessing model, breaking history change, or Continue-As-New.

## 25. Decision outcome

Scan2BIM adopts the workflow, input, result, signal, query, activity, state, retry, timeout, cancellation, reconciliation, determinism, and versioning contracts in this document as the sole MVP Temporal contract baseline.
