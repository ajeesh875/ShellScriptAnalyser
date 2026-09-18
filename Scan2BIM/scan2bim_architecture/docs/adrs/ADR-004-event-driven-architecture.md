# ADR-004: Event-Driven Architecture and Messaging Reliability

Version: 1
Status: Accepted  
Date: 2026-09-18  
Owner: Ajeesh Kumar A

## Related authoritative documents

- `vision.md`
- `ADR-001-technology-constitution.md`
- `ADR-002-local-first-development.md`
- `ADR-003-canonical-point-cloud-model.md`
- `bounded-contexts.md`
- `service-catalog.md`
- `event-contracts.md`
- `api-contracts.md`
- `queue-contracts.md`
- `workflow-contracts.md`

## 1. Context

Scan2BIM coordinates long-running work across the Ingestion, Workflow, Segmentation, Geometry, IFC, and Delivery contexts. The accepted baseline assigns Temporal to durable orchestration, Azure Service Bus to asynchronous cross-context transport, PostgreSQL to service-owned operational state, Azure Blob Storage to large artifacts, and OpenTelemetry to observability.

The repository also contains earlier InShelter implementation documents. Those documents describe a Root Service, direct HTTP completion signals, direct processing-service chaining, E57-specific inputs, and combined post-processing. They are historical implementation references and are not authoritative when they conflict with the current ADRs, bounded contexts, service catalog, or current contracts.

## 2. Decision

Scan2BIM shall use a Temporal-orchestrated, event-driven architecture.

```text
Temporal
    Owns workflow history, stage sequence, timers, workflow retries,
    cancellation, and compensation decisions.

Azure Service Bus
    Transports cross-context processing commands and integration events.

PostgreSQL
    Stores service-owned state, command/event outbox records,
    inbox/idempotency records, and workflow projections.

Azure Blob Storage or Azurite
    Stores source and generated artifacts.

OpenTelemetry
    Provides distributed traces, metrics, and structured logs.
```

No distributed transaction is assumed across PostgreSQL, Temporal, Azure Service Bus, or Blob Storage. Cross-system consistency shall use stable identities, local transactions, transactional outbox, idempotent consumers, deterministic workflow behavior, and reconciliation.

## 3. Command and event semantics

- A command requests work from one owning service.
- An integration event announces a fact that has already occurred.
- Only `workflow-service` issues MVP processing commands.
- Processing services publish their own outcome events.
- Processing services shall not issue the next-stage command.
- The Upload Portal and external clients shall not access Azure Service Bus directly.

Authoritative processing commands:

| Command | Producer | Consumer |
|---|---|---|
| `StartSegmentation` | `workflow-service` | `segmentation-service` |
| `GenerateGeometry` | `workflow-service` | `geometry-service` |
| `GenerateIFC` | `workflow-service` | `ifc-service` |
| `ValidateIFC` | `workflow-service` | `ifc-service` |
| `PrepareArtifactDelivery` | `workflow-service` | `delivery-service` |

Authoritative processing outcomes:

| Service | Success | Failure |
|---|---|---|
| `segmentation-service` | `SegmentationCompleted` | `SegmentationFailed` |
| `geometry-service` | `GeometryGenerated` | `GeometryGenerationFailed` |
| `ifc-service` | `IFCGenerated`, `IFCValidationCompleted` | `IFCGenerationFailed`, `IFCValidationFailed` |
| `delivery-service` | `ArtifactReady` | `ArtifactDeliveryFailed` |

## 4. Logical Service Bus topology

Dedicated logical command queues shall be used:

```text
scan2bim.segmentation.commands.v1
scan2bim.geometry.commands.v1
scan2bim.ifc.commands.v1
scan2bim.delivery.commands.v1
```

Authoritative integration events shall be published to:

```text
scan2bim.integration-events.v1
```

Initial subscriptions:

```text
scan2bim.workflow.events.v1
scan2bim.project.events.v1
scan2bim.audit.events.v1
scan2bim.operations.events.v1
```

Each subscription shall have one owner, a documented event filter, monitoring, and dead-letter ownership. Filters may select declared event types but shall not implement business decisions.

Physical names may include environment prefixes or suffixes. Logical names and message contracts remain environment independent.

## 5. Message envelopes

Every command and event shall use the current versioned contract envelope. At minimum, messages shall carry their stable message identity, type, version, producer, occurrence or issue time, correlation identity, causation identity when applicable, trace context, business identifiers, subject identity, and payload.

- A transport redelivery retains the same `commandId` or `eventId`.
- A deliberate new workflow attempt receives a new `commandId` and incremented logical `attempt`.
- `workflowId` may be absent from pre-workflow ingestion events and is required after workflow creation.
- Binary artifacts, signed URLs, credentials, and large payloads are prohibited.

## 6. Delivery guarantee and idempotency

The platform adopts at-least-once delivery. Exactly-once transport shall not be assumed.

Every business-effecting consumer shall:

1. Validate the envelope, contract type, and version.
2. Validate message expiry or command deadline.
3. Record or confirm the message identity in its service-owned inbox.
4. Prevent concurrent or repeated business effects for the same logical message.
5. Process the message according to the owning service's state machine.
6. Commit owned result state and the required outcome-event outbox record.
7. Complete the Service Bus message only after required durable state is committed.

A completed duplicate returns no new business effect. An in-progress duplicate shall not start parallel duplicate work.

## 7. Long-running command processing

Segmentation, geometry, IFC, and delivery work may exceed the initial Service Bus lock duration. Consumers shall use Peek-Lock receive mode and automatic lock renewal for the bounded processing window.

Rules:

