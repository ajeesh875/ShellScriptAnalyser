# Scan2BIM API Contracts

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
- EventContracts.md

---

# 1. Purpose

This document defines the logical HTTP API contracts exposed by the Scan2BIM Platform.

It establishes:

- API ownership and service boundaries
- Resource naming and versioning
- Request and response conventions
- Project and site management APIs
- Ingestion request and point cloud upload APIs
- Channel-independent upload webhook APIs
- Workflow query and cancellation APIs
- Artifact query and download APIs
- Idempotency, concurrency, pagination, validation, and error rules
- Security, observability, and local-to-cloud compatibility requirements

These contracts are the authoritative HTTP interface definitions for the Upload Portal, approved external portals, REST API clients, webhook producers, and other authorized consumers.

---

# 2. Scope

This document defines public and platform-facing HTTP APIs owned by:

- `project-service`
- `ingestion-service`
- `workflow-service`
- `delivery-service`

The following processing services do not expose public business APIs in the MVP:

- `segmentation-service`
- `geometry-service`
- `ifc-service`

Those services are invoked through Temporal workflow activities and approved commands, not directly by the Upload Portal or external portals.

This document does not define:

- Azure Service Bus queues, topics, subscriptions, sessions, or retry settings
- Processing command payloads
- Temporal workflow or activity contracts
- Physical Pydantic class definitions
- PostgreSQL schemas
- Physical Canonical Point Cloud serialization
- Authentication provider configuration
- Role and permission definitions
- AKS ingress implementation
- User interface layouts or component state

Those concerns shall be defined in:

- `queue-contracts.md`
- `workflow-contracts.md`
- `contracts/schemas/`
- Security architecture and standards
- Deployment architecture

---

# 3. API Architecture Principles

## 3.1 Resource-Oriented APIs

APIs shall use nouns representing domain resources.

Approved examples:

- `/projects`
- `/sites`
- `/ingestion-requests`
- `/point-cloud-files`
- `/workflows`
- `/artifacts`

Processing commands shall not be exposed as arbitrary controller-style endpoints.

## 3.2 Channel-Independent Ingestion

The Scan2BIM Upload Portal, external customer portals, REST clients, webhooks, bulk utilities, and future automated sources shall use the same Ingestion Context contracts.

The Upload Portal shall not call Temporal, Azure Service Bus, segmentation, geometry, or IFC services directly.

## 3.3 Thin Frontend

The Upload Portal shall use APIs to:

- Manage project and site selectors where required
- Create ingestion requests
- Request upload sessions
- View ingestion and workflow status
- List artifacts
- Obtain authorized download sessions

Business orchestration and processing logic must remain in backend services.

## 3.4 Asynchronous Processing

Long-running processing shall be asynchronous.

APIs initiating ingestion or processing shall return an accepted resource or current resource state and shall not keep an HTTP request open until segmentation, geometry extraction, IFC generation, or delivery completes.

## 3.5 Large Files Are Not Embedded in JSON

Point cloud files and generated artifacts shall not be Base64 encoded or embedded in JSON payloads.

The preferred upload flow uses a short-lived upload session so the file can be transferred directly to the approved object storage endpoint.

## 3.6 Stable Logical Contracts

Logical API paths, request models, response models, and error semantics shall remain identical across local and cloud environments.

Only environment configuration, hostnames, credentials, and infrastructure bindings may change.

## 3.7 Contract-First Validation

All API requests and responses shall be represented by versioned Pydantic models and exposed through FastAPI-generated OpenAPI documentation.

---

# 4. Base Path and Versioning

All APIs shall use this base path:

```text
/api/v1
```

Examples:

```text
/api/v1/projects
/api/v1/ingestion-requests
/api/v1/workflows/{workflowId}
/api/v1/artifacts/{artifactId}
```

Rules:

- Major versions are carried in the URL.
- Backward-compatible additions do not require a new URL version.
- Breaking changes require a new major API version and migration plan.
- Deprecated APIs must publish a replacement and removal policy before removal.

---

# 5. Media Types and Serialization

Default request and response media type:

```text
application/json
```

Problem responses shall use:

```text
application/problem+json
```

File transfer media types shall reflect the actual content type.

