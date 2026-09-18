# 08 — Service Architecture (Clean Architecture Template)

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 07_PIPELINE_FLOW.md

---

## 1. Clean Architecture Layers

Every InShelter service follows this layered structure:

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer                              │
│         (FastAPI routes, request/response handling)       │
│         Depends on: Application Layer                    │
├─────────────────────────────────────────────────────────┤
│                Application Layer                         │
│         (Use cases, ports/interfaces, DTOs)              │
│         Depends on: Domain Layer                         │
├─────────────────────────────────────────────────────────┤
│                Domain Layer                               │
│         (Entities, value objects, domain logic)           │
│         Depends on: NOTHING                              │
├─────────────────────────────────────────────────────────┤
│              Infrastructure Layer                         │
│         (Adapters: DB, Queue, Blob, External APIs)       │
│         Implements: Application Layer ports               │
└─────────────────────────────────────────────────────────┘
```

**Dependency Rule:** Inner layers NEVER depend on outer layers. Infrastructure implements interfaces defined by Application.

---

## 2. Standard Service Directory Structure

```
service-name/
├── app/
│   ├── __init__.py
│   ├── main.py                         # Entry point (FastAPI app + lifespan)
│   ├── config.py                       # Pydantic Settings (from .env)
│   │
│   ├── domain/                         # LAYER 1: Domain (no dependencies)
│   │   ├── __init__.py
│   │   ├── entities.py                 # Domain entities (Pydantic models)
│   │   ├── value_objects.py            # Value objects
│   │   ├── events.py                   # Domain events
│   │   ├── exceptions.py              # Domain-specific exceptions
│   │   └── enums.py                   # Domain enumerations
│   │
│   ├── application/                    # LAYER 2: Application (uses cases + ports)
│   │   ├── __init__.py
│   │   ├── ports/                      # Interfaces (abstract classes)
│   │   │   ├── __init__.py
│   │   │   ├── storage_port.py         # File storage interface
│   │   │   ├── queue_port.py           # Message queue interface
│   │   │   ├── database_port.py        # Database interface
│   │   │   └── workflow_port.py        # Workflow engine interface
│   │   ├── use_cases/                  # Business operations
│   │   │   ├── __init__.py
│   │   │   ├── store_file.py           # Store uploaded file in blob
│   │   │   ├── handle_webhook.py       # Handle webhook (pipeline trigger)
│   │   │   ├── handle_signal.py        # Process completion signals
│   │   │   └── get_workflow_status.py  # Query workflow state
│   │   ├── dtos.py                     # Data Transfer Objects
│   │   └── services.py                # Application services (orchestration)
│   │
│   ├── infrastructure/                 # LAYER 3: Infrastructure (adapters)
│   │   ├── __init__.py
│   │   ├── adapters/
│   │   │   ├── __init__.py
│   │   │   ├── storage/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── local_storage.py    # Filesystem adapter
│   │   │   │   └── azure_blob.py       # Azure Blob adapter
│   │   │   ├── queue/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── memory_queue.py     # In-memory asyncio.Queue
│   │   │   │   └── service_bus.py      # Azure Service Bus adapter
│   │   │   ├── database/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── sqlite_repo.py      # SQLite adapter (local)
│   │   │   │   └── postgres_repo.py    # PostgreSQL adapter
│   │   │   └── workflow/
│   │   │       ├── __init__.py
│   │   │       └── temporal_client.py  # Temporal adapter
│   │   ├── external/
│   │   │   ├── __init__.py
│   │   │   ├── datarepo_client.py      # DataRepo API client
│   │   │   └── cognito_client.py       # AWS Cognito client
│   │   └── factories.py               # Adapter factory (picks based on config)
│   │
│   ├── api/                            # LAYER 4: API (thin controllers)
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── files.py                # POST /api/files/upload (store file)
│   │   │   ├── webhook.py              # POST /api/webhook (trigger pipeline)
│   │   │   ├── signal.py               # POST /api/signal/activity
│   │   │   ├── workflows.py            # GET /api/workflows
│   │   │   └── health.py              # GET /api/health, /api/ready
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   ├── correlation.py          # Inject/propagate workflow_id
│   │   │   ├── error_handler.py        # Global exception → RFC 7807
│   │   │   └── auth.py                # JWT validation (when enabled)
│   │   └── dependencies.py            # FastAPI dependency injection
│   │
│   └── workflow/                       # Temporal definitions (Root Service only)
│       ├── __init__.py
│       ├── definition.py               # Workflow class
│       ├── activities.py               # Activity functions
│       └── worker.py                   # Temporal worker startup
│
├── tests/
│   ├── __init__.py
│   ├── unit/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── integration/
│   │   ├── test_queue.py
│   │   ├── test_database.py
│   │   └── test_workflow.py
│   └── conftest.py                     # Fixtures
│
├── .env                                # Local config
├── .env.example                        # Template
├── Dockerfile
├── pyproject.toml
├── pytest.ini
└── README.md
```

---

## 3. Port Definitions (Application Layer Interfaces)

### StoragePort

```python
"""app/application/ports/storage_port.py"""
from abc import ABC, abstractmethod


