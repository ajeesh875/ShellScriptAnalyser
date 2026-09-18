# Scan2BIM Platform Vision

Version: 1.0

Status: Architecture Foundation Document

Owner: Ajeesh Kumar A

---

# 1. Vision Statement

Create an enterprise-grade, AI-enabled Scan2BIM platform that transforms raw reality-capture data into reliable BIM and Digital Twin assets through scalable, secure, observable, and cloud-native automation.

The platform shall remain format-agnostic, enabling adoption of publicly available datasets during MVP development while supporting future telecom-specific datasets, customer datasets, and workflows through pluggable ingestion capabilities and a canonical point cloud model.

---

# 2. Platform Vision

The Scan2BIM Platform is an enterprise-scale automation platform designed to convert point cloud scan data into structured BIM deliverables with minimal manual intervention.

The platform provides a lightweight web-based upload portal that serves as a user-friendly entry point into the Scan2BIM platform.

The portal is intentionally minimal and acts only as a client of the platform's ingestion capability.

Portal Responsibilities:
- Upload Point Cloud Files
- Capture Basic Metadata
- Create Ingestion Requests
- View Processing Status
- Download Generated Outputs

The portal does not contain business logic, workflow orchestration, AI processing, geometry extraction, IFC generation, or artifact management logic.
The Upload Portal is a user experience component and is not considered a bounded context or business capability.

The portal acts as a client of the Ingestion Context and may be replaced by external portals, APIs, automated integrations, or future ingestion channels without requiring changes to workflow orchestration, processing services, or downstream business capabilities.

All processing responsibilities remain within backend services.

The platform shall support multiple ingestion channels including:
- Internal Scan2BIM Upload Portal
- External Customer Portals
- REST APIs
- Webhooks
- Future Automated Ingestion Mechanisms

Regardless of the source channel, all requests shall be normalized through a common ingestion capability.

After successful validation and creation of all required canonical artifacts, the Ingestion Context publishes the authoritative canonical artifact facts.

The Workflow Context evaluates complete Ingestion Request readiness and creates the Temporal workflow idempotently.

Workflow execution shall then be orchestrated through backend services using Temporal and event-driven communication patterns.

This ensures that all ingestion channels follow a common processing path irrespective of the source system.

This approach ensures that future portals, customer systems, APIs, and automated integrations can reuse the same ingestion capability without changing downstream processing services.

The ingestion layer is responsible for:

- File Validation
- Metadata Capture
- Artifact Registration
- Workflow Initiation
- Ingestion Auditing

The platform ingests point cloud scan data, processes it through an AI-driven and workflow-orchestrated microservice architecture, and produces structured outputs such as:

- IFC Models
- Geometry Metadata
- Processing Artifacts
- Digital Twin Ready Assets

The platform shall support multiple point cloud formats through a pluggable ingestion architecture.

Supported formats may include:

- PLY
- PCD
- XYZ
- NPY
- E57
- Future Customer-Specific Formats

The processing pipeline shall operate on a Canonical Point Cloud Model rather than directly on source file formats.

This enables:

- MVP development using ScanNet and S3DIS
- Future telecom-specific datasets
- Customer-specific datasets
- Minimal downstream service changes

The long-term vision is to establish a reusable Digital Twin Enablement Platform capable of supporting:

- Telecom
- Utilities
- Energy
- Construction
- Infrastructure
- Industrial Facilities

The platform shall be:

- Cloud Native
- Event Driven
- Workflow Orchestrated
- Secure by Design
- Observable by Default
- AI Assisted
- Local First
- Enterprise Ready

---

# 3. Business Problem

Creating BIM models from point-cloud scans is traditionally labor-intensive, expensive, time-consuming, and dependent on specialized BIM engineers.

Organizations generate large volumes of reality-capture data, but converting those scans into usable BIM and Digital Twin assets often requires extensive manual effort.

This results in:

- High Operational Costs
- Long Delivery Timelines
- Inconsistent Output Quality
- Limited Scalability
- Reduced Engineering Productivity
- Challenges in Creating and Maintaining Digital Twins

The Scan2BIM Platform aims to eliminate these challenges through workflow automation, AI-assisted processing, and cloud-native architecture.

---

# 4. Business Objectives

## 4.1 Reduce Manual BIM Effort

Automate the conversion of point cloud scans into BIM-ready outputs and significantly reduce manual modeling activities.

## 4.2 Accelerate Delivery Timelines

Reduce turnaround time from scan acquisition to IFC generation.

## 4.3 Improve Consistency and Quality

Provide standardized workflows that generate repeatable and consistent outputs.

## 4.4 Enable Enterprise Scale

Support increasing scan volumes without proportional growth in engineering effort.

## 4.5 Establish Digital Twin Foundations

Create trusted Digital Twin-ready assets.

## 4.6 Improve Traceability and Governance

