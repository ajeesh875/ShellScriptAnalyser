# ADR-003: Canonical Point Cloud Model

Version: 1.0

Status: Accepted

Owner: Ajeesh Kumar A

Related Documents

- Vision.md
- ADR-001 Technology Constitution
- ADR-002 Local First Development Strategy
- DomainModel.md
- BoundedContexts.md

---

# 1. Decision Title

Canonical Point Cloud Model for Format-Agnostic Scan2BIM Processing

---

# 2. Status

Accepted

This ADR establishes the Canonical Point Cloud Model as the mandatory internal representation used by Scan2BIM processing services.

---

# 3. Context

The Scan2BIM Platform is designed to transform point cloud scan data into BIM and Digital Twin-ready assets.

The platform must support:

- MVP development using publicly available datasets
- Future telecom-specific datasets
- Future customer-provided datasets
- Multiple point cloud file formats
- Format-agnostic processing
- Minimal downstream changes when new input formats are added

The MVP may use public datasets such as ScanNet and S3DIS.

These datasets may not be provided in E57 format.

They may use formats such as:

- PLY
- PCD
- XYZ
- NPY
- Dataset-specific structures

Future telecom production workflows may use:

- E57
- Customer-specific formats
- Future point cloud formats

Therefore, the platform must not directly couple segmentation, geometry extraction, IFC generation, workflow orchestration, or delivery processing to any single source file format.

---

# 4. Problem Statement

Without a Canonical Point Cloud Model, each downstream service may directly interpret source file formats.

This would create several risks:

- E57-specific processing logic may spread across services.
- Public dataset integration may become difficult.
- ScanNet and S3DIS usage may require special-case processing.
- Future telecom data migration may require major refactoring.
- Segmentation, geometry, and IFC services may become tightly coupled to ingestion formats.
- Event and API contracts may become format-specific.
- AI-generated code may introduce file-format assumptions.
- Adding future formats may require changes across multiple services.

The platform requires a common internal representation so that all source formats can be normalized before downstream processing begins.

---

# 5. Decision

The Scan2BIM Platform shall adopt a Canonical Point Cloud Model.

All supported input formats shall be normalized into this canonical representation before segmentation, geometry extraction, IFC generation, or downstream processing.

Supported source formats may include:

- PLY
- PCD
- XYZ
- NPY
- E57
- Future customer-specific formats

The Canonical Point Cloud Model shall act as the stable internal contract between ingestion and processing.

The Canonical Point Cloud Model represents a logical processing model.

It does not define the final physical schema, serialization format, storage structure, database schema, or implementation structure.

Source format handling shall remain inside ingestion adapters.

Downstream services shall operate on canonical point cloud structures and metadata, not directly on source files.

---

# 6. Core Architecture Principle

The platform shall follow this rule:

```text
Source Format
    ↓
Ingestion Adapter
    ↓
Canonical Point Cloud Model
    ↓
Segmentation
    ↓
Geometry
    ↓
IFC
    ↓
Delivery
```

This is the primary rule governing format-agnostic Scan2BIM processing.

---

# 7. Canonical Model Responsibilities

The Canonical Point Cloud Model shall provide a common representation for:

- Point coordinates
- Optional color attributes
- Optional normals
- Optional intensity values
- Optional semantic labels
- Optional instance labels
- Spatial metadata
- Source file metadata
- Dataset metadata
- Processing metadata

The canonical model shall support both:

- Public dataset driven MVP processing
- Future telecom-specific production processing

---

# 8. Canonical Model Scope

The Canonical Point Cloud Model represents the normalized internal processing view of point cloud data.

It is NOT:

- A replacement for the original source file
- A database schema
- A BIM model
- An IFC model
- A segmentation result
- A geometry model
- A visualization model
- A UI data model

The original source file shall remain stored as an artifact.

The canonical representation may be stored as a normalized artifact and referenced by metadata.

