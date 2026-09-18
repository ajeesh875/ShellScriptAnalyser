
----
Initially Planned  folder structure. But agent will change it as per the needs.

scan2bim-architecture/

├── README.md

├── docs/
│
├── business/
│   ├── vision.md
│   ├── objectives.md
│   ├── scope.md
│   └── use-cases.md
│
├── architecture/
│   ├── hld.md
│   ├── lld.md
│   ├── deployment.md
│   ├── security.md
│   └── observability.md
│
├── domain/
│   ├── bounded-contexts.md
│   ├── domain-model.md
│   └── glossary.md
│
├── contracts/
│   ├── api-contracts.md
│   ├── event-contracts.md
│   └── schemas/
│
├── standards/
│   ├── coding-standards.md
│   ├── testing-standards.md
│   ├── logging-standards.md
│   └── security-standards.md
│
├── ai/
│   ├── ai-instructions.md
│   ├── generation-rules.md
│   └── prompts/
│
└── adrs/
    ├── ADR-001-python.md
    ├── ADR-002-temporal.md
    ├── ADR-003-postgresql.md
    └── ADR-004-servicebus.md




2. ADR-001 Technology Constitution
4
3. ADR-002 Local First Development
5
4. ADR-003 Canonical Point Cloud Model
6
5. ADR-004 Event Driven Architecture
7
6. ADR-005 Temporal Workflow Architecture
8
 
9
7. DomainModel.md
10
8. BoundedContexts.md
11
9. Glossary.md
12
 
13
10. EventContracts.md
14
11. APIContracts.md
15
12. Schemas/
16
 
17
13. CodingStandards.md
18
14. TestingStandards.md
19
15. LoggingStandards.md
20
16. SecurityStandards.md
21
 
22
17. AIInstructions.md
23
18. GenerationRules.md
24
 
25
19. ADR-006 Storage Strategy
26
20. ADR-007 Security Architecture
27
21. ADR-008 Observability First
28
22. ADR-009 AI-Assisted Development
29
23. ADR-010 Microservice Boundaries
30
 
31
24. Repository Setup
32
25. Docker Compose Platform
33
26. Pydantic Contracts
34
27. Service Skeletons
35
28. Happy Path MVP
36
29. AI / Segmentation Experiments
37
30. Telecom Specialization

----

some other assumptions
Micro service level architetcure
That has for a simple portal to ingest files and then only it will start the remaining process including temporal. This is much needed because if we are using another external  portal to ingest it should work with minimal changes(especially temporal is needed to do this). Also we are doing a simple front end portal and tech stack for that also needed to be used
Training data availability. -Also I am planning Leverage publicly available point cloud datasets for initial MVP than telecom in shelter point cloud datasets. ScanNet/S3DIS dataset are completely legit and widely recognized in computer vision. If we use  from scannet or s3dis the data will not be .e57 format. It will be different format. Point cloud labeling strategy. – Manual Labelling is expensive and time taking strategy. The data available from ScanNet/S3DIS will be semantically labelled. This will reduce the time and efforts drastically(Out of 28 member nCircle team nearly 10       resources are dedicated for manual labelling).

IFC output validation and quality assurance. - Focus first on proving end-to-end feasibility rather than telecom-specific accuracy. Also well defined micorservice architecture should be followed.

---