- Lock-renewal duration shall be configurable per command queue and shall cover the approved stage timeout with operational margin.
- A consumer shall not complete a processing command before its owned outcome state and outcome-event outbox record are durable.
- If a lock is lost, the consumer shall stop settlement attempts, preserve safe diagnostic state, and rely on redelivery plus idempotency.
- A repeated delivery shall reuse or reconcile existing work for the same `commandId`; it shall not create a new processing result.
- Prefetch and concurrency shall be configured conservatively for GPU and memory-intensive workers.
- If future workloads cannot safely retain broker locks, a separate accepted ADR shall introduce a durable accepted-work pattern. That pattern is not part of this MVP decision.

## 8. Transactional outbox

Every service that must persist owned state and publish a command or event shall use a transactional outbox.

The same local PostgreSQL transaction shall persist:

- The service-owned state or projection change
- The complete publication record
- `messageId`
- `messageKind` as `COMMAND` or `EVENT`
- Message type and version
- Destination
- Payload
- Creation and publication status

`workflow-service` shall use the outbox for processing commands and workflow-owned events. Processing services shall use it for outcome events.

The outbox publisher shall publish with the stable `commandId` or `eventId`, mark success only after broker acceptance, retry transient publication failures, and expose backlog telemetry. Republishing an unconfirmed record retains the same logical identity.

A PostgreSQL transaction cannot include a Temporal history mutation. Temporal-to-projection consistency shall therefore be idempotent and reconcilable.

## 9. Consumer inbox

Minimum logical inbox information:

```text
messageId
messageKind
messageType
consumerName
workflowId (nullable only before workflow creation)
payloadHash
status
firstReceivedAt
lastUpdatedAt
resultReference
```

Inbox retention shall exceed the maximum message replay and redelivery window defined by operations.

## 10. Ordering and sessions

Global ordering shall not be assumed. Temporal enforces workflow stage sequencing.

Azure Service Bus sessions are not mandatory for the MVP. Sessions may be introduced for a specific entity only when every message to that entity has a valid session identifier, broker-level ordering is demonstrably required, and operational behavior has been tested. For post-workflow processing messages, the preferred session identifier is `workflowId`. Pre-workflow events shall not require `workflowId`.

Idempotency is mandatory with or without sessions.

## 11. Retry ownership

- Temporal owns workflow-level retry decisions, stage attempts, timers, and terminal workflow failure.
- Azure Service Bus owns transport redelivery before settlement.
- Service code may use bounded internal retries only for safe transient operations such as short storage or broker calls.
- No layer may retry indefinitely.
- Automated retries shall not continue after `deadlineAt`.
- Broker redelivery is not a new logical workflow attempt.
- A valid command that reaches terminal processing failure shall produce the owning failure event.
- An invalid, unsupported, unauthorized, or expired message shall be dead-lettered without a misleading domain failure event.

## 12. Settlement and dead-lettering

Complete when validation, owned state, and required outbox intent are durable.

Abandon only for a transient failure that may succeed on redelivery and while the message or command remains valid.

Dead-letter for:

- Unsupported major contract version
- Unknown command on a dedicated queue
- Non-recoverable payload validation failure
- Expired command
- Permanent authorization or artifact-integrity failure
- Configured maximum delivery count exceeded

Message deferral is not approved for the MVP.

Dead-letter replay shall be manual or controlled, auditable, idempotent, and performed only after correcting the cause. Blind automatic replay is prohibited.

## 13. Security

- Managed identity is preferred in Azure.
- Queue and topic permissions shall be least privileged.
- Portals have no broker permissions.
- Secrets, connection strings, SAS tokens, storage keys, and temporary access URLs are prohibited in messages and logs.
- Artifact references are logical locators, not credentials.

## 14. Observability

Telemetry shall cover publication, receipt, validation, processing, lock renewal, settlement, retries, outbox backlog, inbox duplicates, expiry, and dead-lettering. Relevant identifiers include `commandId`, `eventId`, `correlationId`, `causationId`, `traceId`, `ingestionRequestId`, `workflowId`, `projectId`, `siteId`, `subjectId`, and `artifactId`.

## 15. Local-first behavior

Production uses Azure Service Bus. Local development may use an approved adapter, but contract semantics shall remain identical. Local tests shall cover duplicate delivery, idempotency, transient and permanent failure, expiry, settlement, dead-letter behavior, and correlation propagation.

In-memory queues may be used only for fast unit or developer tests. Integration tests for production reliability shall use a broker-compatible environment.

## 16. Infrastructure as code

Terraform shall provision production queues, topics, subscriptions, filters, authorization, lock duration, TTL, duplicate detection, delivery counts, optional sessions, and monitoring. Production application startup shall not create or mutate broker topology.

## 17. Consequences

Benefits include explicit ownership, durable transport, independent scaling, reliable publication, duplicate protection, controlled recovery, and consistent local/cloud contracts.

Trade-offs include eventual consistency, outbox/inbox persistence, lock-renewal operations, and dead-letter ownership. These trade-offs are accepted.

## 18. Governance

Architecture review is required for a new entity, command producer or consumer, direct processing-service chaining, direct HTTP completion callback, removal of outbox or idempotency, changed ordering semantics, breaking contract, automated replay, or new messaging technology.

## 19. Decision outcome

Scan2BIM adopts Temporal-orchestrated cross-context messaging using dedicated processing command queues, one logical integration-event topic, at-least-once delivery, explicit settlement, bounded lock renewal for long-running commands, transactional outbox, consumer inbox/idempotency, Temporal-enforced stage sequencing, optional broker sessions only when justified, and controlled dead-letter recovery.