JSON field naming shall use `camelCase`.

Timestamps shall use ISO 8601 UTC.

Identifiers shall be serialized as strings.

Unknown optional response fields must be tolerated by clients.

---

# 6. Standard Request Headers

## 6.1 Authorization

```text
Authorization: Bearer <token>
```

Required for protected APIs.

The final identity provider, scopes, roles, and authorization policies will be defined by the Security Architecture.

## 6.2 Correlation Identifier

```text
X-Correlation-ID: <uuid>
```

Rules:

- Clients may supply a correlation identifier.
- The platform shall generate one if it is absent.
- The value shall be returned in the response and propagated to events, commands, workflow execution, and telemetry.

## 6.3 Idempotency Key

```text
Idempotency-Key: <unique-client-key>
```

Required for create and action requests where duplicate execution could cause duplicate business effects.

## 6.4 Distributed Trace Context

Approved trace propagation headers:

```text
traceparent
a tracestate header when applicable
```

The `traceparent` header name is normative. Trace context shall be propagated through OpenTelemetry-compatible instrumentation.

## 6.5 Conditional Update

```text
If-Match: <etag>
```

Required when updating versioned mutable resources where optimistic concurrency is enforced.

---

# 7. Standard Response Headers

Responses shall include, where applicable:

```text
X-Correlation-ID
ETag
Location
Retry-After
```

Rules:

- `Location` shall identify a newly created or accepted resource when applicable.
- `ETag` shall identify the current representation version for concurrency-controlled resources.
- `Retry-After` may be supplied for rate limiting or temporary unavailability.

---

# 8. Standard Error Contract

All non-success responses shall use a consistent problem response.

```json
{
  "type": "https://scan2bim.example/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "One or more request fields are invalid.",
  "instance": "/api/v1/ingestion-requests",
  "errorCode": "REQUEST_VALIDATION_FAILED",
  "correlationId": "uuid",
  "errors": [
    {
      "field": "siteId",
      "code": "REQUIRED",
      "message": "siteId is required."
    }
  ]
}
```

Rules:

- `errorCode` must be stable and machine-readable.
- `detail` must be safe for clients.
- Stack traces, secrets, access tokens, connection strings, and internal topology must not be exposed.
- Validation errors should identify invalid fields without exposing implementation details.

---

# 9. Standard HTTP Status Codes

```text
200 OK                  Successful retrieval or update
201 Created             Resource created synchronously
202 Accepted            Asynchronous action accepted
204 No Content          Successful request with no response body
400 Bad Request         Malformed request or invalid syntax
401 Unauthorized        Missing or invalid authentication
403 Forbidden           Authenticated caller lacks permission
404 Not Found           Resource does not exist or is not visible to caller
409 Conflict            State conflict or idempotency conflict
412 Precondition Failed ETag or precondition failure
413 Content Too Large   Upload exceeds the accepted size policy
415 Unsupported Media Type Unsupported content type or point cloud format
422 Unprocessable Content Semantic validation failure
429 Too Many Requests   Rate limit exceeded
500 Internal Server Error Unexpected server failure
503 Service Unavailable Temporary dependency or service unavailability
```

---

# 10. Pagination and Filtering

Collection APIs shall use continuation-token pagination.

Example request:

```text
GET /api/v1/projects?pageSize=50&continuationToken=<token>
```

Standard response:

```json
{
  "items": [],
  "pageSize": 50,
  "continuationToken": "next-token-or-null"
}
```

Rules:

- Default and maximum page sizes shall be configuration-driven and published in OpenAPI.
- Continuation tokens are opaque to clients.
- Clients must not construct or modify continuation tokens.
- Filtering and sorting fields must be explicitly documented per endpoint.

---

# 11. Idempotency Rules

Idempotency is required for:

- Creating an ingestion request
- Creating a point cloud upload session
- Receiving an upload-completed webhook
- Cancelling a workflow
- Creating a download session when duplicate audit effects matter

Rules:

- The client supplies `Idempotency-Key`.
- The service stores the key with an operation fingerprint and outcome.
- Repeating the same request with the same key returns the original logical outcome.
- Reusing the same key with a materially different payload returns `409 Conflict`.
- Idempotency retention duration shall be defined in implementation standards.