---

# 9. Source File Handling

The platform shall preserve the original uploaded source file.

The original source file shall be stored as an immutable or traceable artifact.

The ingestion process shall generate or register the canonical representation separately.

This enables future reprocessing if:

- Ingestion logic changes
- Segmentation models improve
- Geometry extraction improves
- Format parsers improve
- Telecom-specific classification improves

---

# 10. Ingestion Adapter Responsibility

Ingestion adapters are responsible for transforming source formats into the Canonical Point Cloud Model.

Examples:

- PLY Adapter
- PCD Adapter
- XYZ Adapter
- NPY Adapter
- E57 Adapter
- Future Customer Format Adapter

Each adapter shall:

- Validate source data
- Extract geometry data
- Extract metadata
- Normalize structure
- Produce canonical output
- Report validation issues

Adapters belong to the Ingestion Context.

---

# 11. Downstream Service Responsibility

Downstream services consume canonical point cloud data only.

## Segmentation Context

Consumes:

- Canonical Point Cloud Data

Produces:

- SegmentationResult

The Segmentation Context shall not perform source-file parsing.

---

## Geometry Context

Consumes:

- SegmentationResult
- Canonical metadata where required

Produces:

- GeometryModel

The Geometry Context shall not perform source-file parsing.

---

## IFC Context

Consumes:

- GeometryModel

Produces:

- IFCModel

The IFC Context shall not perform source-file parsing.

---

## Workflow Context

Coordinates:

- Processing lifecycle
- Retry handling
- Workflow tracking

The Workflow Context shall not parse source formats.

---

## Delivery Context

Delivers:

- IFC files
- Artifacts
- Outputs

The Delivery Context shall not parse source formats.

---

# 12. Required Canonical Data Concepts

The Canonical Point Cloud Model defines logical concepts and responsibilities.

This ADR does not define the final physical schema, storage format, serialization format, or implementation structure.

## Point Data

Examples:

- x
- y
- z

---

## Attribute Data

Examples:

- red
- green
- blue
- intensity
- normal_x
- normal_y
- normal_z

---

## Label Data

Examples:

- semantic_label
- instance_label
- class_name

This is especially important for ScanNet and S3DIS.

---

## Spatial Metadata

Examples:

- coordinate_system
- units
- scale
- bounding_box
- transform_matrix

---

## Source Metadata

Examples:

- source_file_id
- source_file_name
- source_format
- source_dataset
- original_storage_path

---

## Processing Metadata

Examples:

- canonical_artifact_id
- created_at
- created_by_adapter
- validation_status
- adapter_version

---

# 13. Canonical Model and Public Datasets

The platform shall support public dataset driven MVP development.

Examples:

- ScanNet
- S3DIS

The platform shall treat public datasets as valid sources after ingestion normalization.

The MVP pipeline shall not require E57 input.

The MVP aims to validate:

- End-to-end workflow
- Segmentation
- Geometry extraction
- IFC generation
- Traceability

Telecom optimization is a later concern.

---

# 14. Canonical Model and Telecom E57 Processing

The platform shall support future telecom E57 workflows.

E57 shall be treated as:

- One supported format

E57 shall NOT be treated as:

- The internal platform model

Future flow:

```text
E57
   ↓
E57 Adapter
   ↓
Canonical Point Cloud Model
   ↓
Standard Processing Pipeline
```

No downstream redesign shall be required because of E57 adoption.

---

# 15. Storage Strategy Alignment

The original file and canonical artifact shall be treated as artifacts.

Storage strategy:

- Blob Storage for large artifacts
- PostgreSQL for operational metadata
- Redis not used as system of record

This aligns with ADR-001.

---

# 16. Local First Alignment

The Canonical Point Cloud Model shall support:

```text
Source File
    ↓
Ingestion Adapter
    ↓
Canonical Artifact
    ↓
Segmentation
    ↓
Geometry
    ↓
IFC
```

