# ADR-006: Storage, Persistence, and Data Ownership Strategy

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
- `ADR-005-temporal-workflow-architecture.md`
- `domain-model.md`
- `bounded-contexts.md`
- `service-catalog.md`
- `event-contracts.md`
- `api-contracts.md`

## 1. Context

Scan2BIM stores operational state and large source/generated artifacts. The accepted target architecture requires PostgreSQL as the system of record, Redis only for cache or temporary state, Azure Blob Storage for artifacts, Azurite locally, and Temporal persistence only for workflow runtime history.

Earlier InShelter documents describe shared Root Service tables, SQLite or filesystem substitutes, direct paths, E57-specific layout, and combined post-processing/IFC ownership. They are historical references and shall not override the current bounded contexts, service catalog, accepted ADRs, or current contracts.

## 2. Decision

```text
PostgreSQL
    Service-owned business and operational state
    Workflow query projections
    Outbox records
    Inbox and idempotency records

Azure Blob Storage
    Production source and generated artifacts

Azurite
    Local Blob-compatible artifact storage

Redis
    Reconstructable cache and approved temporary coordination only

Temporal persistence
    Temporal workflow history and runtime state only
```

No distributed transaction is assumed across PostgreSQL, Temporal, Azure Service Bus, Blob Storage, or Redis. Cross-system consistency shall use local transactions, outbox/inbox, stable identities, idempotency, and reconciliation.

## 3. Data ownership principles

- A service owns the state for its bounded-context capability.
- A service shall not read or write another service's schema or tables.
- Cross-context information is exchanged through approved APIs, commands, events, and owned projections.
- Cross-service foreign keys are prohibited.
- Shared infrastructure administration does not grant cross-service application access.
- A reporting projection shall have one explicit owner.

The current bounded contexts and service catalog take precedence over ownership wording in the older domain model where the latter says Workflow owns all processing results or artifacts.

## 4. MVP PostgreSQL isolation model

The MVP shall use one application PostgreSQL instance with one dedicated schema and database role per backend service:

```text
project
ingestion
workflow
segmentation
geometry
ifc
delivery
```

Rules:

- Each application role has privileges only on its owned schema.
- Each service owns and runs only its migrations.
- Public schema shall not hold shared business tables.
- Cross-schema application queries and foreign keys are prohibited.
- A service may later move to a separate PostgreSQL database or server without changing its logical APIs, commands, events, or ownership.

Recommended service-to-schema mapping:

| Service | Schema |
|---|---|
| `project-service` | `project` |
| `ingestion-service` | `ingestion` |
| `workflow-service` | `workflow` |
| `segmentation-service` | `segmentation` |
| `geometry-service` | `geometry` |
| `ifc-service` | `ifc` |
| `delivery-service` | `delivery` |

## 5. Temporal persistence isolation

Temporal persistence shall use Temporal-owned databases or schemas and a distinct database role. Application roles shall have no access to Temporal persistence. Temporal tables shall not be placed in the `workflow` application schema.

Local Docker Compose may host Temporal persistence on the same PostgreSQL server process only when database/schema and role isolation are retained. Cloud deployment may isolate Temporal persistence physically without changing application contracts.

Application services use the Temporal SDK, never direct Temporal database access. Temporal history is not a reporting model.

## 6. Service-owned operational state

| Service | Owned state |
|---|---|
| `project-service` | Projects, Sites, lifecycle state, Project-owned visibility projections, idempotency, outbox |
| `ingestion-service` | Ingestion Requests, Upload Sessions, Point Cloud Files, source/canonical artifact metadata, adapters, validation, idempotency, outbox |
| `workflow-service` | Workflow projection, stage state, retry/timeout/cancellation state, initiation reconciliation, inbox, signal application, command/event outbox |
| `segmentation-service` | Segmentation Results, model execution metadata, segmentation artifact metadata, command inbox, event outbox |
| `geometry-service` | Geometry Models, geometry validation and artifact metadata, command inbox, event outbox |
| `ifc-service` | IFC Models, generation metadata, IFC artifacts, validation outcomes/reports, command inbox, event outbox |
| `delivery-service` | DeliverableArtifact records, availability, Download Sessions, Delivery Records, command/API idempotency, event outbox |