---

# 12. Project Service APIs

Base resource:

```text
/api/v1/projects
```

## 12.1 Create Project

```text
POST /api/v1/projects
```

Owner: `project-service`

Required header:

```text
Idempotency-Key
```

Request:

```json
{
  "projectName": "Telecom Shelter Transformation",
  "customerName": "customer-name",
  "description": "project-description"
}
```

Response:

```text
201 Created
```

```json
{
  "projectId": "uuid",
  "projectName": "Telecom Shelter Transformation",
  "customerName": "customer-name",
  "description": "project-description",
  "status": "ACTIVE",
  "createdAt": "2026-08-20T10:00:00Z",
  "updatedAt": "2026-08-20T10:00:00Z"
}
```

Published event:

- `ProjectCreated`

## 12.2 Get Project

```text
GET /api/v1/projects/{projectId}
```

Response:

```text
200 OK
```

Returns the current Project representation and `ETag`.

## 12.3 List Projects

```text
GET /api/v1/projects?status=ACTIVE&pageSize=50&continuationToken=<token>
```

Supported initial filters:

- `status`
- `customerName`

Response:

```json
{
  "items": [
    {
      "projectId": "uuid",
      "projectName": "Telecom Shelter Transformation",
      "customerName": "customer-name",
      "status": "ACTIVE",
      "createdAt": "2026-08-20T10:00:00Z",
      "updatedAt": "2026-08-20T10:00:00Z"
    }
  ],
  "pageSize": 50,
  "continuationToken": null
}
```

## 12.4 Update Project

```text
PATCH /api/v1/projects/{projectId}
```

Required header:

```text
If-Match
```

Request:

```json
{
  "projectName": "Updated Project Name",
  "description": "updated-description",
  "status": "ACTIVE"
}
```

Rules:

- Omitted fields remain unchanged.
- Explicit nullability shall be defined in the Pydantic schema.
- Stale `ETag` values return `412 Precondition Failed`.

Published event:

- `ProjectUpdated`

---

# 13. Site APIs

Sites are owned by `project-service` and scoped under a project.

## 13.1 Create Site

```text
POST /api/v1/projects/{projectId}/sites
```

Required header:

```text
Idempotency-Key
```

Request:

```json
{
  "siteName": "Shelter-001",
  "siteType": "TELECOM_SHELTER",
  "location": {
    "latitude": 0.0,
    "longitude": 0.0,
    "elevationMeters": null
  },
  "metadata": {}
}
```

Response:

```text
201 Created
```

```json
{
  "siteId": "uuid",
  "projectId": "uuid",
  "siteName": "Shelter-001",
  "siteType": "TELECOM_SHELTER",
  "location": {
    "latitude": 0.0,
    "longitude": 0.0,
    "elevationMeters": null
  },
  "metadata": {},
  "createdAt": "2026-08-20T10:05:00Z",
  "updatedAt": "2026-08-20T10:05:00Z"
}
```

Published event:

- `SiteCreated`

## 13.2 Get Site

```text
GET /api/v1/sites/{siteId}
```

Response:

```text
200 OK
```

## 13.3 List Project Sites

```text
GET /api/v1/projects/{projectId}/sites?siteType=TELECOM_SHELTER&pageSize=50&continuationToken=<token>
```

## 13.4 Update Site

```text
PATCH /api/v1/sites/{siteId}
```

Required header:

```text
If-Match
```

Request:

```json
{
  "siteName": "Shelter-001-Updated",
  "siteType": "TELECOM_SHELTER",
  "location": {
    "latitude": 0.0,
    "longitude": 0.0,
    "elevationMeters": null
  },
  "metadata": {}
}
```

Published event:

- `SiteUpdated`

---

# 14. Ingestion Request APIs

Base resource:

```text
/api/v1/ingestion-requests
```

Owner: `ingestion-service`

## 14.1 Create Ingestion Request

```text
POST /api/v1/ingestion-requests
```

Required header:

```text
Idempotency-Key
```

Request:

```json
{
  "projectId": "uuid",
  "siteId": "uuid",
  "sourceChannel": "UPLOAD_PORTAL",
  "sourceReference": "client-reference-or-null",
  "requestedFileCount": 1,
  "metadata": {}
}
```