through local Docker Compose execution.

Cloud deployment shall require configuration changes only.

---

# 17. Contract Implications

Future contracts shall depend on canonical concepts.

Examples:

- pointCloudFileId
- canonicalArtifactId
- ingestionRequestId
- sourceFormat
- workflowId
- validationStatus

Contracts shall not assume E57-only processing.

Detailed contracts will be defined later in:

- EventContracts.md
- APIContracts.md
- QueueContracts.md

---

# 18. Event Implications

The canonical model will influence future events.

Potential Examples:

- PointCloudFileRegistered
- CanonicalPointCloudCreated
- CanonicalPointCloudValidationFailed
- SegmentationRequested
- SegmentationCompleted
- GeometryExtractionRequested
- GeometryGenerated
- IFCGenerationRequested
- IFCGenerated

This ADR does not define final event payloads.

---

# 19. API Implications

The canonical model will influence future APIs.

Potential Examples:

- Upload file
- Create ingestion request
- Validate ingestion
- Query canonical artifact status
- Start workflow
- Query workflow status
- Download output

This ADR does not define final API designs.

---

# 20. Service Boundary Implications

## Ingestion Context

Owns:

- Source file validation
- Source file adapters
- Canonical model creation

---

## Workflow Context

Coordinates:

- Processing lifecycle
- Workflow execution
- Retry handling

Consumes:

- Canonical processing requests

Produces:

- Workflow state transitions

The Workflow Context does not parse source file formats.

---

## Segmentation Context

Consumes:

- Canonical Point Cloud Data

Produces:

- SegmentationResult

---

## Geometry Context

Consumes:

- SegmentationResult

Produces:

- GeometryModel

---

## IFC Context

Consumes:

- GeometryModel

Produces:

- IFCModel

No downstream service owns source-file parsing.

---

### Delivery Context

Consumes:

- IFCModel
- Generated Artifacts

Produces:

- Deliverable Outputs

The Delivery Context does not parse source file formats.

---

# 21. Alternatives Considered

## Alternative 1: E57-Only Pipeline

Rejected because:

- MVP uses public datasets
- Public datasets are not necessarily E57
- Future formats become expensive to support

---

## Alternative 2: Format-Specific Processing

Rejected because:

- Parsing logic is duplicated
- Service complexity increases
- Integration becomes harder

---

## Alternative 3: Direct IFC Conversion

Rejected because:

- Segmentation and geometry are required first
- IFC is a deliverable, not a processing model

---

## Alternative 4: Undefined Internal Model

Rejected because:

- Inconsistent assumptions
- Contract drift
- Service integration issues

---

# 22. Consequences

## Positive Consequences

- Supports ScanNet and S3DIS
- Supports E57 and future telecom workflows
- Prevents E57-centric architecture
- Supports service independence
- Simplifies future format additions
- Supports Local First development
- Improves contract consistency

---

## Negative Consequences

- Requires adapter development
- Requires canonical validation
- Requires schema governance
- Requires artifact versioning

These trade-offs are accepted.

---

# 23. Governance Rules

The following are not permitted without a future ADR:

- Direct E57 dependency in Segmentation Context
- Direct E57 dependency in Geometry Context
- Direct source-file parsing in IFC Context
- Format-specific workflow contracts
- Format-specific event contracts
- Service-specific canonical models

Any new format must be introduced through an ingestion adapter.

Any breaking change to the Canonical Point Cloud Model requires an approved ADR.

---

# 24. Decision Outcome

The Scan2BIM Platform adopts the Canonical Point Cloud Model as the mandatory internal representation for point cloud processing.

Processing shall follow:

```text
Source Format
    ↓
Ingestion Adapter
    ↓
Canonical Point Cloud Model
    ↓
Segmentation
    ↓
Geometry
    ↓
IFC
    ↓
Delivery
```

This decision is accepted as ADR-003.