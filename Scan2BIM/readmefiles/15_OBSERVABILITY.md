# 15 — Observability: Logging, Metrics & Tracing

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 14_LOCAL_DEVELOPMENT.md

---

## 1. Observability Pillars

| Pillar | Tool | Purpose |
|--------|------|---------|
| Structured Logging | `structlog` + JSON | Operational debugging |
| Distributed Tracing | OpenTelemetry | Cross-service correlation |
| Metrics | OpenTelemetry + Prometheus | Performance monitoring |
| Health Checks | FastAPI endpoints | Liveness/readiness probes |

---

## 2. Correlation Strategy

**Every log line, metric, and trace MUST include `workflow_id`.**

```
[root-service]    workflow_id=scan2bim-abc123 | Workflow started
[segmentation]    workflow_id=scan2bim-abc123 | Pass-1 inference started
[segmentation]    workflow_id=scan2bim-abc123 | Pass-1 complete (14.5 min)
[post-processing] workflow_id=scan2bim-abc123 | Geometry extraction started
[post-processing] workflow_id=scan2bim-abc123 | IFC created (3.2 min)
[root-service]    workflow_id=scan2bim-abc123 | Workflow completed (52 min)
```

---

## 3. Structured Logging Configuration

```python
"""shared/sdk/logging.py"""
import structlog
import logging
from app.config import settings


def configure_logging() -> None:
    """Configure structured JSON logging for all services."""
    
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    # Set root logging level
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, settings.LOG_LEVEL.upper()),
    )


# Usage in any service:
logger = structlog.get_logger()

# Bind workflow_id for all subsequent logs in this context
structlog.contextvars.bind_contextvars(workflow_id="scan2bim-abc123")
logger.info("workflow_started", customer_id="C001", site_id="S001")
```

### Log Output Format

```json
{
    "event": "segmentation_completed",
    "level": "info",
    "logger": "app.service.segmentation_pipeline",
    "timestamp": "2026-08-12T10:30:00.123Z",
    "workflow_id": "scan2bim-abc123",
    "duration_seconds": 870.5,
    "point_count": 1500000,
    "classes_detected": ["wall", "door", "rack", "cabinet"]
}
```

---

## 4. OpenTelemetry Setup

```python
"""shared/sdk/telemetry.py"""
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor


def configure_telemetry(service_name: str, version: str) -> None:
    """Initialize OpenTelemetry for a service."""
    
    resource = Resource.create({
        "service.name": service_name,
        "service.version": version,
        "deployment.environment": settings.ENVIRONMENT,
    })
    
    # Tracing
    tracer_provider = TracerProvider(resource=resource)
    if settings.OTEL_EXPORTER_ENDPOINT:
        tracer_provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_ENDPOINT)
            )
        )
    trace.set_tracer_provider(tracer_provider)
    
    # Metrics
    meter_provider = MeterProvider(resource=resource)
    if settings.OTEL_EXPORTER_ENDPOINT:
        meter_provider.add_metric_reader(
            PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint=settings.OTEL_EXPORTER_ENDPOINT)
            )
        )
    metrics.set_meter_provider(meter_provider)
    
    # Auto-instrumentation
    FastAPIInstrumentor.instrument()
    HTTPXClientInstrumentor().instrument()
```

---

## 5. Key Metrics

| Metric | Type | Labels | Unit |
|--------|------|--------|------|
| `workflow_total` | Counter | status, workflow_type | count |
| `workflow_duration_seconds` | Histogram | workflow_type | seconds |
| `activity_duration_seconds` | Histogram | activity_name, status | seconds |
| `segmentation_inference_seconds` | Histogram | pass_number, model | seconds |
| `segmentation_point_count` | Histogram | — | count |
| `postprocessing_components_extracted` | Counter | component_type | count |
| `ifc_creation_duration_seconds` | Histogram | — | seconds |
| `queue_messages_processed` | Counter | queue_name, status | count |
| `queue_processing_duration_seconds` | Histogram | queue_name | seconds |
| `blob_operations_total` | Counter | operation, status | count |
| `gpu_memory_usage_bytes` | Gauge | — | bytes |

---

## 6. Health Checks

### Liveness Probe (`GET /api/health`)
- Service is running
- No crash loop

### Readiness Probe (`GET /api/ready`)
- Database connected
- Temporal connected
- Queue connected
- Service ready to accept traffic

```python
@router.get("/ready")
async def readiness(
    workflow_repo: WorkflowRepository = Depends(get_workflow_repo),
):
    checks = {}
    
    # Database
    try:
        await workflow_repo.ping()
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    
    # Temporal
    try:
        # Simple connectivity check
        checks["temporal"] = "ok"
    except Exception:
        checks["temporal"] = "error"
    
    all_ok = all(v == "ok" for v in checks.values())
    status_code = 200 if all_ok else 503
    
    return JSONResponse(
        status_code=status_code,
        content={"status": "ready" if all_ok else "not_ready", "checks": checks},
    )
```

---

## 7. Alerting Rules (Production)

| Alert | Condition | Severity |
|-------|-----------|----------|
| Workflow stuck | Status=RUNNING > 4 hours | Critical |
| DLQ messages | DLQ depth > 0 | High |
| Segmentation timeout | Duration > 90 min | High |
| GPU OOM | OOM kills > 0 | High |
| Service unhealthy | Health check fails 3× | Critical |
| Error rate | > 5% of workflows fail | High |
| Queue depth growing | > 10 messages for > 30 min | Medium |