## 7. Artifact ownership

Producing contexts own processing-result and artifact metadata. Delivery owns the delivery-facing view and access lifecycle.

| Owner | Artifact categories it may create |
|---|---|
| Ingestion | `SOURCE_POINT_CLOUD`, `CANONICAL_POINT_CLOUD` |
| Segmentation | `SEGMENTATION_RESULT`, segmentation diagnostic artifacts |
| Geometry | `GEOMETRY_MODEL`, geometry diagnostic artifacts |
| IFC | `IFC_MODEL_UNVALIDATED`, `IFC_MODEL`, `VALIDATION_REPORT`, IFC diagnostic artifacts |
| Delivery | Delivery-facing records and delivery diagnostics; not a replacement IFC binary |

A client may upload source bytes through a delegated Upload Session, but Ingestion owns source registration, verification, and lifecycle metadata.

`DeliverableArtifact` is a logical delivery view of an approved immutable generated artifact. In the MVP, it references the approved `IFC_MODEL` identity/version. Delivery shall not alter, copy, or overwrite the IFC binary merely to make it deliverable. A true transformed derivative requires a new artifact identity and explicit ownership.

## 8. Artifact storage and containers

Blob storage shall separate security and lifecycle concerns at least among:

- Source artifacts
- Canonical artifacts
- Intermediate processing artifacts
- Final IFC artifacts
- Validation and diagnostic reports

Exact container names are deployment configuration. Each service receives least-privilege write access only to owned categories and read access only to required inputs.

## 9. Common Artifact Reference

Cross-context artifact references shall match the accepted Event Contract:

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

`storageReference` is a stable logical locator, not a SAS URL, access token, or provider-specific credential. Storage adapters resolve it. Original filenames are descriptive metadata, not storage identity.

## 10. Immutability, versioning, and integrity

- Registered source artifacts are immutable.
- Generated artifacts are immutable by identity and version.
- Reprocessing creates a new artifact identity or version.
- Silent binary overwrite is prohibited.
- Every registered artifact records owner, type, version, content type, checksum algorithm/value, size, creation time, and lineage identities.
- Consumers shall verify integrity before expensive processing when checksum metadata is available.
- Temporary partial uploads shall not be registered as completed artifacts.

## 11. Artifact lineage

Lineage shall be traceable through identifiers and references rather than cross-service foreign keys:

```text
Project
  -> Site
  -> Ingestion Request
  -> Source Point Cloud
  -> Canonical Point Cloud
  -> Segmentation Result
  -> Geometry Model
  -> IFC Model
  -> DeliverableArtifact view
```

## 12. Large-data rules

Large artifacts shall not be stored in API JSON, Service Bus messages, Temporal inputs/history, Redis, or PostgreSQL binary columns as the normal artifact store. PostgreSQL stores metadata and references.

Services shall stream large transfers and use bounded local temporary working storage. Temporary work is not authoritative and may be recreated or cleaned under policy.

## 13. Transactional outbox

Every command/event-producing service shall own an outbox table in its schema.

Minimum logical fields:

```text
outboxId
messageId
messageKind
messageType
messageVersion
destination
aggregateType
aggregateId
workflowId
payload
status
createdAt
publishedAt
attemptCount
lastErrorCode
```

For events, `messageId` is `eventId`; for commands, it is `commandId`. Business or projection state and its publication intent are committed in one local transaction. Publication retries retain the same identity. Cleanup shall not remove unresolved records.

## 14. Inbox and idempotency

Minimum logical fields:

```text
messageId
messageKind
messageType
consumerName
workflowId
payloadHash
status
firstReceivedAt
lastUpdatedAt
resultReference
```

API idempotency additionally records idempotency key, operation, request fingerprint, original logical response reference, and expiry.

A unique constraint shall prevent the same consumer from applying the same message identity twice. Exact table and index names remain service implementation details.

## 15. Transaction boundaries