Provide complete visibility of workflows, processing stages, outputs, failures, retries, and audits.

## 4.7 Increase Operational Efficiency

Reduce manual intervention through orchestration-driven automation.

## 4.8 Provide Self-Service Ingestion

Provide a lightweight portal enabling users to:

- Upload files
- Initiate workflows
- Track progress
- Download outputs

## 4.9 Create a Reusable Enterprise Platform

Build reusable platform capabilities rather than project-specific solutions.

---

# 5. Delivery and Validation Strategy

The MVP shall prioritize proving platform feasibility before domain optimization.

The objective is to validate the complete Scan-to-BIM pipeline while minimizing dependency on telecom-specific datasets.

---

## 5.1 Platform First, Domain Optimization Later

Initial success shall be measured through:

- Workflow Execution
- Service Integration
- Segmentation Execution
- Geometry Extraction
- IFC Generation
- Reliability
- Traceability
- Operational Visibility

Telecom-specific optimization shall be introduced after platform validation.

---

## 5.2 Public Dataset First Strategy

The MVP shall leverage publicly available datasets such as:

- ScanNet
- S3DIS
- Similar Semantic Point Cloud Datasets

Benefits:

- Existing semantic labels
- Reduced annotation effort
- Faster experimentation
- Lower project cost
- Faster MVP validation

The architecture shall not assume E57 as the only supported format.

Supported formats include:

- PLY
- PCD
- XYZ
- NPY
- E57

Future formats must be introducible through ingestion adapters.

Processing shall occur through a Canonical Point Cloud Model.

---

## 5.3 Labeling Minimization Principle

The platform shall prioritize:

- Existing labeled datasets
- Transfer Learning
- Semi-Supervised Learning
- Synthetic Data Generation
- Auto Labeling
- Human Assisted Validation

Manual labeling shall be treated as a last resort.

---

## 5.4 Progressive Telecom Specialization

Future releases may introduce:

- Telecom-specific classes
- Telecom-specific datasets
- Fine-tuned models
- Advanced geometry extraction
- Telecom asset intelligence

without redesigning the platform.

---

## 5.5 Feasibility Before Precision

During MVP:

Proving end-to-end feasibility is more important than achieving telecom-grade accuracy.

Primary validation goals:

- Workflow Completion
- Stable Architecture
- Reliable Orchestration
- Reproducible Results
- IFC Generation Capability
- Operational Readiness

---

## 5.6 Future Data Strategy

The platform shall support:

- Telecom Datasets
- Customer Datasets
- Synthetic Training Data
- Continuous Model Improvement
- Automated Enrichment Pipelines
- Digital Twin Asset Intelligence

---

# 6. Strategic Objectives

## Phase 1 – Scan to BIM Automation

Key Outcomes:

- Upload Portal
- Common Ingestion Layer
- Webhook Integration Capability
- Automated Workflow Execution
- AI Segmentation
- Geometry Extraction
- IFC Generation
- Job Monitoring
- Artifact Download
- Operational Visibility

---

## Phase 2 – Industrialized BIM Production

Key Outcomes:

- Independent Service Scaling
- Multi-Project Processing
- Production Operations
- Standardized Deployments

---

## Phase 3 – Digital Twin Enablement

Key Outcomes:

- Digital Twin Ready Assets
- Asset Metadata Enrichment
- Reality Capture Integration
- Asset Lifecycle Support

---

## Phase 4 - AI Assisted Engineering

Key Outcomes:

- Automated Validation
- Quality Assurance
- Asset Recognition
- Engineering Recommendations

---

## Phase 5 – Intelligent Asset Platform

Key Outcomes:

- Asset Intelligence
- Predictive Analytics
- Operational Optimization
- Digital Twin Synchronization

---

# 7. Architecture Vision

Platform Architecture:

- Microservices Architecture

Communication Architecture:

- Event Driven Architecture

Workflow Architecture:

- Temporal Workflow Orchestration

Internal Service Architecture:

- Clean Architecture

Data Integration Architecture:

- Canonical Point Cloud Model

Deployment Architecture:

- Cloud Native

---

# 8. Solution Principles

## SP-01 Architecture Governance

Architecture decisions are owned by architects and documented through ADRs.

## SP-02 Microservice Architecture

Services shall be independently deployable and independently scalable.

## SP-03 Domain Driven Design

Bounded contexts shall define service ownership and responsibilities.

## SP-04 Ingestion First Architecture

All platform entry points shall be normalized through a common ingestion capability.

## SP-05 Canonical Point Cloud Model

All processing services shall operate on a canonical internal model.

## SP-06 Format Agnostic Processing

Business services shall not depend on source file formats.

## SP-07 Python Everywhere

All backend services shall be implemented in Python.

## SP-08 FastAPI Everywhere

All APIs shall use FastAPI.

