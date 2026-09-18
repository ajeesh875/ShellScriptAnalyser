# Scan2BIM Domain Model

Version: 1.0

Status: Accepted

Owner: Ajeesh Kumar A

Related Documents

- Vision.md
- ADR-001 Technology Constitution

---

# 1. Purpose

This document defines the core business domain model of the Scan2BIM Platform.

The domain model establishes the common business language used by:

- Architects
- Developers
- AI Coding Agents
- Business Stakeholders
- API Contracts
- Event Contracts
- Workflow Definitions

The domain model is intentionally technology independent and must not contain infrastructure-specific concerns.

---

# 2. Domain Overview

The Scan2BIM Platform transforms point cloud scan data into BIM and Digital Twin ready assets through a workflow-driven processing pipeline.

The platform follows an ingestion-first architecture where all incoming scan data is normalized through a common ingestion capability before workflow execution begins.

Conceptually:

Project
→ Site
→ Ingestion Request
→ Point Cloud File
→ Workflow
→ Segmentation
→ Geometry Extraction
→ IFC Generation
→ Deliverable Artifacts

---

# 3. Core Business Entities

## 3.1 Project

Represents a business engagement, program, or customer initiative.

Examples:

- Ericsson Digital Twin Program
- Telecom Shelter Transformation
- Utility Asset Modernization

Responsibilities:

- Groups related Sites
- Provides governance and ownership
- Supports reporting and auditing

Attributes:

- projectId
- projectName
- customerName
- description
- status
- createdAt

Relationships:

Project
→ contains one or more Sites

---

## 3.2 Site

Represents a physical location being scanned and modeled.

Examples:

- Telecom Shelter
- Equipment Room
- Utility Facility
- Data Center Room

Attributes:

- siteId
- siteName
- siteType
- location
- metadata

Relationships:

Site
→ belongs to Project

Site
→ contains one or more Ingestion Requests

---

## 3.3 Ingestion Request

Represents a request to onboard scan data into the Scan2BIM Platform.

This is a first-class business entity.

Purpose:

Normalize all ingestion channels before workflow initiation.

Supported Sources:

- Upload Portal
- External Portal
- REST API
- Webhook
- Future Automated Sources

Attributes:

- ingestionRequestId
- sourceType
- requester
- requestTimestamp
- status

Relationships:

Ingestion Request
→ belongs to Site

Ingestion Request
→ contains one or more PointCloudFiles

Ingestion Request
→ initiates Workflow

---

## 3.4 Point Cloud File

Represents uploaded scan content.

The platform is format agnostic.

Examples:

- PLY
- PCD
- XYZ
- NPY
- E57

Attributes:

- fileId
- fileName
- fileFormat
- fileSize
- storagePath
- uploadedAt

Relationships:

PointCloudFile
→ belongs to Ingestion Request

PointCloudFile
→ is transformed into Canonical Point Cloud Data

---

## 3.5 Workflow

Represents the lifecycle of Scan2BIM processing activities and tracks execution state throughout the processing lifecycle.

Responsibilities:

- Processing coordination
- Progress tracking
- Retry handling
- Status management

Attributes:

- workflowId
- workflowType
- status
- startedAt
- completedAt

Relationships:

Workflow
    Coordinates processing
    Tracks stage and result references
    Does not own processing results or generated-artifact metadata

Segmentation Context
    Owns SegmentationResult
    Owns segmentation artifact metadata

Geometry Context
    Owns GeometryModel
    Owns geometry artifact metadata

IFC Context
    Owns IFCModel
    Owns IFC validation outcomes and IFC artifact metadata

Delivery Context
    Owns DeliverableArtifact
    Owns DownloadSession
    Owns DeliveryRecord

---

## 3.6 Artifact

Represents any generated file or intermediate output.

Examples:

- Segmented Point Clouds
- Images
- Geometry JSON
- IFC Files
- Validation Reports

Attributes:

- artifactId
- artifactType
- storagePath
- version
- generatedAt

Relationships:

An artifact is owned by the bounded context that creates and registers it.

Artifacts retain `workflowId` for lineage and correlation, but they do not belong to the Workflow Aggregate merely because they were created during that workflow.

---

# 4. Processing Domain

## 4.1 Segmentation Result

Represents semantic classification generated from point cloud processing.

Purpose:

Identify meaningful business objects within scan data.

Attributes:

- segmentationResultId
- modelVersion
- classesDetected
- confidenceMetrics
- generatedAt

Relationships:

Segmentation Result
→ generated from PointCloudFile

Segmentation Result
→ produces Geometry Model

---

## 4.2 Geometry Model

Represents structured geometry extracted from segmentation output.

Purpose:

Provide BIM-ready geometric representations.

Attributes:

- geometryModelId
- objectCount
- geometryVersion
- generatedAt

Relationships:

Geometry Model
→ generated from Segmentation Result

Geometry Model
→ contains BIM Objects

Geometry Model
→ produces IFC Model

---

## 4.3 IFC Model

Represents the final BIM deliverable.

Purpose:

Provide an interoperable BIM representation.

Attributes:

- ifcModelId
- ifcVersion
- storagePath
- generatedAt

Relationships:

IFC Model
→ generated from Geometry Model

IFC Model
→ delivered to consumers

---

# 5. BIM Object Domain

## 5.1 Structural Objects

### Wall

Represents structural walls.

### Floor

Represents floor surfaces.

### Ceiling

Represents ceiling structures.

### Door

Represents entrances connected to walls.

Relationship:

Door
→ belongs to Wall

---

## 5.2 Telecom Objects

The platform is designed for future telecom specialization.

Current target classes may include:

### Rack

Telecom equipment rack.

### Cabinet

Equipment cabinet.

### Battery Cabinet

Battery enclosure.

Relationships:

Battery Cabinet
→ contains Batteries

Battery Cabinet
→ contains Rectifiers

### Battery

Power storage component.

### Rectifier

Power conversion component.

---

# 6. Domain Events (Conceptual)

The following business events may occur within the platform.

Examples:

- IngestionRequested
- PointCloudFileRegistered
- IngestionValidated
- WorkflowStarted
- SegmentationCompleted
- GeometryGenerated
- IFCGenerated
- ArtifactDelivered
- WorkflowCompleted
- WorkflowFailed

These events will be formally defined in EventContracts.md.

---

## 7. Aggregate Boundaries

The recommended aggregate boundaries are:

### Project Aggregate

- Project
- Site

### Ingestion Aggregate

- IngestionRequest
- PointCloudFile
- CanonicalPointCloud

### Workflow Aggregate

- Workflow
- WorkflowStage

The Workflow Aggregate stores references to processing results and
artifacts but does not own those results or artifact metadata.

### Segmentation Aggregate

- SegmentationResult
- Segmentation artifact metadata

### Geometry Aggregate

- GeometryModel
- Geometry artifact metadata

### IFC Aggregate

- IFCModel
- IFCValidationResult
- IFC and validation-report artifact metadata

### Delivery Aggregate

- DeliverableArtifact
- DownloadSession
- DeliveryRecord

The aggregates belong to their respective bounded contexts.

Cross-aggregate and cross-context relationships are represented through
identifiers, approved APIs, commands, events, and projections.

They are not represented through shared persistence ownership or
cross-context object references.

---

## 8. Domain Relationships

```text
Project
└── Site
    └── IngestionRequest
        ├── PointCloudFile
        │   └── CanonicalPointCloud
        └── Workflow
            └── WorkflowStage references

CanonicalPointCloud
    └── referenced by SegmentationResult

SegmentationResult
    └── referenced by GeometryModel

GeometryModel
    └── referenced by IFCModel

IFCModel
    ├── associated with IFCValidationResult
    └── referenced by DeliverableArtifact

DeliverableArtifact
    ├── authorizes DownloadSession
    └── records DeliveryRecord

---

# 9. Domain Principles

## Technology Independence

Domain entities must not depend on:

- FastAPI
- PostgreSQL
- Redis
- Azure Service Bus
- Temporal
- Blob Storage

---

## Format Independence

Domain models shall not depend directly on:

- E57
- PLY
- PCD
- XYZ
- NPY

Format-specific processing shall remain within ingestion adapters.

---

## Channel Independence

Domain processing shall remain independent of:

- Upload Portal
- External Portals
- REST APIs
- Webhooks

All channels must converge through the Ingestion Request domain concept.

---

## Digital Twin Readiness

The domain model shall support future:

- Asset Metadata
- Asset Relationships
- Digital Twin Enrichment
- Asset Lifecycle Management
- Asset Intelligence

without requiring redesign of the platform foundation.