Supported initial `sourceChannel` values:

- `UPLOAD_PORTAL`
- `EXTERNAL_PORTAL`
- `REST_API`
- `WEBHOOK`
- `BULK_UPLOAD`
- `AUTOMATED_SOURCE`

Response:

```text
201 Created
```

```json
{
  "ingestionRequestId": "uuid",
  "projectId": "uuid",
  "siteId": "uuid",
  "sourceChannel": "UPLOAD_PORTAL",
  "sourceReference": "client-reference-or-null",
  "requestedFileCount": 1,
  "registeredFileCount": 0,
  "status": "CREATED",
  "createdAt": "2026-08-20T10:10:00Z",
  "updatedAt": "2026-08-20T10:10:00Z"
}
```

Published event:

- `IngestionRequested`

## 14.2 Get Ingestion Request

```text
GET /api/v1/ingestion-requests/{ingestionRequestId}
```

Response:

```json
{
  "ingestionRequestId": "uuid",
  "projectId": "uuid",
  "siteId": "uuid",
  "sourceChannel": "UPLOAD_PORTAL",
  "requestedFileCount": 1,
  "registeredFileCount": 1,
  "status": "CANONICALIZATION_IN_PROGRESS",
  "workflowId": null,
  "createdAt": "2026-08-20T10:10:00Z",
  "updatedAt": "2026-08-20T10:15:00Z",
  "failure": null
}
```

Supported initial status values:

- `CREATED`
- `AWAITING_UPLOAD`
- `UPLOAD_RECEIVED`
- `VALIDATING`
- `VALIDATION_FAILED`
- `CANONICALIZING`
- `CANONICALIZATION_FAILED`
- `READY_FOR_WORKFLOW`
- `WORKFLOW_STARTED`
- `FAILED`

Clients must tolerate future status values.

## 14.3 List Ingestion Requests

```text
GET /api/v1/ingestion-requests?projectId={projectId}&siteId={siteId}&status={status}&pageSize=50&continuationToken=<token>
```

Supported initial filters:

- `projectId`
- `siteId`
- `status`
- `sourceChannel`

## 14.4 List Files in an Ingestion Request

```text
GET /api/v1/ingestion-requests/{ingestionRequestId}/files?pageSize=50&continuationToken=<token>
```

Response item:

```json
{
  "pointCloudFileId": "uuid",
  "fileName": "scan.ply",
  "sourceFormat": "PLY",
  "fileSizeBytes": 123456,
  "status": "CANONICALIZED",
  "canonicalArtifactId": "uuid-or-null",
  "createdAt": "2026-08-20T10:11:00Z",
  "updatedAt": "2026-08-20T10:20:00Z"
}
```

---

# 15. Point Cloud Upload APIs

Large-file transfer shall use a two-step upload-session pattern.

```text
Create Ingestion Request
    ↓
Create Upload Session
    ↓
Upload File to Approved Storage Endpoint
    ↓
Upload Completion Webhook
    ↓
Validation and Registration
    ↓
Canonicalization
    ↓
Workflow Initiation
```

## 15.1 Create Upload Session

```text
POST /api/v1/ingestion-requests/{ingestionRequestId}/files
```

Owner: `ingestion-service`

Required header:

```text
Idempotency-Key
```

Request:

```json
{
  "fileName": "scan.ply",
  "sourceFormat": "PLY",
  "contentType": "application/octet-stream",
  "fileSizeBytes": 123456,
  "checksumAlgorithm": "SHA256",
  "checksum": "checksum-value-or-null"
}
```

Supported initial `sourceFormat` values:

- `PLY`
- `PCD`
- `XYZ`
- `NPY`
- `E57`

Future formats require an approved ingestion adapter and contract-compatible format value.

Response:

```text
201 Created
```

```json
{
  "pointCloudFileId": "uuid",
  "uploadSessionId": "uuid",
  "uploadMethod": "PUT",
  "uploadUrl": "short-lived-upload-url",
  "expiresAt": "2026-08-20T10:30:00Z",
  "requiredHeaders": {
    "Content-Type": "application/octet-stream"
  },
  "status": "AWAITING_UPLOAD"
}
```

Rules:

- `uploadUrl` is short-lived and must not be logged or persisted by clients beyond its valid use.
- The response grants only the minimum storage permission required for the upload.
- The logical API response remains identical for Azurite and Azure Blob Storage.
- The upload session does not start Temporal processing.

## 15.2 Get Point Cloud File

```text
GET /api/v1/point-cloud-files/{pointCloudFileId}
```

Response:

```json
{
  "pointCloudFileId": "uuid",
  "ingestionRequestId": "uuid",
  "fileName": "scan.ply",
  "sourceFormat": "PLY",
  "contentType": "application/octet-stream",
  "fileSizeBytes": 123456,
  "checksumAlgorithm": "SHA256",
  "checksum": "checksum-value-or-null",
  "status": "CANONICALIZED",
  "canonicalArtifactId": "uuid-or-null",
  "createdAt": "2026-08-20T10:11:00Z",
  "updatedAt": "2026-08-20T10:20:00Z",
  "failure": null
}
```

---

# 16. Upload Completion Webhook

The webhook is the common backend notification mechanism used after an approved upload completes.

It may be invoked by:

- The Scan2BIM upload flow
- An approved external portal integration
- An approved storage event adapter
- A future automated ingestion connector

## 16.1 Notify Upload Completion

```text
POST /api/v1/webhooks/ingestion/upload-completed
```

Owner: `ingestion-service`

Required headers:

```text
Idempotency-Key
X-Webhook-Event-ID
X-Correlation-ID
```

Authentication or signature verification is mandatory. The exact mechanism shall be defined by the Security Architecture and may vary by approved source integration without changing the logical payload.

Request:

```json
{
  "uploadSessionId": "uuid-or-null",
  "ingestionRequestId": "uuid",
  "pointCloudFileId": "uuid",
  "sourceChannel": "UPLOAD_PORTAL",
  "sourceConnectorId": "approved-connector-id-or-null",
  "storageReference": "logical-storage-reference",
  "fileName": "scan.ply",
  "sourceFormat": "PLY",
  "contentType": "application/octet-stream",
  "fileSizeBytes": 123456,
  "checksumAlgorithm": "SHA256",
  "checksum": "checksum-value"
}
```

Response:

```text
202 Accepted
```

```json
{
  "webhookEventId": "webhook-event-id",
  "ingestionRequestId": "uuid",
  "pointCloudFileId": "uuid",
  "status": "ACCEPTED_FOR_VALIDATION",
  "acceptedAt": "2026-08-20T10:15:00Z"
}
```

Rules:

- The webhook must be idempotent.
- `storageReference` must not contain credentials or an expiring access token.
- The caller must reference either a valid platform upload session or an approved source connector.
- The ingestion service must verify object existence, size, checksum, ownership, and permitted source before registration.
- A successful webhook response confirms acceptance, not successful validation or workflow completion.
- The webhook shall never call Temporal directly from the client layer.
- The ingestion service controls validation, registration, canonicalization, and workflow initiation.

Potential failures:

```text
400 Invalid webhook payload
401 Invalid webhook authentication
403 Source connector not permitted
404 Upload session, ingestion request, or file not found
409 Duplicate payload conflict or resource state conflict
422 Artifact verification or semantic validation failure
```

---

# 17. Workflow Query and Control APIs

Base resource:

```text
/api/v1/workflows
```

Owner: `workflow-service`

The Upload Portal and external clients use these APIs for status. They do not consume integration events directly.

## 17.1 Get Workflow

```text
GET /api/v1/workflows/{workflowId}
```

Response:

```json
{
  "workflowId": "workflow-identifier",
  "workflowType": "SCAN_TO_BIM",
  "ingestionRequestId": "uuid",
  "projectId": "uuid",
  "siteId": "uuid",
  "status": "IN_PROGRESS",
  "currentStage": "GEOMETRY_EXTRACTION",
  "progressPercent": 50,
  "startedAt": "2026-08-20T10:30:00Z",
  "completedAt": null,
  "readyArtifactIds": [],
  "failure": null
}
```

Supported initial workflow statuses:

- `STARTED`
- `CANCELLATION_REQUESTED`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

Supported initial stages:

- `SEGMENTATION`
- `GEOMETRY_EXTRACTION`
- `IFC_GENERATION`
- `IFC_VALIDATION`
- `ARTIFACT_PREPARATION`
- `COMPLETED`

`progressPercent` is optional and informational. Clients must use `status` and `currentStage` as the authoritative lifecycle indicators.

## 17.2 Get Workflow Stages

```text
GET /api/v1/workflows/{workflowId}/stages
```

Response:

```json
{
  "workflowId": "workflow-identifier",
  "items": [
    {
      "stage": "SEGMENTATION",
      "status": "COMPLETED",
      "attempt": 1,
      "startedAt": "2026-08-20T10:30:00Z",
      "completedAt": "2026-08-20T10:40:00Z",
      "resultSubjectId": "uuid",
      "resultSubjectType": "SegmentationResult",
      "failure": null
    }
  ]
}
```

## 17.3 List Workflows

```text
GET /api/v1/workflows?projectId={projectId}&siteId={siteId}&ingestionRequestId={ingestionRequestId}&status={status}&pageSize=50&continuationToken=<token>
```

Supported initial filters:

- `projectId`
- `siteId`
- `ingestionRequestId`
- `status`

## 17.4 Cancel Workflow

```text
POST /api/v1/workflows/{workflowId}/cancellation
```

Required header:

```text
Idempotency-Key
```

Request:

```json
{
  "reason": "user-requested-cancellation"
}
```

Response:

```text
202 Accepted
```

```json
{
  "workflowId": "workflow-identifier",
  "status": "CANCELLATION_REQUESTED",
  "acceptedAt": "2026-08-20T11:00:00Z"
}
```

Rules:

- Cancellation is accepted only for cancellable workflow states.
- A repeated request with the same idempotency key returns the original outcome.
- The final cancellation fact is represented by `WorkflowCancelled`.

---

# 18. Artifact and Delivery APIs

Base resource:

```text
/api/v1/artifacts
```

Owner: `delivery-service`

## 18.1 Get Artifact Metadata

```text
GET /api/v1/artifacts/{artifactId}
```

Response:

```json
{
  "artifactId": "uuid",
  "workflowId": "workflow-identifier",
  "artifactType": "IFC_MODEL",
  "fileName": "scan2bim-output.ifc",
  "contentType": "application/octet-stream",
  "sizeBytes": 123456,
  "checksumAlgorithm": "SHA256",
  "checksum": "checksum-value",
  "version": "1.0",
  "status": "READY",
  "createdAt": "2026-08-20T11:25:00Z",
  "availableAt": "2026-08-20T11:30:00Z"
}
```

The permanent storage reference is not exposed to general clients.

## 18.2 List Workflow Artifacts

```text
GET /api/v1/workflows/{workflowId}/artifacts?artifactType=IFC_MODEL&status=READY&pageSize=50&continuationToken=<token>
```

Supported initial filters:

- `artifactType`
- `status`

## 18.3 Create Download Session

```text
POST /api/v1/artifacts/{artifactId}/download-sessions
```

Required header:

```text
Idempotency-Key
```

Response:

```text
201 Created
```

```json
{
  "downloadSessionId": "uuid",
  "artifactId": "uuid",
  "downloadUrl": "short-lived-authorized-url",
  "expiresAt": "2026-08-20T11:45:00Z",
  "fileName": "scan2bim-output.ifc",
  "contentType": "application/octet-stream"
}
```

Rules:

- The caller must be authorized for the artifact.
- `downloadUrl` must be short-lived and minimally scoped.
- The URL must not be logged or persisted beyond its valid use.
- Creating a download session does not itself mean that the artifact was delivered.
- Actual successful delivery or retrieval may produce `ArtifactDelivered` through an approved delivery confirmation mechanism.

---

# 19. Health and Readiness Endpoints

Each deployable backend service shall expose:

```text
GET /health/live
GET /health/ready
```

Rules:

- Liveness indicates whether the process is running.
- Readiness indicates whether the service can safely receive traffic.
- Health responses must not expose secrets, connection strings, internal hostnames, or detailed dependency failures to unauthorized callers.
- Health endpoints are operational endpoints and not business APIs.

---

# 20. API Ownership Matrix

