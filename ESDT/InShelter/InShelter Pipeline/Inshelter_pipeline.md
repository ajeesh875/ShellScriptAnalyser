# ESDT Scan2BIM — Inshelter (Single-Scan) Pipeline Architecture

 

## Table of Contents

 

1. [Overview](#overview)

2. [Microservices](#microservices)

3. [End-to-End Pipeline Flow](#end-to-end-pipeline-flow)

4. [High-Level Design (HLD)](#high-level-design-hld)

5. [Communication Patterns](#communication-patterns)

6. [Queue Message Schemas](#queue-message-schemas)

7. [Low-Level Design (LLD)](#low-level-design-lld)

8. [Error Handling & Retry](#error-handling--retry)

9. [Infrastructure & Configuration](#infrastructure--configuration)

10. [Monitoring & Observability](#monitoring--observability)

 

---

 

## Overview

 

The **Inshelter (Single-Scan) Pipeline** processes individual E57 point cloud scans of telecom equipment shelters. It identifies indoor components (walls, doors, racks, cabinets, batteries, rectifiers, floors, ceilings) from a single scan face and produces an IFC BIM model.

 

**Key differentiator from Full-Site:** This pipeline handles enclosed shelter interiors with wall detection, 2-pass segmentation (coarse + refined), and uses a separate .NET-based IFC creation microservice.

 

```

Input:  E57 point cloud scan (single face of equipment shelter)

Output: IFC file (BIM model of shelter interior components)

```

 

**Typical processing time:** 20-90 minutes depending on scan complexity

 

---

 

## Microservices

 

| Service | Repo | Language | Port | Responsibility |

|---------|------|----------|------|----------------|

| Root Orchestrator | `esdt-scan-2-bim-root-microservice` | TypeScript (NestJS) | 3000 | Temporal workflow orchestration, REST API, message routing |

| Segmentation | `esdt-scan-2-bim-segmentation-microservice` | Python (GPU) | 5000 | E57 cropping, ML inference (2-pass), wall extraction, image extraction |

| Post-Processing | `esdt-scan-2-bim-post-processing-microservice` | Python | 4000 | Geometry extraction from segmented data, component detection |

| IFC Creation | `esdt-scan-2-bim-ifc-creation-microservice` | C# (.NET/xBIM) | — | JSON → IFC BIM model conversion |

 

---

 

## End-to-End Pipeline Flow

 

```

┌──────────────────────────────────────────────────────────────────────────────┐

│                        INSHELTER PIPELINE FLOW                                │

└──────────────────────────────────────────────────────────────────────────────┘

 

Step 1: USER UPLOAD

   User uploads E57 file → ESDT Portal → DataRepo

   DataRepo triggers webhook to Root MS

 

Step 2: WORKFLOW INITIATION

   Root MS (POST /webhook):

     • Validates: fileType=e57, fileID, customerID, siteID required

     • Generates workflowId: "scan2bim-{uuid}"

     • Sends to esdt-s2b-root-queue

     • MongoDB: status=PENDING

 

Step 3: QUEUE PROCESSING → TEMPORAL WORKFLOW

   Queue Processor picks from esdt-s2b-root-queue:

     • Type: WEBHOOK_EVENT → OrchestrationService.initiateWorkflow()

     • Starts Temporal workflow: 'scan2bimWorkflow'

     • MongoDB: status=RUNNING

 

Step 4: GENERATE SAS URL (Synchronous Activity)

   Temporal executes: generateSasUrlActivity

     • Calls DataRepo API → returns download SAS URL for E57 file

     • Duration: ~2-5 seconds

 

Step 5: START SEGMENTATION (Async Dispatch)

   Temporal executes: startSegmentationActivity

     • Sends message to esdt-s2b-segmentation-queue

     • Workflow enters WAITING state for SEGMENTATION signal

 

Step 6: SEGMENTATION PROCESSING (GPU)

   Segmentation MS (Job Mode — runs to completion, exits):

     ┌──────────────────────────────────────────────────┐

     │ PASS 1: Coarse Segmentation                      │

     │ ├── Download E57 from SAS URL                    │

     │ ├── Image extraction (parallel process)          │

     │ ├── XY Cropping (remove noise, histogram-based)  │

     │ ├── ML Inference (Pointcept, GPU)                │

     │ │   Classes: wall, door, rack, cabinet,          │

     │ │   battery, rectifier, floor, ceiling, ...      │

     │ └── Output: segmented PLY (pass 1)               │

     ├──────────────────────────────────────────────────┤

     │ WALL EXTRACTION (inline)                         │

     │ ├── WallExtractionService.run()                  │

     │ ├── Detect wall planes from inference output     │

     │ ├── Compute bbox2d, elevations, rotation info    │

     │ └── Output: wall geometry JSON                   │

     ├──────────────────────────────────────────────────┤

     │ PASS 2: Refined Segmentation                     │

     │ ├── Crop using wall bbox (tighter bounds)        │

     │ ├── Apply rotation correction if needed          │

     │ ├── ML Inference (higher precision)              │

     │ ├── Inverse-rotate results back to original frame│

     │ └── Output: segmented PLY (pass 2 — refined)    │

     └──────────────────────────────────────────────────┘

     • Upload outputs to Azure Blob Storage

     • Send to esdt-s2b-root-queue: type=SEGMENTATION_COMPLETE

     • Send to post-processing-queue: type=POST_PROCESSING_AND_UPLOAD_START

 

Step 7: POST-PROCESSING

   Post-Processing MS:

     • Consumes from post-processing-queue

     • Downloads segmented PLY from Blob (path from message payload)

     • Geometry extraction pipeline:

       - Wall detection & plane fitting

       - Door detection (within wall planes)

       - Rack identification (OBB fitting)

       - Cabinet detection

       - Battery identification

       - Rectifier detection

       - Floor/ceiling plane extraction

     • Outputs: geometry JSON

     • IFC Creation (or delegates to IFC MS)

     • Sends to esdt-s2b-root-queue: type=POST_PROCESSING_AND_UPLOAD_COMPLETE

     • HTTP Signal: POST /api/signal/activity (activityName=POST_PROCESSING)

 

Step 8: IFC CREATION

   IFC Creation MS (C# .NET):

     • Receives JSON geometry data

     • Converts to IFC using xBIM library

     • Uploads IFC to final Blob Storage

     • HTTP Signal: POST /api/signal/activity (activityName=IFC_CREATION)

 

Step 9: WORKFLOW COMPLETION

   Root MS receives completion signals:

     • Updates MongoDB: status=COMPLETED

     • Temporal workflow completes

     • IFC file available in DataRepo

```

 

---

 

## High-Level Design (HLD)

 

### System Architecture

 

```

┌────────────────────────────────────────────────────────────────────────┐

│                      ESDT Portal                                        │

│                 (User uploads E57 scan)                                  │

└─────────────────────────┬──────────────────────────────────────────────┘

                          │ Webhook (Entra ID auth)

                          ▼

┌────────────────────────────────────────────────────────────────────────┐

│                ROOT MICROSERVICE (NestJS)                               │

│                Port: 3000 | Path: /api/*                                │

│                                                                         │

│  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────────┐   │

│  │ Webhook     │  │ Orchestration    │  │ Signal Controller       │   │

│  │ Controller  │  │ Service          │  │ POST /api/signal/       │   │

│  │ POST /webhook│  │ (Temporal client)│  │ activity                │   │

│  └──────┬──────┘  └────────┬─────────┘  └────────────┬────────────┘   │

│         │                   │                          │                │

│  ┌──────┴──────────────────┴──────────────────────────┴──────────┐     │

│  │                    Queue Processor                              │     │

│  │  Routes: WEBHOOK_EVENT → SEGMENTATION_COMPLETE →               │     │

│  │          POST_PROCESSING_AND_UPLOAD_COMPLETE                    │     │

│  └────────────────────────────────────────────────────────────────┘     │

│                                                                         │

│  ┌──────────────────────────┐  ┌──────────────────────────────────┐    │

│  │ Temporal Workflow         │  │ MongoDB Repository               │    │

│  │ • generateSasUrl         │  │ • workflow_executions             │    │

│  │ • startSegmentation      │  │ • activity_executions             │    │

│  │ • startPostProcessing    │  │                                   │    │

│  └──────────────────────────┘  └──────────────────────────────────┘    │

└────────────────────────────────────────────────────────────────────────┘

         │                              │                        ▲

         │ esdt-s2b-                    │ esdt-s2b-              │ HTTP Signal

         │ segmentation-queue           │ root-queue             │ /api/signal/activity

         ▼                              ▼                        │

┌─────────────────────────┐    ┌────────────────────┐           │

│ SEGMENTATION MS         │    │ Azure Service Bus  │           │

│ (Python + NVIDIA GPU)   │    │ Queues:            │           │

│                         │    │ • root-queue       │           │

│ • E57 Download (SAS)    │    │ • segmentation-q   │           │

│ • XY Crop (histogram)   │    │ • post-processing-q│           │

│ • Pass-1 Inference      │    └────────────────────┘           │

│ • Wall Extraction       │                                     │

│ • Pass-2 Refined Crop   │                                     │

│ • Pass-2 Inference      │                                     │

│ • Image Extraction      │                                     │

│ • Upload to Blob        │─────────────────────────────────────┘

│                         │

│ KEDA: 0→2 GPU replicas  │

└─────────┬───────────────┘

          │ Blob Storage (segmented PLY) + post-processing-queue message

          ▼

┌─────────────────────────┐

│ POST-PROCESSING MS      │

│ (Python)                │

│                         │

│ Components extracted:   │

│ • Wall (planes)         │

│ • Door (within walls)   │

│ • Rack (OBB)           │

│ • Cabinet              │

│ • Battery              │

│ • Battery Cabinet      │

│ • Rectifier            │

│ • Floor / Ceiling      │

│                         │

│ Output: Geometry JSON   │

└─────────┬───────────────┘

          │

          ▼

┌─────────────────────────┐

│ IFC CREATION MS         │

│ (C# .NET / xBIM)       │

│                         │

│ • JSON → IFC conversion │

│ • Uploads to Blob       │

│ • Signals Root MS       │

└─────────────────────────┘

```

 

### Segmentation — 2-Pass Architecture

 

The Inshelter segmentation uses a unique **2-pass approach**:

 

```

                    E57 Point Cloud

                         │

                    ┌────┴────┐

                    │ PASS 1  │  (Coarse — full scan)

                    ├─────────┤

                    │ xy_crop │  Histogram-based noise removal

                    │    ↓    │

                    │Inference│  Full point cloud ML inference

                    │    ↓    │

                    │ Output  │  Coarse segmented PLY

                    └────┬────┘

                         │

                    ┌────┴────────────────┐

                    │ WALL EXTRACTION      │

                    │ WallExtractionService│

                    │ • Detect wall planes │

                    │ • Compute bbox2d     │

                    │ • Detect rotation    │

                    │ • Compute elevations │

                    └────┬────────────────┘

                         │

               ┌─────────┴─────────┐

               │                    │

        is_rotated=1          is_rotated=0

               │                    │

    ┌──────────┴──────┐   ┌────────┴────────┐

    │ Rotate to axis- │   │ Direct bbox     │

    │ aligned frame   │   │ crop            │

    │ Crop by bbox    │   │ (no rotation)   │

    └────────┬────────┘   └────────┬────────┘

             │                      │

             └──────────┬───────────┘

                        │

                   ┌────┴────┐

                   │ PASS 2  │  (Refined — wall-bounded)

                   ├─────────┤

                   │Inference│  Tighter bounds → higher precision

                   │    ↓    │

                   │ Rotate  │  Inverse-rotate back to original frame

                   │  back   │  (if was rotated)

                   │    ↓    │

                   │ Output  │  Refined segmented PLY

                   └─────────┘

```

 

---

 

## Communication Patterns

 

| From | To | Method | Description |

|------|----|--------|-------------|

| ESDT Portal → DataRepo | Root MS | HTTP Webhook (Entra ID) | File upload event notification |

| Root MS → Segmentation | Service Bus queue | `esdt-s2b-segmentation-queue` |

| Root MS → Post-Processing | Service Bus queue | `post-processing-queue` (dispatched by Temporal) |

| Segmentation → Root MS | Service Bus queue | `esdt-s2b-root-queue` (SEGMENTATION_COMPLETE) |

| Segmentation → Post-Processing | Service Bus queue | Direct dispatch to post-processing-queue |

| Post-Processing → Root MS | HTTP POST | `/api/signal/activity` (POST_PROCESSING) |

| IFC Creation → Root MS | HTTP POST | `/api/signal/activity` (IFC_CREATION) |

| Root MS ↔ Temporal | gRPC | Workflow start, signals, queries |

| Root MS ↔ MongoDB | Driver | Workflow/activity state persistence |

| Services ↔ Blob Storage | Azure SDK | File upload/download (Managed Identity) |

 

---

 

## Queue Message Schemas

 

### Webhook → Root Queue

 

```json

{

  "id": "uuid-001",

  "workflowId": "scan2bim-abc123",

  "type": "WEBHOOK_EVENT",

  "step": "INITIATE_WORKFLOW",

  "payload": {

    "eventType": "file.uploaded",

    "fileType": "e57",

    "customerId": "customer-123",

    "siteId": "site-456",

    "category": "pointcloud",

    "fileId": "file-789",

    "timestamp": "2024-01-01T00:00:00Z"

  },

  "source": "webhook-handler"

}

```

 

### Root → Segmentation Queue

 

```json

{

  "id": "uuid-002",

  "workflowId": "scan2bim-abc123",

  "type": "SEGMENTATION_START",

  "step": "START_SEGMENTATION",

  "payload": {

    "sasUrl": "https://storage.blob.core.windows.net/...?sv=...",

    "customerId": "customer-123",

    "siteId": "site-456",

    "fileId": "file-789"

  },

  "source": "scan2bim-orchestrator"

}

```

 

### Segmentation → Root Queue (Status Update)

 

```json

{

  "id": "uuid-003",

  "workflowId": "scan2bim-abc123",

  "type": "SEGMENTATION_COMPLETE",

  "step": "SEGMENTATION_DONE",

  "payload": {

    "segmentedFileUrl": "https://blob.storage/segmented/output.ply",

    "pointCount": 1500000,

    "wallJson": "path/to/walls.json",

    "pass2Available": true

  },

  "source": "segmentation-microservice"

}

```

 

### Segmentation → Post-Processing Queue (Direct)

 

```json

{

  "id": "uuid-004",

  "workflowId": "scan2bim-abc123",

  "type": "POST_PROCESSING_AND_UPLOAD_START",

  "step": "POST_PROCESSING_AND_UPLOAD",

  "payload": {

    "segmentedFilePath": "inference/output.ply",

    "segmentedFilePathPass2": "inference_pass2/output.ply",

    "wallJson": "postproc/walls.json",

    "imagesDir": "images/",

    "customerId": "customer-123",

    "siteId": "site-456",

    "fileId": "file-789"

  },

  "source": "segmentation-microservice"

}

```

 

### Post-Processing → Root Queue (Completion)

 

```json

{

  "id": "uuid-005",

  "workflowId": "scan2bim-abc123",

  "type": "POST_PROCESSING_AND_UPLOAD_COMPLETE",

  "step": "POST_PROCESSING_AND_UPLOAD_DONE",

  "payload": {

    "ifcFilePath": "output/shelter_model.ifc",

    "geometryJson": "output/result.json"

  },

  "source": "post-processing-microservice"

}

```

 

### HTTP Signal (Activity Completion)

 

```json

POST /api/signal/activity

{

  "workflowId": "scan2bim-abc123",

  "activityName": "SEGMENTATION",

  "status": "COMPLETED",

  "output": {

    "segmentedFileUrl": "https://...",

    "pointCount": 1500000

  }

}

```

 

---

 

## Low-Level Design (LLD)

 

### Root MS — Key Modules

 

```typescript

// webhook.service.ts

class WebhookService {

  handleWebhook(event: WebhookEvent): Promise<void>

  // Validates e57 type, generates workflowId, queues to root-queue

}

 

// orchestration.service.ts

class OrchestrationService {

  initiateWorkflow(payload: WorkflowPayload): Promise<string>

  sendActivitySignal(workflowId: string, signal: ActivitySignal): Promise<void>

  // Starts Temporal workflow, sends signals, tracks in MongoDB

}

 

// queue.processor.ts

class QueueProcessor {

  processMessage(message: QueueMessage): Promise<void>

  // Routes: WEBHOOK_EVENT | SEGMENTATION_COMPLETE | POST_PROCESSING_AND_UPLOAD_COMPLETE

}

 

// temporal.workflow.ts — Temporal Workflow Definition

async function scan2bimWorkflow(payload): Promise<void> {

  // Activity 1: Generate SAS URL

  await generateSasUrlActivity(payload)

  // Wait for signal: SEGMENTATION complete

  await condition(() => segmentationDone)

  // Activity 2: Track post-processing

  await startPostProcessingAndUploadActivity(payload)

  // Wait for signal: POST_PROCESSING complete

  await condition(() => postProcessingDone)

  // Wait for signal: IFC_CREATION complete

  await condition(() => ifcCreationDone)

}

 

// signal.controller.ts

@Controller('signal')

class SignalController {

  @Post('activity')

  handleActivitySignal(body: SignalDto): Promise<void>

  // Validates workflowId, activityName, status; forwards to Temporal

}

```

 

### Segmentation MS — Pipeline Architecture

 

```python

class SegmentationPipelineMP:

    """

    Multi-pass E57 segmentation pipeline with wall-aware refinement.

    Runs as a KEDA-scaled job (exits after processing).

    """

   

    def process_e57(self, e57_file_path: str) -> dict:

        """

        Full segmentation pipeline:

        1. Image extraction (parallel process)

        2. Pass-1: XY crop → ML inference (coarse)

        3. Wall extraction (inline)

        4. Pass-2: Wall-bbox crop (with rotation if needed) → ML inference (refined)

       

        Returns: {

            'cropped_ply': str,           # Pass-1 cropped file

            'inference_results': str,      # Pass-1 inference output dir

            'images': str,                 # Extracted images dir

            'wall_json': str,             # Wall geometry JSON path

            'wall_bbox2d': dict,          # Wall bounding box 2D

            'wall_bbox3d': dict,          # Wall bounding box 3D

            'cropped_ply_pass2': str,     # Pass-2 cropped file

            'inference_results_pass2': str # Pass-2 inference output dir

        }

        """

   

    def _crop_e57(self, e57_path: str, output_dir: str) -> None:

        """XY histogram-based cropping to remove scanner noise."""

        # Uses xy_crop() from cropping_algo module

   

    def _run_inference(self, input_path: str, output_dir: str,

                       R_inv=None, center=None) -> None:

        """

        Run Pointcept ML inference.

        If R_inv and center provided, applies inverse rotation to output.

        """

   

    def _extract_images_parallel(self, e57_path: str, output_dir: str) -> None:

        """Extract 2D images from E57 (runs in separate process)."""

 

class WallExtractionService:

    """Detects wall planes from inference output."""

   

    def run(self, inference_dir: str, out_dir: str,

            floor_ceiling_thickness: float) -> dict:

        """

        Returns: {

            'walls_json': str,              # Path to walls JSON

            'bbox2d': dict,                 # {x_min, x_max, y_min, y_max}

            'bbox3d': dict,                 # Full 3D bounding box

            'elevations': [float, float],   # [z_min, z_max]

            'rotation': {

                'is_rotated': int,          # 0 or 1

                'rotation_matrix': list,    # 3x3 matrix

                'center_point': list,       # [x, y, z]

                'inverse_rotation_matrix': list

            }

        }

        """

```

 

### Post-Processing MS — Component Extractors

 

```python

# Component classes (app/components/)

class Wall:

    """Plane fitting for wall surfaces."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

 

class Door:

    """Door detection within wall plane bounds."""

    def extract_geometry(self, segmented_ply: str, walls: list) -> list[dict]

 

class Rack:

    """Equipment rack detection (OBB fitting)."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

 

class Cabinet:

    """Cabinet identification and dimensioning."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

 

class Battery:

    """Battery unit detection."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

 

class BatteryCabinet:

    """Battery cabinet enclosure detection."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

 

class Rectifier:

    """Power rectifier identification."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

 

class FloorCeiling:

    """Floor and ceiling plane extraction."""

    def extract_geometry(self, segmented_ply: str) -> list[dict]

```

 

### IFC Creation MS — .NET Service

 

```csharp

// IFCWriter.cs

public class IFCWriter

{

    /// <summary>

    /// Converts geometry JSON to IFC file using xBIM library.

    /// Maps components: Wall → IfcWall, Door → IfcDoor,

    /// Rack → IfcFurniture, Cabinet → IfcDistributionElement, etc.

    /// </summary>

    public void CreateIFC(string jsonInputPath, string outputPath);

}

```

 

---

 

## Error Handling & Retry

 

### Temporal Workflow Retries

 

| Level | Max Attempts | Backoff |

|-------|-------------|---------|

| Activity retry | 3 | Exponential: 1s, 2s, 4s (max 100s) |

| Workflow retry | 5 | Exponential: 2s, 4s, 8s, 16s |

| HTTP Signal (from MS) | 3 | Exponential: 1s, 2s, 4s |

 

### Failure Scenarios

 

| Scenario | Action |

|----------|--------|

| Segmentation fails (OOM) | Signal FAILED → Workflow fails → MongoDB: FAILED |

| Post-Processing fails | Signal FAILED → Workflow fails → MongoDB: FAILED |

| IFC Creation fails | Signal FAILED → Workflow fails → MongoDB: FAILED |

| Invalid signal request | HTTP 400 (missing fields) |

| Workflow not found | HTTP 500 (Temporal error) |

| Temporal unavailable | 3 retries, then HTTP 500 |

| No walls detected | `NoWallsDetectedException` → Pass-2 skipped, continue with Pass-1 |

 

### Dead Letter Queue

 

Poison messages that fail all Service Bus retries are routed to DLQ for manual inspection.

 

---

 

## Infrastructure & Configuration

 

### Environment Variables — Root MS

 

```env

PORT=3000

SERVICE_BUS_CONNECTION_STRING=<connection-string>

SERVICE_BUS_QUEUES=esdt-s2b-root-queue

SEGMENTATION_QUEUE_NAME=esdt-s2b-segmentation-queue

POST_PROCESSING_QUEUE_NAME=esdt-s2b-post-processing-queue

TEMPORAL_ADDRESS=temporal-frontend.temporal.svc:7233

TEMPORAL_NAMESPACE=default

MONGODB_URI=mongodb://...

MONGODB_DATABASE=scan2bim

DATA_REPO_HOST=<data-repo-url>

```

 

### Environment Variables — Segmentation MS

 

```env

SERVICEBUS_MODE=azure-identity

SERVICE_BUS_FQDN=esdt-test-eus-namespace.servicebus.windows.net

SEGMENTATION_QUEUE=esdt-s2b-segmentation-queue

AZURE_CLIENT_ID=<managed-identity-client-id>

MODEL_CONFIG_FILE=/models/config.yaml

MODEL_CHECKPOINT_PATH=/models/checkpoint.pth

INFERENCE_DEVICE=cuda

INFERENCE_METHOD=block_stream

INFERENCE_BLOCK_SIZE=10.0

```

 

### Kubernetes Resources

 

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit | GPU |

|---------|------------|-----------|----------------|--------------|-----|

| Root MS | 750m | 1524m | 1840Mi | 2048Mi | — |

| Segmentation | 4000m | 16000m | 16Gi | 200Gi | 1x NVIDIA |

| Post-Processing | 750m | 1524m | 20Gi | 24Gi | — |

| IFC Creation | 500m | 1000m | 2Gi | 4Gi | — |

 

---

 

## Monitoring & Observability

 

### Key Metrics

 

- **Workflow duration:** webhook → completion (target: <90 min)

- **Pass-1 inference time:** ~5-15 min

- **Pass-2 inference time:** ~3-10 min

- **Post-processing time:** ~10-45 min

- **IFC creation time:** ~5-15 min

 

### Log Correlation

 

All services include `workflowId` for end-to-end tracing:

 

```

[Root] Webhook triggered - workflowId: scan2bim-abc123

[Root] Starting Temporal workflow scan2bim-abc123

[Segmentation] Processing workflow scan2bim-abc123

[Segmentation] Pass-1 complete, Pass-2 starting

[Segmentation] Sent COMPLETED signal for scan2bim-abc123

[PostProcessing] Processing workflow scan2bim-abc123

[PostProcessing] IFC creation complete for scan2bim-abc123

```

 

### MongoDB State Queries

 

```javascript

// Check workflow status

db.workflow_executions.findOne({ workflowId: "scan2bim-abc123" })

 

// List all activities for a workflow

db.activity_executions.find({ workflowId: "scan2bim-abc123" })

```