class StoragePort(ABC):
    """Interface for file storage operations."""
    
    @abstractmethod
    async def upload(self, path: str, data: bytes, content_type: str = "") -> str:
        """Upload file. Returns storage URL/path."""
        ...
    
    @abstractmethod
    async def download(self, path: str) -> bytes:
        """Download file content."""
        ...
    
    @abstractmethod
    async def get_url(self, path: str, expiry_minutes: int = 60) -> str:
        """Get download URL (SAS URL or local path)."""
        ...
    
    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Check if file exists."""
        ...
    
    @abstractmethod
    async def delete(self, path: str) -> None:
        """Delete file."""
        ...
```

### QueuePort

```python
"""app/application/ports/queue_port.py"""
from abc import ABC, abstractmethod
from typing import Callable, Awaitable


class QueuePort(ABC):
    """Interface for message queue operations."""
    
    @abstractmethod
    async def send(self, queue_name: str, message: dict) -> None:
        """Send message to named queue."""
        ...
    
    @abstractmethod
    async def receive(
        self, queue_name: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        """Start consuming from queue, calling handler for each message."""
        ...
    
    @abstractmethod
    async def start(self) -> None:
        """Initialize connection."""
        ...
    
    @abstractmethod
    async def stop(self) -> None:
        """Close connection gracefully."""
        ...
```

### DatabasePort

```python
"""app/application/ports/database_port.py"""
from abc import ABC, abstractmethod
from datetime import datetime
from uuid import UUID


class WorkflowRepository(ABC):
    """Interface for workflow persistence."""
    
    @abstractmethod
    async def create_workflow(self, workflow: dict) -> str:
        """Create new workflow record. Returns workflow_id."""
        ...
    
    @abstractmethod
    async def get_workflow(self, workflow_id: str) -> dict | None:
        """Get workflow by ID."""
        ...
    
    @abstractmethod
    async def update_workflow_status(
        self, workflow_id: str, status: str, **kwargs
    ) -> None:
        """Update workflow status and optional fields."""
        ...
    
    @abstractmethod
    async def list_workflows(
        self, page: int, page_size: int, filters: dict | None = None
    ) -> tuple[list[dict], int]:
        """List workflows with pagination. Returns (items, total_count)."""
        ...


class ActivityRepository(ABC):
    """Interface for activity persistence."""
    
    @abstractmethod
    async def create_activity(self, activity: dict) -> str:
        """Create new activity record."""
        ...
    
    @abstractmethod
    async def update_activity(
        self, activity_id: str, status: str, **kwargs
    ) -> None:
        """Update activity status."""
        ...
    
    @abstractmethod
    async def get_activities_for_workflow(self, workflow_id: str) -> list[dict]:
        """Get all activities for a workflow."""
        ...
```

### WorkflowPort

```python
"""app/application/ports/workflow_port.py"""
from abc import ABC, abstractmethod


class WorkflowPort(ABC):
    """Interface for workflow engine operations."""
    
    @abstractmethod
    async def start_workflow(
        self, workflow_id: str, workflow_type: str, input_data: dict
    ) -> str:
        """Start a new workflow. Returns run_id."""
        ...
    
    @abstractmethod
    async def signal_workflow(
        self, workflow_id: str, signal_name: str, data: dict
    ) -> None:
        """Send signal to running workflow."""
        ...
    
    @abstractmethod
    async def cancel_workflow(self, workflow_id: str, reason: str) -> None:
        """Cancel a running workflow."""
        ...
    
    @abstractmethod
    async def query_workflow(self, workflow_id: str, query_name: str) -> dict:
        """Query workflow state."""
        ...
```

---

## 4. Adapter Factory Pattern

```python
"""app/infrastructure/factories.py"""
from app.config import settings
from app.application.ports.storage_port import StoragePort
from app.application.ports.queue_port import QueuePort
from app.application.ports.database_port import WorkflowRepository, ActivityRepository
from app.application.ports.workflow_port import WorkflowPort


def create_storage() -> StoragePort:
    """Create storage adapter based on config."""
    if settings.STORAGE_MODE == "local":
        from app.infrastructure.adapters.storage.local_storage import LocalStorage
        return LocalStorage(settings.UPLOAD_DIR)
    else:
        from app.infrastructure.adapters.storage.azure_blob import AzureBlobStorage
        return AzureBlobStorage(
            account_url=settings.AZURE_STORAGE_ACCOUNT_URL,
            container=settings.AZURE_STORAGE_CONTAINER,
        )


def create_queue() -> QueuePort:
    """Create queue adapter based on config."""
    if settings.QUEUE_MODE == "memory":
        from app.infrastructure.adapters.queue.memory_queue import MemoryQueue
        return MemoryQueue()
    else:
        from app.infrastructure.adapters.queue.service_bus import ServiceBusQueue
        return ServiceBusQueue(
            fqdn=settings.SERVICE_BUS_FQDN,
            connection_string=settings.SERVICE_BUS_CONNECTION_STRING,
        )


def create_workflow_repository() -> WorkflowRepository:
    """Create database adapter based on config."""
    if settings.DB_MODE == "sqlite":
        from app.infrastructure.adapters.database.sqlite_repo import SQLiteWorkflowRepo
        return SQLiteWorkflowRepo(settings.SQLITE_PATH)
    else:
        from app.infrastructure.adapters.database.postgres_repo import PostgresWorkflowRepo
        return PostgresWorkflowRepo(settings.DATABASE_URL)


def create_activity_repository() -> ActivityRepository:
    """Create activity database adapter."""
    if settings.DB_MODE == "sqlite":
        from app.infrastructure.adapters.database.sqlite_repo import SQLiteActivityRepo
        return SQLiteActivityRepo(settings.SQLITE_PATH)
    else:
        from app.infrastructure.adapters.database.postgres_repo import PostgresActivityRepo
        return PostgresActivityRepo(settings.DATABASE_URL)


def create_workflow_engine() -> WorkflowPort:
    """Create workflow engine adapter."""
    from app.infrastructure.adapters.workflow.temporal_client import TemporalWorkflowClient
    return TemporalWorkflowClient(
        address=settings.TEMPORAL_ADDRESS,
        namespace=settings.TEMPORAL_NAMESPACE,
    )
```

---

## 5. FastAPI Application Bootstrap

```python
"""app/main.py — Standard service entry point."""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import files, webhook, signal, workflows, health
from app.api.middleware.error_handler import register_error_handlers
from app.api.middleware.correlation import CorrelationMiddleware
from app.infrastructure.factories import (
    create_storage, create_queue, create_workflow_repository,
    create_activity_repository, create_workflow_engine,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    # STARTUP
    app.state.storage = create_storage()
    app.state.queue = create_queue()
    app.state.workflow_repo = create_workflow_repository()
    app.state.activity_repo = create_activity_repository()
    app.state.workflow_engine = create_workflow_engine()
    
    await app.state.queue.start()
    
    # Start background consumers
    app.state.consumer_task = asyncio.create_task(
        app.state.queue.receive(settings.ROOT_QUEUE, process_message)
    )
    
    # Start Temporal worker (if this is root service)
    if settings.TEMPORAL_ENABLED:
        from app.workflow.worker import start_worker
        app.state.temporal_worker = await start_worker()
    
    yield
    
    # SHUTDOWN
    app.state.consumer_task.cancel()
    await app.state.queue.stop()
    if settings.TEMPORAL_ENABLED:
        from app.workflow.worker import stop_worker
        await stop_worker(app.state.temporal_worker)


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        lifespan=lifespan,
    )
    
    # Middleware
    app.add_middleware(CorrelationMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Routes
    app.include_router(health.router, prefix="/api", tags=["Health"])
    app.include_router(files.router, prefix="/api", tags=["Files"])
    app.include_router(webhook.router, prefix="/api", tags=["Webhook"])
    app.include_router(signal.router, prefix="/api", tags=["Signal"])
    app.include_router(workflows.router, prefix="/api", tags=["Workflows"])
    
    # Error handlers
    register_error_handlers(app)
    
    return app


app = create_app()
```

---

## 6. Configuration Pattern

```python
"""app/config.py — Pydantic Settings."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration from environment variables."""
    
    # Application
    APP_NAME: str = "scan2bim-root-service"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "local"  # "local" | "cloud"
    PORT: int = 3000
    LOG_LEVEL: str = "INFO"
    
    # Storage
    STORAGE_MODE: str = "local"  # "local" | "azure"
    UPLOAD_DIR: str = "./uploads"
    AZURE_STORAGE_ACCOUNT_URL: str = ""
    AZURE_STORAGE_CONTAINER: str = "scan2bim"
    
    # Queue
    QUEUE_MODE: str = "memory"  # "memory" | "servicebus"
    ROOT_QUEUE: str = "esdt-s2b-root-queue"
    SEGMENTATION_QUEUE: str = "esdt-s2b-segmentation-queue"
    POST_PROCESSING_QUEUE: str = "esdt-s2b-post-processing-queue"
    SERVICE_BUS_FQDN: str = ""
    SERVICE_BUS_CONNECTION_STRING: str = ""
    
    # Database
    DB_MODE: str = "sqlite"  # "sqlite" | "postgres"
    SQLITE_PATH: str = "./data/app.db"
    DATABASE_URL: str = "postgresql+asyncpg://scan2bim:scan2bim@localhost:5432/scan2bim"
    
    # Temporal
    TEMPORAL_ENABLED: bool = True
    TEMPORAL_ADDRESS: str = "localhost:7233"
    TEMPORAL_NAMESPACE: str = "default"
    TEMPORAL_TASK_QUEUE: str = "scan2bim-queue"
    SIGNAL_TIMEOUT_MINUTES: int = 240
    
    # Auth
    AUTH_ENABLED: bool = False
    WHITELISTED_CLIENT_IDS: list[str] = []
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    
    # Mock (local development)
    MOCK_DOWNSTREAM: bool = False
    MOCK_SIGNAL_DELAY_SECONDS: int = 5
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
```

---

## 7. Error Handling Pattern

```python
"""app/api/middleware/error_handler.py"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.domain.exceptions import (
    DomainException,
    ValidationError,
    WorkflowNotFoundError,
    DuplicateWorkflowError,
)


def register_error_handlers(app: FastAPI) -> None:
    """Register global exception handlers (RFC 7807)."""
    
    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        return JSONResponse(
            status_code=400,
            content={
                "type": "https://scan2bim.io/errors/validation-error",
                "title": "Validation Error",
                "status": 400,
                "detail": str(exc),
                "instance": str(request.url),
            },
        )
    
    @app.exception_handler(WorkflowNotFoundError)
    async def not_found_handler(request: Request, exc: WorkflowNotFoundError):
        return JSONResponse(
            status_code=404,
            content={
                "type": "https://scan2bim.io/errors/not-found",
                "title": "Workflow Not Found",
                "status": 404,
                "detail": str(exc),
                "instance": str(request.url),
            },
        )
    
    @app.exception_handler(DuplicateWorkflowError)
    async def conflict_handler(request: Request, exc: DuplicateWorkflowError):
        return JSONResponse(
            status_code=409,
            content={
                "type": "https://scan2bim.io/errors/conflict",
                "title": "Duplicate Workflow",
                "status": 409,
                "detail": str(exc),
                "instance": str(request.url),
            },
        )
    
    @app.exception_handler(Exception)
    async def generic_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={
                "type": "https://scan2bim.io/errors/internal-error",
                "title": "Internal Server Error",
                "status": 500,
                "detail": "An unexpected error occurred",
                "instance": str(request.url),
            },
        )
```

---

## 8. Dependency Injection (FastAPI)

```python
"""app/api/dependencies.py"""
from fastapi import Request
from app.application.ports.storage_port import StoragePort
from app.application.ports.queue_port import QueuePort
from app.application.ports.database_port import WorkflowRepository, ActivityRepository
from app.application.ports.workflow_port import WorkflowPort


def get_storage(request: Request) -> StoragePort:
    return request.app.state.storage

def get_queue(request: Request) -> QueuePort:
    return request.app.state.queue

def get_workflow_repo(request: Request) -> WorkflowRepository:
    return request.app.state.workflow_repo

def get_activity_repo(request: Request) -> ActivityRepository:
    return request.app.state.activity_repo

def get_workflow_engine(request: Request) -> WorkflowPort:
    return request.app.state.workflow_engine
```

---

## 9. Logging Pattern

```python
"""Structured logging with correlation."""
import structlog
from app.config import settings

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(settings.LOG_LEVEL),
)

logger = structlog.get_logger()

# Usage in any module:
# logger.info("workflow_started", workflow_id="scan2bim-123", customer_id="C001")
```

---

## 10. Docker Pattern

```dockerfile
# Dockerfile — Standard Python service
FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml poetry.lock* ./
RUN pip install poetry && \
    poetry config virtualenvs.create false && \
    poetry install --only main --no-interaction --no-ansi

# Copy application
COPY app/ ./app/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Run
EXPOSE ${PORT:-3000}
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000"]
```
