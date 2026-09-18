# Scan2BIM Queue Contracts

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
- `domain-model.md`
- `bounded-contexts.md`
- `service-catalog.md`
- `event-contracts.md`
- `api-contracts.md`
- `workflow-contracts.md`

## 1. Purpose

This document is the authoritative logical contract for asynchronous Scan2BIM processing commands and their Azure Service Bus routing. It defines exact command names, envelopes, payloads, ownership, validation, idempotency, settlement, compatibility, and dead-letter classifications.

Integration-event payloads remain authoritative in `event-contracts.md`. Temporal workflow behavior remains authoritative in `ADR-005-temporal-workflow-architecture.md` and `workflow-contracts.md`.

## 2. Scope

This document defines these MVP commands:

- `StartSegmentation`
- `GenerateGeometry`
- `GenerateIFC`
- `ValidateIFC`
- `PrepareArtifactDelivery`

It also defines the logical command queues and transport-property mapping.

It does not define:

- Public REST APIs
- Integration-event payloads
- Temporal workflow implementation
- Physical Azure resource names or SKUs
- Exact retry counts, TTLs, lock durations, prefetch, or worker concurrency
- Processing algorithms
- Physical Pydantic module layout

## 3. Governing principles

- Commands are imperative requests and have one logical consumer.
- Only `workflow-service` may issue MVP processing commands.
- A processing service shall not command the next processing service.
- Processing outcomes are published as integration events.
- All commands after ingestion use canonical or derived artifact references, never source-format parser structures.
- Large artifacts, credentials, signed URLs, and binaries are prohibited in messages.
- Delivery is at least once. Consumers must be idempotent.
- Logical command contracts remain identical locally and in Azure.

## 4. Logical queue topology

| Logical queue | Authorized sender | Authorized receiver | Allowed command types |
|---|---|---|---|
| `scan2bim.segmentation.commands.v1` | `workflow-service` | `segmentation-service` | `StartSegmentation` |
| `scan2bim.geometry.commands.v1` | `workflow-service` | `geometry-service` | `GenerateGeometry` |
| `scan2bim.ifc.commands.v1` | `workflow-service` | `ifc-service` | `GenerateIFC`, `ValidateIFC` |
| `scan2bim.delivery.commands.v1` | `workflow-service` | `delivery-service` | `PrepareArtifactDelivery` |

Physical names may add environment prefixes or suffixes. The mappings above shall not change without architecture approval.

## 5. Standard command envelope

```json
{
  "commandId": "uuid",
  "commandType": "StartSegmentation",
  "commandVersion": "1.0",
  "issuedAt": "2026-09-18T06:30:00Z",
  "notBefore": null,
  "deadlineAt": "2026-09-18T10:30:00Z",
  "producer": "workflow-service",
  "targetService": "segmentation-service",
  "correlationId": "uuid",
  "causationId": "event-id-or-command-id",
  "traceId": "trace-identifier-or-null",
  "ingestionRequestId": "uuid",
  "workflowId": "scan2bim:ingestion-request-uuid",
  "projectId": "uuid",
  "siteId": "uuid",
  "subjectId": "uuid",
  "subjectType": "CanonicalPointCloud",
  "attempt": 1,
  "data": {},
  "metadata": {}
}
```

## 6. Envelope field rules

| Field | Required | Rule |
|---|---:|---|
| `commandId` | Yes | UUID identifying one logical command attempt. Transport redelivery retains it. |
| `commandType` | Yes | Exact approved PascalCase command name. |
| `commandVersion` | Yes | Semantic contract version. Initial value `1.0`. |
| `issuedAt` | Yes | ISO 8601 UTC issue time. |
| `notBefore` | No | ISO 8601 UTC. Null means immediately eligible. |
| `deadlineAt` | Yes | ISO 8601 UTC deadline after which work shall not start or continue automatically. |
| `producer` | Yes | Must be `workflow-service` for MVP processing commands. |
| `targetService` | Yes | Must match the queue owner and command mapping. |
| `correlationId` | Yes | End-to-end business correlation identifier, propagated unchanged. |
| `causationId` | Yes | Identifier of the event, command, or workflow action that caused this command. |
| `traceId` | Conditional | Required when an active OpenTelemetry trace exists. |
| `ingestionRequestId` | Yes | Originating Ingestion Request. |
| `workflowId` | Yes | Deterministic platform and Temporal Workflow ID. |
| `projectId` | Conditional | Required when the Ingestion Request belongs to a Project. |
| `siteId` | Conditional | Required when the Ingestion Request belongs to a Site. |
| `subjectId` | Yes | Identifier of the primary input subject. |
| `subjectType` | Yes | Approved input type for the command. |
| `attempt` | Yes | Logical stage attempt, beginning at `1`. Broker redelivery does not increment it. |
| `data` | Yes | Command-specific payload. |
| `metadata` | No | Declared cross-cutting metadata only. Business logic shall not depend on undeclared keys. |