## SP-09 Temporal Workflow Orchestration

All long-running processes shall be orchestrated by Temporal.

## SP-10 Event Driven Communication

Inter-service communication shall use Azure Service Bus.

## SP-11 Contract First Development

Contracts shall be defined before implementation.

## SP-12 Pydantic Everywhere

All contracts shall use Pydantic models.

## SP-13 PostgreSQL as Strategic Data Platform

PostgreSQL is the primary operational database.

MongoDB Atlas is not approved.

## SP-14 Redis as Distributed Cache

Redis shall be used for caching and transient state.

## SP-15 Blob Storage for Artifacts

Large artifacts shall be stored in Azure Blob Storage.

## SP-16 Local First Development

Every capability must run locally through Docker Compose.

## SP-17 Cloud Native Deployment

The platform shall be deployable to AKS.

## SP-18 Observability First

OpenTelemetry shall be implemented from Day One.

## SP-19 Security By Design

Security shall be a built-in capability.

## SP-20 Infrastructure As Code

Infrastructure shall be provisioned through Terraform.

## SP-21 Continuous Delivery

Deployments shall be automated through GitHub Actions.

## SP-22 Failure Tolerant Processing

All services shall support retries, compensation, idempotency, and recovery.

## SP-23 AI Assisted Development

AI acts as an implementation assistant, not an architect.

## SP-24 Independent Service Scalability

Services shall scale according to workload needs.

## SP-25 Reusable Platform Mindset

Build platform capabilities for future reuse.

## SP-26 Digital Twin Readiness

Every major decision should support future Digital Twin evolution.

## SP-27 Channel Independent Ingestion

The platform shall support multiple ingestion channels including portals, APIs, webhooks, and future automated sources.

All channels shall be normalized through a common ingestion capability before workflow initiation.

Downstream services including workflow orchestration, segmentation, geometry extraction, IFC generation, and artifact delivery shall remain independent of the ingestion source.

This ensures new ingestion channels can be introduced with minimal changes to downstream services.

---

# 9. Platform Scope

## In Scope

- Upload Portal
- Webhook Integrations
- Point Cloud Ingestion
- Workflow Orchestration
- AI Segmentation
- Geometry Extraction
- IFC Generation
- Artifact Storage
- Monitoring
- Observability

## Out Of Scope (MVP)

- Telecom-Specific Model Training
- BIM Editing Tools
- AR/VR Applications
- Digital Twin Visualization Platforms
- Mobile Applications
- ERP Integrations

---

# 10. Architecture Constraints

- Python is the only approved backend language.
- MongoDB Atlas is not approved.
- Business logic shall remain technology independent.
- New technologies require ADR approval.
- Cloud deployment shall not be a prerequisite for development.
- Source formats shall never dictate processing architecture.

---

# 11. AI Development Principles

AI systems are implementation assistants.

AI systems may:

- Generate Code
- Generate Tests
- Generate Documentation

AI systems may not:

- Change Architecture
- Modify ADRs
- Change Platform Standards
- Introduce New Technologies
- Change Service Boundaries
- Modify Contracts Without Approval

---

# 12. Non-Functional Goals

- Reliability
- Scalability
- Availability
- Maintainability
- Extensibility
- Traceability
- Security
- Testability
- Portability
- Observability
- Recoverability

---

# 13. Approved Technology Standards

Frontend

- React
- TypeScript
- Vite
- TanStack Query
- Axios

Backend

- Python 3.13+

API Framework

- FastAPI

Workflow Engine

- Temporal

Database

- PostgreSQL

Cache

- Redis

Messaging

- Azure Service Bus

Object Storage

- Azure Blob Storage

Validation

- Pydantic

Observability

- OpenTelemetry

Infrastructure As Code

- Terraform

CI/CD

- GitHub Actions

Local Runtime

- Docker Compose

Cloud Runtime

- Azure Kubernetes Service (AKS)

Architecture Style

- Microservices

Internal Service Architecture

- Clean Architecture

Communication Style

- Event Driven Architecture

Data Integration Pattern

- Canonical Point Cloud Model

---

# 14. Definition of Success

## Business Outcomes

- Reduced BIM Modeling Effort
- Faster Scan-to-BIM Delivery
- Improved Output Consistency
- Digital Twin Readiness

## Platform Outcomes

- End-to-End Automation
- Multi-Format Support
- Telecom Dataset Readiness
- Complete Workflow Traceability
- Reusable Processing Pipelines

## Engineering Outcomes

- Local First Development
- Cloud Native Deployment
- Independent Service Scalability
- Comprehensive Observability
- Architecture Governance Through ADRs

## AI Outcomes

- Safe AI-Assisted Development
- Consistent Code Generation
- Architecture Compliance

## Strategic Outcomes

- Digital Twin Enablement Platform
- Asset Intelligence Foundation
- Cross-Industry Reusability