```text
project-service
    POST   /api/v1/projects
    GET    /api/v1/projects
    GET    /api/v1/projects/{projectId}
    PATCH  /api/v1/projects/{projectId}
    POST   /api/v1/projects/{projectId}/sites
    GET    /api/v1/projects/{projectId}/sites
    GET    /api/v1/sites/{siteId}
    PATCH  /api/v1/sites/{siteId}

ingestion-service
    POST   /api/v1/ingestion-requests
    GET    /api/v1/ingestion-requests
    GET    /api/v1/ingestion-requests/{ingestionRequestId}
    GET    /api/v1/ingestion-requests/{ingestionRequestId}/files
    POST   /api/v1/ingestion-requests/{ingestionRequestId}/files
    GET    /api/v1/point-cloud-files/{pointCloudFileId}
    POST   /api/v1/webhooks/ingestion/upload-completed

workflow-service
    GET    /api/v1/workflows
    GET    /api/v1/workflows/{workflowId}
    GET    /api/v1/workflows/{workflowId}/stages
    POST   /api/v1/workflows/{workflowId}/cancellation

delivery-service
    GET    /api/v1/artifacts/{artifactId}
    GET    /api/v1/workflows/{workflowId}/artifacts
    POST   /api/v1/artifacts/{artifactId}/download-sessions
```

Services shall not implement APIs owned by another bounded context.

---

# 21. Security and Privacy Rules

All non-health APIs are protected unless explicitly approved otherwise.

Rules:

- Authorization decisions must be enforced by the owning backend service.
- Client-supplied identity fields must not override authenticated identity.
- Upload and download URLs must be short-lived and minimally scoped.
- Webhook calls must be authenticated or cryptographically verified.
- Credentials, tokens, secrets, storage keys, and connection strings must not appear in bodies, query strings, or logs.
- Object references must be checked against caller authorization to prevent insecure direct object references.
- File names and metadata must be sanitized before operational use.
- Content type, extension, signature, size, and checksum validation policies shall be enforced by ingestion.
- Exact roles, scopes, identity provider, webhook signature scheme, and key rotation are deferred to Security Architecture.

---

# 22. Observability Rules

Each request shall emit OpenTelemetry-compatible traces, metrics, and structured logs.

Relevant dimensions include:

- `correlationId`
- `traceId`
- HTTP method
- Route template
- Status code
- Service name
- Authenticated caller reference where permitted
- `projectId`
- `siteId`
- `ingestionRequestId`
- `workflowId`
- `artifactId`
- Processing outcome

Rules:

- Query strings, authorization headers, upload URLs, download URLs, and sensitive bodies must not be logged.
- Route templates should be logged instead of high-cardinality raw paths.
- Correlation identifiers shall propagate into events, commands, and workflows.

---

# 23. Validation Rules

All requests and responses shall use versioned Pydantic models.

Validation shall cover, where applicable:

- Identifier syntax
- Required fields
- Enum values
- File name and source format
- Content type
- File size policy
- Checksum algorithm and shape
- Project and site association
- Ingestion request state
- Upload session validity
- Artifact ownership and existence
- Workflow state transitions

Unknown request fields shall follow one consistent policy defined in coding standards. Security-sensitive and command payloads should reject undeclared fields.

---

# 24. Concurrency and State Transition Rules

- Mutable resources should use `ETag` and `If-Match` for optimistic concurrency.
- State transitions must be validated by the owning service.
- Clients must not set server-owned status fields directly.
- A request invalid for the current resource state returns `409 Conflict`.
- A stale conditional update returns `412 Precondition Failed`.
- API responses are not a substitute for authoritative integration events.

---

# 25. Rate Limiting and Resilience

APIs may enforce rate limits appropriate to caller type and environment.

When rate limited:

```text
429 Too Many Requests
```

The response may include `Retry-After`.

Clients shall use bounded retries with backoff for transient errors only.

Clients must not automatically retry non-idempotent operations without an idempotency key.

Timeouts, retry limits, circuit breaking, and ingress policies will be defined in service and deployment standards.

---

# 26. Local-First and Cloud Compatibility

The same logical API contracts shall be used in:

- Local Docker Compose environments
- Automated tests
- Azure cloud environments
- AKS deployments