A deliberate Temporal retry creates a new `commandId` and increments `attempt`. Republishing an unconfirmed outbox record keeps both unchanged.

## 7. Common Artifact Reference

Every artifact reference shall use the accepted common shape:

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

- `storageReference` is a stable logical locator, not a credential or signed URL.
- `sizeBytes` is non-negative.
- `checksum` and `checksumAlgorithm` must be supplied for registered immutable inputs.
- Consumers shall validate that the artifact type is permitted for the command.
- A referenced artifact must be authorized, registered, and immutable.

## 8. StartSegmentation

Producer: `workflow-service`  
Consumer: `segmentation-service`  
Queue: `scan2bim.segmentation.commands.v1`  
Subject type: `CanonicalPointCloud`

```json
{
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
  "modelSelection": {
    "modelName": "approved-logical-model-name",
    "modelVersion": "approved-version-or-null"
  },
  "processingOptions": {
    "useAvailableSemanticLabels": true
  }
}
```

Validation:

- `canonicalArtifacts` must contain at least one unique artifact.
- Every artifact type must be `CANONICAL_POINT_CLOUD`.
- The artifact set must equal the immutable set in the workflow input.
- `modelName` must identify an approved logical model, not a runtime-specific implementation.

Success: `SegmentationCompleted`  
Failure: `SegmentationFailed`

## 9. GenerateGeometry

Producer: `workflow-service`  
Consumer: `geometry-service`  
Queue: `scan2bim.geometry.commands.v1`  
Subject type: `SegmentationResult`

```json
{
  "segmentationResultId": "uuid",
  "segmentationArtifact": {
    "artifactId": "uuid",
    "artifactType": "SEGMENTATION_RESULT",
    "fileName": "segmentation-result",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  },
  "canonicalArtifactIds": ["uuid"],
  "geometryProfile": "MVP_GENERAL"
}
```

Validation:

- `segmentationResultId` must identify the successful result referenced by the causation event.
- `segmentationArtifact.artifactType` must be `SEGMENTATION_RESULT`.
- Canonical artifact identifiers must belong to the same workflow.
- `geometryProfile` is a logical profile and shall not encode source format.

Success: `GeometryGenerated`  
Failure: `GeometryGenerationFailed`

## 10. GenerateIFC

Producer: `workflow-service`  
Consumer: `ifc-service`  
Queue: `scan2bim.ifc.commands.v1`  
Subject type: `GeometryModel`

```json
{
  "geometryModelId": "uuid",
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
  },
  "targetIfcSchema": "IFC4",
  "generationProfile": "MVP_GENERAL"
}
```

Validation:

- `geometryArtifact.artifactType` must be `GEOMETRY_MODEL`.
- `geometryModelId` and artifact must belong to the same successful geometry result.
- `targetIfcSchema` and `generationProfile` must be values approved by IFC policy.

Success: `IFCGenerated`  
Failure: `IFCGenerationFailed`

## 11. ValidateIFC

Producer: `workflow-service`  
Consumer: `ifc-service`  
Queue: `scan2bim.ifc.commands.v1`  
Subject type: `IFCModel`

```json
{
  "ifcModelId": "uuid",
  "ifcArtifact": {
    "artifactId": "uuid",
    "artifactType": "IFC_MODEL_UNVALIDATED",
    "fileName": "scan2bim-output.ifc",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  },
  "validationPolicy": "MVP_FEASIBILITY_V1"
}
```

Validation:

- `ifcArtifact.artifactType` must be `IFC_MODEL_UNVALIDATED`.
- The artifact must be the output identified by the causation `IFCGenerated` event.
- `validationPolicy` must identify an approved policy.

Success: `IFCValidationCompleted` with `PASSED` or `PASSED_WITH_WARNINGS`  
Failure: `IFCValidationFailed`

## 12. PrepareArtifactDelivery

Producer: `workflow-service`  
Consumer: `delivery-service`  
Queue: `scan2bim.delivery.commands.v1`  
Subject type: `IFCModel`

```json
{
  "ifcModelId": "uuid",
  "validationStatus": "PASSED",
  "sourceArtifact": {
    "artifactId": "uuid",
    "artifactType": "IFC_MODEL",
    "fileName": "scan2bim-output.ifc",
    "contentType": "application/octet-stream",
    "storageReference": "logical-storage-reference",
    "checksumAlgorithm": "SHA256",
    "checksum": "checksum-value",
    "sizeBytes": 123456,
    "version": "1.0"
  },
  "deliveryProfile": "PORTAL_DOWNLOAD"
}
```

Validation:

- `validationStatus` must be `PASSED` or `PASSED_WITH_WARNINGS`.
- `sourceArtifact.artifactType` must be `IFC_MODEL`.
- Delivery shall create a delivery-facing record that references the immutable IFC artifact. It shall not overwrite the IFC binary.

Success: `ArtifactReady`  
Failure: `ArtifactDeliveryFailed`

## 13. Service Bus property mapping

