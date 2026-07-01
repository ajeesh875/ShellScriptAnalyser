# Inshelter Root Microservice — Architecture & Function Flow

 

## Position in Pipeline

 

```

  ┌──────────────┐          ┌────────────────────┐          ┌──────────────────┐

  │ ESDT Portal  │──webhook─▶│  ROOT MICROSERVICE │──queue──▶│  Segmentation MS │

  │ (DataRepo)   │          │  ◀── YOU ARE HERE   │◀─signal──│                  │

  └──────────────┘          │                    │◀─signal──│  Post-Processing │

                            └────────────────────┘          └──────────────────┘

```

 

**Upstream:** ESDT Portal / DataRepo (triggers webhook on E57 upload)

**Downstream:** Segmentation MS (via queue), Post-Processing MS (via queue)

**Signals received from:** Segmentation (SEGMENTATION), Post-Processing (POST_PROCESSING)

 

---

 

## Overview

 

The Root Microservice is the NestJS orchestrator for the Inshelter pipeline. It receives file upload webhooks, creates Temporal workflows, dispatches tasks to downstream services via Azure Service Bus queues, and tracks workflow state in MongoDB.

 

| Property | Value |

|----------|-------|

| Language | TypeScript (NestJS) |

| Port | 3000 |

| Ingress Path | `/api/*` |

| Workflow Engine | Temporal.io (gRPC :7233) |

| Database | MongoDB (workflow_executions, activity_executions) |

| Messaging | Azure Service Bus (azure-identity) |

 

---

 

## Module Structure

 

```

src/

├── main.ts                         # Application bootstrap

├── app.module.ts                   # Root module

├── config/                         # Configuration (CORS, Swagger, env)

├── shared/                         # Shared decorators, guards, DTOs

├── webhook/

│   ├── webhook.controller.ts       # POST /api/webhook

│   ├── webhook.service.ts          # Event validation & workflow initiation

│   └── dto/                        # WebhookEventDto

└── module/

    ├── queue/

    │   ├── controllers/

    │   │   └── signal.controller.ts    # POST /api/signal/activity, /cancel

    │   ├── services/

    │   │   ├── orchestration.service.ts # Workflow lifecycle management

    │   │   └── queue.producer.ts       # Service Bus message sender

    │   ├── processors/

    │   │   └── queue.processor.ts      # Inbound message router

    │   └── repositories/

    │       └── workflow.repository.ts  # MongoDB CRUD

    ├── temporal/

    │   ├── workflow/

    │   │   └── temporal.workflow.ts    # Scan2BimWorkflow definition

    │   ├── activities/

    │   │   └── temporal-servicebus.activities.ts  # Activity implementations

    │   ├── workers/

    │   │   └── temporal.worker.ts     # Temporal worker process

    │   └── repositories/

    │       └── temporal-client.repository.ts

    ├── data/                          # DataRepo API client (SAS URLs, site data)

    ├── authentication/                # Entra ID / Cognito guards

    ├── azure-blob/                    # Blob storage operations

    └── logging/                       # LoggingService (structured)

```

 

---

 

## Function Flow

 

### 1. Webhook Reception

 

```typescript

// webhook.controller.ts

@Post('webhook')

handleWebhook(@Body() body: { events: WebhookEventDto[] })

 

// webhook.service.ts

async processEvent(events: WebhookEventDto[]) {

  // Validates: source === 'e57', fileID, customerID, siteID present

  // Calls: orchestrationService.initiateWorkflow(event)

  // Returns: { successes: [{event, workflowId}], failures: [{event, error}] }

}

```

 

### 2. Workflow Initiation

 

```typescript

// orchestration.service.ts

async initiateWorkflow(event: WebhookEventDto): Promise<string> {

  const workflowId = `scan2bim-${uuid()}`;

  // Sends to esdt-s2b-root-queue: { type: "WEBHOOK_EVENT", step: "INITIATE_WORKFLOW" }

  return workflowId;

}

```

 

### 3. Queue Processing

 