The following must remain unchanged:

- Base resource paths
- HTTP methods
- Request and response schemas
- Status semantics
- Error contract
- Idempotency behavior
- Webhook payloads

The following may vary by configuration:

- Hostname
- Authentication authority
- Upload and download endpoints
- Storage implementation
- Infrastructure routing

This supports:

```text
Same Code
Same Containers
Same Contracts
Different Configuration
```

---

# 27. OpenAPI and Schema Governance

Each API-owning service shall publish an OpenAPI document generated from FastAPI and Pydantic definitions.

Rules:

- OpenAPI output must be validated in CI.
- Breaking changes must be detected before merge.
- Generated OpenAPI must match the approved logical contracts in this document.
- Shared logical schemas shall be maintained under `contracts/schemas/`.
- Service-specific request and response models remain owned by the service.
- Generated client code, if used, must be generated from an approved OpenAPI version.

Recommended schema locations:

```text
contracts/schemas/common/
contracts/schemas/projects/
contracts/schemas/ingestion/
contracts/schemas/workflows/
contracts/schemas/artifacts/
```

---

# 28. API Compatibility Rules

Backward-compatible changes include:

- Adding an optional response field
- Adding an optional request field with a safe default
- Adding a new endpoint
- Adding a new enum value only when clients tolerate unknown values

Breaking changes include:

- Removing or renaming a field
- Changing field meaning or type
- Making an optional request field required
- Changing resource identity or status semantics
- Changing an endpoint method or path

Breaking changes require:

- A new major API version
- Consumer migration plan
- Compatibility period where required
- Architecture approval

---

# 29. API and Event Consistency

APIs and events shall use the same domain vocabulary and identifiers.

Examples:

```text
API field ingestionRequestId
Event field ingestionRequestId

API field workflowId
Event field workflowId

API field canonicalArtifactId
Event field canonicalArtifactId
```

Rules:

- API success does not imply that all asynchronous processing completed.
- `201 Created` confirms synchronous resource creation.
- `202 Accepted` confirms acceptance of asynchronous work, not completion.
- Integration events report authoritative cross-context facts.
- API status projections must be derived from owned state or approved event projections.

---

# 30. Frontend Integration Rules

The Upload Portal shall:

- Use project and site query APIs for selection where required
- Create an ingestion request
- Request one upload session per point cloud file
- Upload each file through the returned authorized upload endpoint
- Rely on the upload-completed webhook path to notify the Ingestion Context
- Poll or otherwise query approved ingestion and workflow status APIs
- Request authorized download sessions for ready artifacts

The Upload Portal shall not:

- Call Temporal directly
- Publish Azure Service Bus events or commands directly
- Call segmentation, geometry, or IFC services directly
- Store permanent storage credentials
- Derive authoritative processing state locally
- Treat upload completion as workflow completion

External portals may replace the Upload Portal while preserving the same ingestion request, upload completion, status, and artifact contracts.

---

# 31. Governance

All Scan2BIM HTTP APIs must comply with this document.

Architecture review is required for:

- A new public or cross-context API
- A breaking API contract change
- A change of API ownership
- Introduction of synchronous long-running processing
- Direct portal access to processing services
- Direct exposure of storage credentials
- Source-format-specific downstream APIs
- Bypassing the Ingestion or Workflow Context
- A new major API version

APIs must not be introduced only for implementation convenience.

Every API must map to an owned business capability, query, or approved operational concern.

---

# 32. Decision Outcome

The Scan2BIM Platform adopts the API contracts and governance rules defined in this document.

All public and platform-facing APIs shall use:

- Versioned resource-oriented paths
- Standard request and error conventions
- Idempotent creation and action semantics
- Correlation and trace propagation
- Asynchronous handling for long-running work
- Direct-to-approved-storage large-file transfer
- Channel-independent upload completion webhooks
- Thin-frontend integration
- Explicit bounded-context ownership
- Source-format-independent downstream behavior
- Identical logical contracts across local and cloud environments

Final Pydantic schemas and generated OpenAPI documents shall be maintained under `contracts/schemas/` and the owning service repositories.

Processing commands, queue topology, retry settings, sessions, and dead-letter behavior shall be defined separately in `queue-contracts.md`.