| Service Bus property | Contract source |
|---|---|
| `MessageId` | `commandId` |
| `CorrelationId` | `correlationId` |
| `Subject` | `commandType` |
| `ContentType` | `application/json` |
| `SessionId` | Omitted for MVP unless sessions are approved for the entity |
| Application property `messageKind` | `COMMAND` |
| Application property `contractVersion` | `commandVersion` |
| Application property `producer` | `producer` |
| Application property `targetService` | `targetService` |
| Application property `traceId` | `traceId`, when present |

Properties and body must agree. A mismatch is a non-recoverable validation failure.

## 14. Validation order

Consumers shall validate in this order:

1. Authorized queue and sender identity
2. JSON decoding and envelope shape
3. Supported major contract version
4. Queue-to-command and target-service mapping
5. Required identities and timestamps
6. `notBefore` and `deadlineAt`
7. Command-specific payload
8. Artifact ownership, existence, access, and integrity
9. Inbox/idempotency state
10. Current service-owned processing state

No business processing begins before validation completes.

## 15. Idempotency

The unique logical consumer key is:

```text
consumerName + commandId
```

A payload hash shall be stored with the inbox record.

- Same `commandId` and same payload: duplicate delivery, handled idempotently.
- Same `commandId` and different payload: dead-letter as `COMMAND_ID_PAYLOAD_CONFLICT`.
- Same workflow stage and attempt with a different `commandId`: record as a state conflict and do not create parallel work.
- A completed duplicate shall not regenerate artifacts or emit a second logical outcome event.

## 16. Long-running processing and settlement

Consumers use Peek-Lock and automatic lock renewal for the approved bounded stage window.

Complete only after:

- Processing reaches a durable success or terminal-failure state.
- Owned result or failure state is committed.
- The corresponding outcome-event outbox record is committed.

If the lock is lost, the consumer shall not attempt settlement. Redelivery shall reconcile the existing inbox and work state by `commandId`.

Exact lock-renewal duration, prefetch, concurrency, stage timeout, and maximum delivery count are deployment configuration governed by ADR-004.

## 17. Settlement and dead-letter classifications

| Condition | Settlement | Stable reason |
|---|---|---|
| Transient dependency failure before durable outcome | Abandon | `TRANSIENT_DEPENDENCY_FAILURE` |
| Unsupported major version | Dead-letter | `UNSUPPORTED_COMMAND_VERSION` |
| Unknown command for queue | Dead-letter | `COMMAND_NOT_ALLOWED_ON_QUEUE` |
| Producer or target mismatch | Dead-letter | `COMMAND_ROUTING_MISMATCH` |
| Non-recoverable schema failure | Dead-letter | `INVALID_COMMAND_SCHEMA` |
| Expired deadline | Dead-letter | `COMMAND_EXPIRED` |
| Artifact missing after verification | Dead-letter | `ARTIFACT_NOT_FOUND` |
| Artifact checksum mismatch | Dead-letter | `ARTIFACT_INTEGRITY_FAILED` |
| Permanent authorization failure | Dead-letter | `COMMAND_NOT_AUTHORIZED` |
| Same ID with different payload | Dead-letter | `COMMAND_ID_PAYLOAD_CONFLICT` |
| Durable success/failure and outbox committed | Complete | Not applicable |

A contract or authorization failure shall not produce a misleading processing-domain failure event.

## 18. Versioning and compatibility

Backward-compatible changes may add an optional field with a safe default or an enum value only when consumers tolerate unknown values.

Breaking changes require a new major contract version and architecture approval. Examples include removing or renaming fields, changing field meaning or type, making optional input required, changing ownership, or changing idempotency semantics.

Consumers shall reject unsupported major versions safely. Producers shall not publish a version until the target consumer is compatible.

## 19. Security and privacy

- Managed identity is preferred in Azure.
- Send and receive permissions are queue-specific and least privileged.
- Bodies and properties shall not contain secrets, tokens, signed URLs, connection strings, private keys, or unnecessary personal information.
- Artifact access occurs through service identity or an approved storage adapter.
- Full payload logging is prohibited.

## 20. Observability

Telemetry shall include `commandId`, `commandType`, `commandVersion`, `correlationId`, `causationId`, `traceId`, `ingestionRequestId`, `workflowId`, `attempt`, logical queue, delivery count, lock-lost count, processing duration, settlement, and outcome where applicable.

## 21. Local-first requirements

Local implementations shall use the same envelopes and payloads and shall test duplicate delivery, idempotency, expiry, routing mismatch, transient failure, permanent failure, and correlation propagation. Fakes are acceptable for unit tests. Production-reliability integration tests require a broker-compatible environment.

## 22. Governance

Architecture approval is required for a new command, queue, sender, receiver, major version, direct portal publication, direct processing-service chaining, embedded large artifact, changed settlement model, or sessions.

## 23. Decision outcome

Scan2BIM adopts the five versioned command contracts and four dedicated logical command queues defined in this document. These contracts are the sole target command baseline for MVP implementation.