A database transaction includes only state owned by one service. Distributed transactions are prohibited.

Consistency mechanisms are:

- Local PostgreSQL transactions
- Transactional outbox
- Consumer inbox and idempotency
- Deterministic Temporal workflow identity
- Idempotent Temporal activities and signals
- Reconciliation

Blob upload and metadata registration cannot be atomic. The producer shall upload to a unique temporary or final immutable object name, verify integrity, then commit registration metadata and event outbox. Unregistered orphan objects shall be detected and cleaned by an audited reconciliation process after a configured safety period.

## 16. Redis boundary

Redis may hold reconstructable cache, rate-limit counters, and explicitly approved short-lived coordination. Redis shall not hold the only copy of business state, workflow state, processing results, artifact metadata, outbox, inbox, audit state, or credentials. Loss of Redis shall not cause authoritative data loss.

## 17. Backup, retention, and deletion

Final retention durations, RPO, and RTO belong in an operational data-retention and recovery standard. Until accepted:

- Source and final deliverable artifacts shall not be automatically deleted.
- Temporary work may be cleaned only through explicit configuration and auditable execution.
- Outbox/inbox records shall remain long enough to cover replay and deduplication requirements.
- Cross-context deletion shall be coordinated through approved contracts, never direct database access.

## 18. Security

- Azure storage and PostgreSQL use encryption at rest and encrypted transport.
- Azure service access uses managed identity where supported.
- Credentials and temporary access URLs are not persisted in business records, messages, or logs.
- Upload and download sessions are short-lived and minimally scoped.
- Sensitive customer metadata and diagnostics are minimized and access controlled.

## 19. Migrations

Each service versions and executes only its schema migrations. CI shall test forward migration. Destructive change requires compatibility, backup, and rollback planning. Schema and contract evolution shall support independent service deployment.

## 20. Local-to-cloud mapping

| Capability | Local | Cloud |
|---|---|---|
| Application database | PostgreSQL container | Azure Database for PostgreSQL Flexible Server |
| Artifact storage | Azurite | Azure Blob Storage |
| Cache | Redis-compatible local container | Approved Azure-hosted Redis-compatible cache |
| Workflow | Temporal container | Temporal deployment on AKS |
| Messaging | Approved local adapter or emulator | Azure Service Bus |

SQLite and local filesystem are not production-parity substitutes for integration tests governed by this ADR. Lightweight unit tests may use fakes behind the same ports.

## 21. Observability

Telemetry shall cover database latency and failure, pool health, migration status, outbox backlog and age, inbox duplicates, artifact transfer/checksum/size, orphan reconciliation, cache effectiveness, retention, and cleanup. Credentials, signed URLs, connection strings, and sensitive record content shall not be logged.

## 22. Testing requirements

Implementation shall include repository tests, PostgreSQL integration and migration tests, schema-role permission tests, outbox atomicity/republish tests, inbox duplicate tests, Azurite round trips, checksum mismatch tests, immutable overwrite rejection, orphan reconciliation tests, Redis-loss resilience, and local/cloud adapter contract tests.

## 23. Consequences

Benefits include explicit ownership, economical MVP deployment, future database extraction, correct large-artifact storage, reliable publication, duplicate protection, and traceable lineage.

Trade-offs include eventual consistency, schema/role administration, storage reconciliation, outbox/inbox persistence, and deferred retention/recovery values. These trade-offs are accepted.

## 24. Governance

Architecture review is required for cross-service database access, a shared business table, a new authoritative datastore, Redis as system of record, direct Temporal database access, persistent signed URLs, changed artifact ownership, binary overwrite, or automatic deletion before retention approval.

## 25. Decision outcome

Scan2BIM adopts one MVP application PostgreSQL instance with service-owned schemas and roles, isolated Temporal persistence, Azure Blob Storage or Azurite for immutable versioned artifacts, Redis only for reconstructable cache and temporary coordination, command/event outbox, consumer inbox/idempotency, stable Common Artifact References, explicit write ownership and lineage, and reconciliation across non-transactional boundaries.