```typescript

// queue.processor.ts

async processMessage(message) {

  switch (message.type) {

    case 'WEBHOOK_EVENT':

      // → startTemporalWorkflow(workflowId, event)

    case 'SEGMENTATION_COMPLETE':

      // → Update MongoDB activity status

    case 'POST_PROCESSING_AND_UPLOAD_COMPLETE':

      // → Update MongoDB, signal workflow completion

  }

}

```

 

### 4. Temporal Workflow

 

```typescript

// temporal.workflow.ts

export async function Scan2BimWorkflow(input: Scan2BimWorkflowInput) {

  // Step 1: Generate SAS URL (sync, ~2-5s)

  const sasResult = await generateSasUrlActivity(input);

 

  // Step 2: Start Segmentation (async dispatch + wait for signal)

  await startSegmentationActivity({ ...input, sasUrl });

  await condition(() => signals.find(s => s.activityName === 'SEGMENTATION'), 4h);

  // ↑ Waits for HTTP signal from Segmentation MS

 

  // Step 3: Track Post-Processing + wait for signal

  await startPostProcessingAndUploadActivity(input);

  await condition(() => signals.find(s => s.activityName === 'POST_PROCESSING'), 4h);

  // ↑ Waits for HTTP signal from Post-Processing MS

}

```

 

### 5. Signal Reception

 

```typescript

// signal.controller.ts

@Post('activity')

async receiveActivitySignal(@Body() signal: ActivitySignalDto) {

  // Validates: workflowId, activityName ∈ [SEGMENTATION, POST_PROCESSING], status ∈ [COMPLETED, FAILED]

  // Forwards to Temporal: handle.signal('activityCompleted', signal)

}

 

@Post('cancel')

async cancelWorkflow(@Body() body: CancelWorkflowDto) {

  // Terminates Temporal workflow with reason

}

```

 

---

 

## Temporal Activities Detail

 

| Activity | Action | Output |

|----------|--------|--------|

| `generateSasUrlActivity` | Calls DataRepo API to get download SAS URL | `{ sasUrl, fileName, fileId }` |

| `startSegmentationActivity` | Sends message to segmentation queue, fetches site metadata | `{ queueName, taskId }` |

| `startPostProcessingAndUploadActivity` | Records activity in MongoDB | `{ status: 'IN_PROGRESS' }` |

 

Each activity: max 3 retries, exponential backoff (1s, 2s, 4s), 30-min timeout.

 

---

 

## Queue Messages Produced

 

### To Segmentation Queue (`esdt-s2b-segmentation-queue`)

 

```json

{

  "traceId": "uuid",

  "workflowId": "scan2bim-xxx",

  "taskId": "uuid",

  "payload": {

    "customerId": "C001",

    "siteId": "S001",

    "projectId": "P001",

    "fileId": "F001",

    "fileUrl": https://blob.storage/...?sig=...,

    "siteName": "Site Alpha",

    "siteType": "indoor",

    "siteElevation": 0,

    "latitude": 40.7,

    "longitude": -74.0,

    "metadata": { "fileSize": 1073741824, "fileType": "e57", "uploadTimestamp": "..." }

  },

  "timestamp": "2024-01-01T00:00:00Z"

}

```

 

---

 

## MongoDB Schema

 

```typescript

// workflow_executions

{ workflowId, eventId, status, currentActivity, customerId, siteId, fileId, category, createdAt, updatedAt, completedAt?, error? }

 

// activity_executions

{ activityId, workflowId, activityName, status, input?, output?, error?, startedAt, completedAt?, retryCount }

```

 

---

 

## Connection to Next Service (Segmentation MS)

 

The Root MS dispatches work to Segmentation by sending a message to `esdt-s2b-segmentation-queue`. The Segmentation MS:

1. Consumes the message

2. Downloads E57 using the SAS URL from the payload

3. Runs GPU inference

4. Signals back via HTTP POST to `/api/signal/activity` with `activityName: "SEGMENTATION"`

5. Dispatches next step directly to post-processing queue