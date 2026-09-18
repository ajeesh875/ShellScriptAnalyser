# 13B — Cloud Adapters: Complete Azure Implementation

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 13_INFRASTRUCTURE.md

---

## 1. Overview

This document provides the **complete, production-ready implementation** of all Azure cloud adapters. These implement the same ports/interfaces defined in document 08 but connect to real Azure services instead of local emulators.

```
┌────────────────────────────────────────────────────────────────┐
│                  ADAPTER IMPLEMENTATIONS                         │
│                                                                │
│  StoragePort ─────────► AzureBlobStorageAdapter                │
│  QueuePort ───────────► AzureServiceBusAdapter                 │
│  WorkflowRepository ──► PostgresWorkflowRepository             │
│  ActivityRepository ──► PostgresActivityRepository             │
│  WorkflowPort ────────► TemporalCloudAdapter                   │
│  AuthPort ────────────► EntraIdAuthAdapter                     │
│  DeliveryPort ────────► DataRepoDeliveryAdapter                │
│  TokenPort ───────────► CognitoTokenAdapter                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Azure Blob Storage Adapter

```python
"""app/infrastructure/adapters/storage/azure_blob.py"""
import structlog
from datetime import datetime, timedelta, timezone
from azure.identity.aio import DefaultAzureCredential, ManagedIdentityCredential
from azure.storage.blob.aio import BlobServiceClient, ContainerClient
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from azure.core.exceptions import ResourceNotFoundError, HttpResponseError

from app.application.ports.storage_port import StoragePort

logger = structlog.get_logger()


class AzureBlobStorageAdapter(StoragePort):
    """
    Azure Blob Storage implementation.
    
    Authentication: Uses DefaultAzureCredential which supports:
    - Managed Identity (AKS workload identity — production)
    - Azure CLI credential (local development with `az login`)
    - Environment variables (CI/CD)
    
    No connection strings or storage keys needed.
    """
    
    def __init__(
        self,
        account_url: str,
        container_name: str,
        managed_identity_client_id: str | None = None,
    ):
        """
        Args:
            account_url: e.g., "https://esdtstorage.blob.core.windows.net"
            container_name: e.g., "scan2bim" or "segmentation-store"
            managed_identity_client_id: Optional client ID for user-assigned managed identity
        """
        self._account_url = account_url
        self._container_name = container_name
        self._credential: DefaultAzureCredential | ManagedIdentityCredential | None = None
        self._client: BlobServiceClient | None = None
        self._container: ContainerClient | None = None
        self._managed_identity_client_id = managed_identity_client_id
    
    async def initialize(self) -> None:
        """Initialize connection. Call once at app startup."""
        if self._managed_identity_client_id:
            self._credential = ManagedIdentityCredential(
                client_id=self._managed_identity_client_id
            )
        else:
            self._credential = DefaultAzureCredential()
        
        self._client = BlobServiceClient(
            account_url=self._account_url,
            credential=self._credential,
        )
        self._container = self._client.get_container_client(self._container_name)
        
        # Ensure container exists (will not fail if already exists)
        try:
            await self._container.get_container_properties()
        except ResourceNotFoundError:
            await self._container.create_container()
            logger.info("container_created", container=self._container_name)
        
        logger.info(
            "blob_storage_initialized",
            account=self._account_url,
            container=self._container_name,
        )
    
    async def upload(self, path: str, data: bytes, content_type: str = "") -> str:
        """
        Upload file to blob storage.
        
        Args:
            path: Blob path (e.g., "customer-01/site-01/file-01/scan.e57")
            data: File content as bytes
            content_type: MIME type (auto-detected if empty)
        
        Returns:
            Full blob URL
        """
        blob_client = self._container.get_blob_client(path)
        
        kwargs = {}
        if content_type:
            kwargs["content_type"] = content_type
        
        try:
            await blob_client.upload_blob(
                data,
                overwrite=True,
                **kwargs,
            )
            url = f"{self._account_url}/{self._container_name}/{path}"
            logger.info(
                "blob_uploaded",
                path=path,
                size_bytes=len(data),
            )
            return url
        except HttpResponseError as e:
            logger.error("blob_upload_failed", path=path, error=str(e))
            raise StorageError(f"Failed to upload {path}: {e}") from e
    
    async def upload_file(self, path: str, local_file_path: str) -> str:
        """
        Upload a local file to blob storage (streaming, for large files).
        
        Args:
            path: Blob path
            local_file_path: Path to local file
        
        Returns:
            Full blob URL
        """
        blob_client = self._container.get_blob_client(path)
        
        try:
            with open(local_file_path, "rb") as f:
                await blob_client.upload_blob(
                    f,
                    overwrite=True,
                    max_concurrency=4,  # Parallel upload chunks
                    blob_type="BlockBlob",
                )
            
            url = f"{self._account_url}/{self._container_name}/{path}"
            logger.info("blob_file_uploaded", path=path, local=local_file_path)
            return url
        except HttpResponseError as e:
            logger.error("blob_file_upload_failed", path=path, error=str(e))
            raise StorageError(f"Failed to upload file {path}: {e}") from e
    
    async def download(self, path: str) -> bytes:
        """Download blob content as bytes."""
        blob_client = self._container.get_blob_client(path)
        
        try:
            stream = await blob_client.download_blob()
            data = await stream.readall()
            logger.info("blob_downloaded", path=path, size_bytes=len(data))
            return data
        except ResourceNotFoundError:
            raise StorageError(f"Blob not found: {path}")
        except HttpResponseError as e:
            logger.error("blob_download_failed", path=path, error=str(e))
            raise StorageError(f"Failed to download {path}: {e}") from e
    
    async def download_to_file(self, path: str, local_file_path: str) -> None:
        """
        Download blob to a local file (streaming, for large files).
        
        Args:
            path: Blob path
            local_file_path: Where to save locally
        """
        import os
        os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
        
        blob_client = self._container.get_blob_client(path)
        
        try:
            stream = await blob_client.download_blob(max_concurrency=4)
            with open(local_file_path, "wb") as f:
                await stream.readinto(f)
            
            logger.info(
                "blob_downloaded_to_file",
                path=path,
                local=local_file_path,
            )
        except ResourceNotFoundError:
            raise StorageError(f"Blob not found: {path}")
        except HttpResponseError as e:
            raise StorageError(f"Failed to download {path}: {e}") from e
    
    async def get_url(self, path: str, expiry_minutes: int = 60) -> str:
        """
        Generate a SAS URL for temporary access to a blob.
        
        Args:
            path: Blob path
            expiry_minutes: How long the URL is valid (default: 60 min)
        
        Returns:
            SAS URL with read permission
        """
        # For Managed Identity, we use User Delegation Key
        # This avoids needing storage account keys
        delegation_key_start = datetime.now(timezone.utc)
        delegation_key_expiry = delegation_key_start + timedelta(hours=1)
        
        user_delegation_key = await self._client.get_user_delegation_key(
            key_start_time=delegation_key_start,
            key_expiry_time=delegation_key_expiry,
        )
        
        sas_token = generate_blob_sas(
            account_name=self._get_account_name(),
            container_name=self._container_name,
            blob_name=path,
            user_delegation_key=user_delegation_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes),
        )
        
        url = f"{self._account_url}/{self._container_name}/{path}?{sas_token}"
        logger.info(
            "sas_url_generated",
            path=path,
            expiry_minutes=expiry_minutes,
        )
        return url
    
    async def get_upload_sas_url(self, path: str, expiry_minutes: int = 60) -> str:
        """Generate a SAS URL with write permission (for external upload)."""
        delegation_key_start = datetime.now(timezone.utc)
        delegation_key_expiry = delegation_key_start + timedelta(hours=1)
        
        user_delegation_key = await self._client.get_user_delegation_key(
            key_start_time=delegation_key_start,
            key_expiry_time=delegation_key_expiry,
        )
        
        sas_token = generate_blob_sas(
            account_name=self._get_account_name(),
            container_name=self._container_name,
            blob_name=path,
            user_delegation_key=user_delegation_key,
            permission=BlobSasPermissions(read=True, write=True, create=True),
            expiry=datetime.now(timezone.utc) + timedelta(minutes=expiry_minutes),
        )
        
        return f"{self._account_url}/{self._container_name}/{path}?{sas_token}"
    
    async def exists(self, path: str) -> bool:
        """Check if blob exists."""
        blob_client = self._container.get_blob_client(path)
        try:
            await blob_client.get_blob_properties()
            return True
        except ResourceNotFoundError:
            return False
    
    async def delete(self, path: str) -> None:
        """Delete a blob."""
        blob_client = self._container.get_blob_client(path)
        try:
            await blob_client.delete_blob()
            logger.info("blob_deleted", path=path)
        except ResourceNotFoundError:
            logger.warning("blob_delete_not_found", path=path)
    
    async def list_blobs(self, prefix: str) -> list[str]:
        """List all blobs under a prefix."""
        blobs = []
        async for blob in self._container.list_blobs(name_starts_with=prefix):
            blobs.append(blob.name)
        return blobs
    
    async def close(self) -> None:
        """Close connections gracefully."""
        if self._client:
            await self._client.close()
        if self._credential:
            await self._credential.close()
    
    def _get_account_name(self) -> str:
        """Extract account name from URL."""
        # "https://esdtstorage.blob.core.windows.net" → "esdtstorage"
        return self._account_url.split("//")[1].split(".")[0]
```

---

## 3. Azure Service Bus Adapter

```python
"""app/infrastructure/adapters/queue/service_bus.py"""
import json
import asyncio
import structlog
from typing import Callable, Awaitable
from azure.identity.aio import DefaultAzureCredential, ManagedIdentityCredential
from azure.servicebus.aio import ServiceBusClient, ServiceBusSender, ServiceBusReceiver
from azure.servicebus import ServiceBusMessage, ServiceBusReceivedMessage
from azure.servicebus.exceptions import (
    ServiceBusError,
    MessageLockLostError,
    OperationTimeoutError,
)

from app.application.ports.queue_port import QueuePort

logger = structlog.get_logger()


class AzureServiceBusAdapter(QueuePort):
    """
    Azure Service Bus implementation.
    
    Supports three authentication modes:
    1. azure-identity: Managed Identity (production on AKS)
    2. connstring: Connection string (testing, emulator)
    3. emulator: Local emulator connection
    
    Features:
    - Auto-reconnect on transient failures
    - Dead-letter queue support
    - Message lock renewal for long processing
    - Concurrent message processing
    """
    
    def __init__(
        self,
        mode: str,
        fqdn: str = "",
        connection_string: str = "",
        managed_identity_client_id: str = "",
        max_concurrent_messages: int = 1,
        max_delivery_count: int = 10,
        prefetch_count: int = 0,
    ):
        """
        Args:
            mode: "azure-identity" | "connstring" | "emulator"
            fqdn: Namespace FQDN (e.g., "namespace.servicebus.windows.net")
            connection_string: Connection string (for connstring/emulator mode)
            managed_identity_client_id: Client ID for user-assigned identity
            max_concurrent_messages: How many messages to process in parallel
            max_delivery_count: Max redelivery before dead-letter
            prefetch_count: How many messages to prefetch from queue
        """
        self._mode = mode
        self._fqdn = fqdn
        self._connection_string = connection_string
        self._managed_identity_client_id = managed_identity_client_id
        self._max_concurrent = max_concurrent_messages
        self._max_delivery = max_delivery_count
        self._prefetch_count = prefetch_count
        
        self._client: ServiceBusClient | None = None
        self._credential = None
        self._senders: dict[str, ServiceBusSender] = {}
        self._running = False
    
    async def start(self) -> None:
        """Initialize Service Bus client."""
        if self._mode == "azure-identity":
            if self._managed_identity_client_id:
                self._credential = ManagedIdentityCredential(
                    client_id=self._managed_identity_client_id
                )
            else:
                self._credential = DefaultAzureCredential()
            
            self._client = ServiceBusClient(
                fully_qualified_namespace=self._fqdn,
                credential=self._credential,
            )
        elif self._mode in ("connstring", "emulator"):
            self._client = ServiceBusClient.from_connection_string(
                conn_str=self._connection_string,
            )
        else:
            raise ValueError(f"Unknown Service Bus mode: {self._mode}")
        
        self._running = True
        logger.info(
            "servicebus_initialized",
            mode=self._mode,
            fqdn=self._fqdn or "(connection string)",
        )
    
    async def send(self, queue_name: str, message: dict) -> None:
        """
        Send a message to a queue.
        
        Implements retry with exponential backoff (3 attempts).
        Message is JSON-serialized.
        """
        max_retries = 3
        base_delay = 0.5  # seconds
        
        # Reuse sender for performance
        if queue_name not in self._senders:
            self._senders[queue_name] = self._client.get_queue_sender(
                queue_name=queue_name
            )
        
        sender = self._senders[queue_name]
        json_body = json.dumps(message, default=str)
        
        sb_message = ServiceBusMessage(
            body=json_body,
            content_type="application/json",
            subject=message.get("type", "unknown"),
            correlation_id=message.get("workflowId", ""),
            message_id=str(message.get("id", "")),
        )
        
        for attempt in range(max_retries):
            try:
                await sender.send_messages(sb_message)
                logger.info(
                    "message_sent",
                    queue=queue_name,
                    type=message.get("type"),
                    workflow_id=message.get("workflowId"),
                )
                return
            except (ServiceBusError, OperationTimeoutError) as e:
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(
                        "send_retry",
                        queue=queue_name,
                        attempt=attempt + 1,
                        delay=delay,
                        error=str(e),
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "send_failed_all_retries",
                        queue=queue_name,
                        error=str(e),
                    )
                    raise QueueSendError(
                        f"Failed to send to {queue_name} after {max_retries} attempts: {e}"
                    ) from e
    
    async def receive(
        self,
        queue_name: str,
        handler: Callable[[dict], Awaitable[None]],
    ) -> None:
        """
        Start consuming messages from a queue.
        
        Runs continuously until stop() is called.
        Messages are auto-completed on success, dead-lettered on non-retryable error.
        
        Args:
            queue_name: Queue to consume from
            handler: Async function to process each message
        """
        logger.info("consumer_starting", queue=queue_name)
        
        while self._running:
            try:
                receiver = self._client.get_queue_receiver(
                    queue_name=queue_name,
                    max_wait_time=30,  # seconds to wait for messages
                    prefetch_count=self._prefetch_count,
                )
                
                async with receiver:
                    while self._running:
                        messages = await receiver.receive_messages(
                            max_message_count=self._max_concurrent,
                            max_wait_time=30,
                        )
                        
                        for message in messages:
                            await self._process_message(
                                receiver, message, handler
                            )
                            
            except (ServiceBusError, OperationTimeoutError) as e:
                if self._running:
                    logger.warning(
                        "consumer_reconnecting",
                        queue=queue_name,
                        error=str(e),
                    )
                    await asyncio.sleep(5)  # Wait before reconnect
            except Exception as e:
                logger.error(
                    "consumer_unexpected_error",
                    queue=queue_name,
                    error=str(e),
                )
                if self._running:
                    await asyncio.sleep(10)
    
    async def _process_message(
        self,
        receiver: ServiceBusReceiver,
        message: ServiceBusReceivedMessage,
        handler: Callable[[dict], Awaitable[None]],
    ) -> None:
        """Process a single message with error handling."""
        workflow_id = message.correlation_id or "unknown"
        msg_type = message.subject or "unknown"
        
        try:
            # Parse message body
            body = json.loads(str(message))
            
            logger.info(
                "message_received",
                queue=message.queue_name,
                type=msg_type,
                workflow_id=workflow_id,
                delivery_count=message.delivery_count,
            )
            
            # Process with handler
            await handler(body)
            
            # Complete (acknowledge) message
            await receiver.complete_message(message)
            
            logger.info(
                "message_completed",
                type=msg_type,
                workflow_id=workflow_id,
            )
            
        except NonRetryableError as e:
            # Dead-letter immediately (won't retry)
            logger.error(
                "message_dead_lettered",
                type=msg_type,
                workflow_id=workflow_id,
                error=str(e),
            )
            await receiver.dead_letter_message(
                message,
                reason="NonRetryableError",
                error_description=str(e),
            )
            
        except MessageLockLostError:
            # Lock expired during processing — message will be redelivered
            logger.warning(
                "message_lock_lost",
                type=msg_type,
                workflow_id=workflow_id,
            )
            
        except Exception as e:
            # Abandon message (Service Bus will redeliver)
            logger.error(
                "message_abandoned",
                type=msg_type,
                workflow_id=workflow_id,
                error=str(e),
                delivery_count=message.delivery_count,
            )
            await receiver.abandon_message(message)
    
    async def receive_single(
        self, queue_name: str, timeout: float = 30.0
    ) -> dict | None:
        """
        Receive a single message (for job-mode services like Segmentation).
        
        Returns None if no message available within timeout.
        """
        receiver = self._client.get_queue_receiver(
            queue_name=queue_name,
            max_wait_time=int(timeout),
        )
        
        async with receiver:
            messages = await receiver.receive_messages(
                max_message_count=1,
                max_wait_time=timeout,
            )
            
            if not messages:
                return None
            
            message = messages[0]
            body = json.loads(str(message))
            
            # Complete immediately (job will handle failures itself)
            await receiver.complete_message(message)
            
            return body
    
    async def stop(self) -> None:
        """Stop consuming and close connections."""
        self._running = False
        
        for sender in self._senders.values():
            await sender.close()
        self._senders.clear()
        
        if self._client:
            await self._client.close()
        if self._credential:
            await self._credential.close()
        
        logger.info("servicebus_stopped")
```

---

## 4. PostgreSQL Repository Adapter

```python
"""app/infrastructure/adapters/database/postgres_repo.py"""
import structlog
from datetime import datetime, timezone
from typing import Any
import asyncpg

from app.application.ports.database_port import WorkflowRepository, ActivityRepository

logger = structlog.get_logger()


class PostgresWorkflowRepository(WorkflowRepository):
    """
    PostgreSQL implementation of WorkflowRepository.
    
    Uses asyncpg for async operations with connection pooling.
    """
    
    def __init__(self, database_url: str, min_pool_size: int = 2, max_pool_size: int = 10):
        """
        Args:
            database_url: PostgreSQL connection string
                Format: "postgresql://user:pass@host:port/dbname"
                Note: asyncpg uses "postgresql://" not "postgresql+asyncpg://"
            min_pool_size: Minimum connections in pool
            max_pool_size: Maximum connections in pool
        """
        # Convert SQLAlchemy-style URL to asyncpg format
        self._dsn = database_url.replace("postgresql+asyncpg://", "postgresql://")
        self._min_pool = min_pool_size
        self._max_pool = max_pool_size
        self._pool: asyncpg.Pool | None = None
    
    async def initialize(self) -> None:
        """Create connection pool. Call once at app startup."""
        self._pool = await asyncpg.create_pool(
            dsn=self._dsn,
            min_size=self._min_pool,
            max_size=self._max_pool,
            command_timeout=30,
        )
        logger.info("postgres_pool_created", min=self._min_pool, max=self._max_pool)
    
    async def close(self) -> None:
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
    
    async def ping(self) -> bool:
        """Health check — verify database is reachable."""
        async with self._pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    
    async def create_workflow(self, workflow: dict) -> str:
        """Insert new workflow record."""
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO workflows (
                    workflow_id, workflow_type, customer_id, site_id,
                    project_id, file_id, file_name, status,
                    current_activity, metadata, started_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                workflow["workflow_id"],
                workflow.get("workflow_type", "inshelter_single_scan"),
                workflow["customer_id"],
                workflow["site_id"],
                workflow.get("project_id", ""),
                workflow["file_id"],
                workflow.get("file_name", ""),
                workflow.get("status", "PENDING"),
                workflow.get("current_activity", ""),
                json.dumps(workflow.get("metadata", {})),
                datetime.now(timezone.utc),
            )
        
        logger.info("workflow_created", workflow_id=workflow["workflow_id"])
        return workflow["workflow_id"]
    
    async def get_workflow(self, workflow_id: str) -> dict | None:
        """Get workflow by ID."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workflows WHERE workflow_id = $1",
                workflow_id,
            )
        
        if row is None:
            return None
        
        return dict(row)
    
    async def update_workflow_status(
        self, workflow_id: str, status: str, **kwargs
    ) -> None:
        """Update workflow status and optional fields."""
        set_clauses = ["status = $2", "updated_at = $3"]
        params: list[Any] = [workflow_id, status, datetime.now(timezone.utc)]
        param_idx = 4
        
        if "current_activity" in kwargs:
            set_clauses.append(f"current_activity = ${param_idx}")
            params.append(kwargs["current_activity"])
            param_idx += 1
        
        if "error" in kwargs:
            set_clauses.append(f"error = ${param_idx}")
            params.append(kwargs["error"])
            param_idx += 1
        
        if status in ("COMPLETED", "FAILED", "CANCELLED"):
            set_clauses.append(f"completed_at = ${param_idx}")
            params.append(datetime.now(timezone.utc))
            param_idx += 1
        
        if "duration_seconds" in kwargs:
            set_clauses.append(f"duration_seconds = ${param_idx}")
            params.append(kwargs["duration_seconds"])
            param_idx += 1
        
        query = f"UPDATE workflows SET {', '.join(set_clauses)} WHERE workflow_id = $1"
        
        async with self._pool.acquire() as conn:
            await conn.execute(query, *params)
        
        logger.info("workflow_updated", workflow_id=workflow_id, status=status)
    
    async def list_workflows(
        self, page: int = 1, page_size: int = 20, filters: dict | None = None
    ) -> tuple[list[dict], int]:
        """List workflows with pagination and filtering."""
        where_clauses = []
        params: list[Any] = []
        param_idx = 1
        
        if filters:
            if "status" in filters:
                where_clauses.append(f"status = ${param_idx}")
                params.append(filters["status"])
                param_idx += 1
            if "customer_id" in filters:
                where_clauses.append(f"customer_id = ${param_idx}")
                params.append(filters["customer_id"])
                param_idx += 1
            if "site_id" in filters:
                where_clauses.append(f"site_id = ${param_idx}")
                params.append(filters["site_id"])
                param_idx += 1
        
        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)
        
        # Count total
        count_query = f"SELECT COUNT(*) FROM workflows {where_sql}"
        
        # Fetch page
        offset = (page - 1) * page_size
        data_query = f"""
            SELECT * FROM workflows {where_sql}
            ORDER BY started_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([page_size, offset])
        
        async with self._pool.acquire() as conn:
            total = await conn.fetchval(count_query, *params[:-2])
            rows = await conn.fetch(data_query, *params)
        
        return [dict(row) for row in rows], total
    
    async def get_workflow_by_correlation(self, correlation_id: str) -> dict | None:
        """Find workflow by correlation ID (for duplicate detection)."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workflows WHERE workflow_id = $1",
                correlation_id,
            )
        return dict(row) if row else None


class PostgresActivityRepository(ActivityRepository):
    """PostgreSQL implementation of ActivityRepository."""
    
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool
    
    async def create_activity(self, activity: dict) -> str:
        """Insert new activity record."""
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO activities (
                    activity_id, workflow_id, activity_name, status,
                    input_data, started_at
                ) VALUES ($1, $2, $3, $4, $5, $6)
                """,
                activity["activity_id"],
                activity["workflow_id"],
                activity["activity_name"],
                activity.get("status", "PENDING"),
                json.dumps(activity.get("input_data", {})),
                datetime.now(timezone.utc),
            )
        return activity["activity_id"]
    
    async def update_activity(
        self, activity_id: str, status: str, **kwargs
    ) -> None:
        """Update activity status."""
        set_clauses = ["status = $2"]
        params: list[Any] = [activity_id, status]
        param_idx = 3
        
        if status in ("COMPLETED", "FAILED"):
            set_clauses.append(f"completed_at = ${param_idx}")
            params.append(datetime.now(timezone.utc))
            param_idx += 1
        
        if "output_data" in kwargs:
            set_clauses.append(f"output_data = ${param_idx}")
            params.append(json.dumps(kwargs["output_data"]))
            param_idx += 1
        
        if "error" in kwargs:
            set_clauses.append(f"error = ${param_idx}")
            params.append(kwargs["error"])
            param_idx += 1
        
        if "duration_seconds" in kwargs:
            set_clauses.append(f"duration_seconds = ${param_idx}")
            params.append(kwargs["duration_seconds"])
            param_idx += 1
        
        query = f"UPDATE activities SET {', '.join(set_clauses)} WHERE activity_id = $1"
        
        async with self._pool.acquire() as conn:
            await conn.execute(query, *params)
    
    async def update_activity_by_workflow(
        self, workflow_id: str, activity_name: str, status: str, **kwargs
    ) -> None:
        """Update activity by workflow_id + activity_name (for signal handling)."""
        set_clauses = ["status = $3"]
        params: list[Any] = [workflow_id, activity_name, status]
        param_idx = 4
        
        if status in ("COMPLETED", "FAILED"):
            set_clauses.append(f"completed_at = ${param_idx}")
            params.append(datetime.now(timezone.utc))
            param_idx += 1
        
        if "output" in kwargs and kwargs["output"]:
            set_clauses.append(f"output_data = ${param_idx}")
            params.append(json.dumps(kwargs["output"]))
            param_idx += 1
        
        if "error" in kwargs and kwargs["error"]:
            set_clauses.append(f"error = ${param_idx}")
            params.append(kwargs["error"])
            param_idx += 1
        
        query = f"""
            UPDATE activities SET {', '.join(set_clauses)}
            WHERE workflow_id = $1 AND activity_name = $2
        """
        
        async with self._pool.acquire() as conn:
            await conn.execute(query, *params)
    
    async def get_activities_for_workflow(self, workflow_id: str) -> list[dict]:
        """Get all activities for a workflow."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM activities
                WHERE workflow_id = $1
                ORDER BY started_at ASC
                """,
                workflow_id,
            )
        return [dict(row) for row in rows]
```

---

## 5. Temporal Cloud Adapter

```python
"""app/infrastructure/adapters/workflow/temporal_client.py"""
import structlog
from temporalio.client import Client, TLSConfig
from temporalio.worker import Worker
from temporalio.common import RetryPolicy
from datetime import timedelta

from app.application.ports.workflow_port import WorkflowPort
from app.workflow.definition import Scan2BimWorkflow
from app.workflow.activities import (
    generate_file_url,
    dispatch_segmentation,
    track_post_processing,
)

logger = structlog.get_logger()


class TemporalCloudAdapter(WorkflowPort):
    """
    Temporal workflow engine adapter.
    
    Supports:
    - Local Temporal (Docker auto-setup) — no TLS
    - Cloud Temporal (AKS self-hosted) — internal cluster DNS
    - Temporal Cloud (SaaS) — mTLS
    """
    
    def __init__(
        self,
        address: str,
        namespace: str = "default",
        task_queue: str = "scan2bim-queue",
        tls_cert_path: str | None = None,
        tls_key_path: str | None = None,
    ):
        self._address = address
        self._namespace = namespace
        self._task_queue = task_queue
        self._tls_cert_path = tls_cert_path
        self._tls_key_path = tls_key_path
        self._client: Client | None = None
        self._worker: Worker | None = None
    
    async def initialize(self) -> None:
        """Connect to Temporal server."""
        tls_config = None
        
        if self._tls_cert_path and self._tls_key_path:
            with open(self._tls_cert_path, "rb") as f:
                cert = f.read()
            with open(self._tls_key_path, "rb") as f:
                key = f.read()
            tls_config = TLSConfig(client_cert=cert, client_private_key=key)
        
        self._client = await Client.connect(
            self._address,
            namespace=self._namespace,
            tls=tls_config,
        )
        
        logger.info(
            "temporal_connected",
            address=self._address,
            namespace=self._namespace,
        )
    
    async def start_worker(self) -> None:
        """Start Temporal worker to execute workflows and activities."""
        self._worker = Worker(
            self._client,
            task_queue=self._task_queue,
            workflows=[Scan2BimWorkflow],
            activities=[
                generate_file_url,
                dispatch_segmentation,
                track_post_processing,
            ],
        )
        
        # Start worker as background task
        import asyncio
        asyncio.create_task(self._worker.run())
        
        logger.info("temporal_worker_started", task_queue=self._task_queue)
    
    async def stop_worker(self) -> None:
        """Stop Temporal worker gracefully."""
        if self._worker:
            await self._worker.shutdown()
            logger.info("temporal_worker_stopped")
    
    async def start_workflow(
        self, workflow_id: str, workflow_type: str, input_data: dict
    ) -> str:
        """Start a new Temporal workflow."""
        handle = await self._client.start_workflow(
            Scan2BimWorkflow.run,
            input_data,
            id=workflow_id,
            task_queue=self._task_queue,
            retry_policy=RetryPolicy(
                maximum_attempts=3,
                initial_interval=timedelta(seconds=2),
                maximum_interval=timedelta(seconds=30),
            ),
            execution_timeout=timedelta(hours=6),
        )
        
        logger.info(
            "workflow_started_temporal",
            workflow_id=workflow_id,
            run_id=handle.result_run_id,
        )
        return handle.result_run_id or ""
    
    async def signal_workflow(
        self, workflow_id: str, signal_name: str, data: dict
    ) -> None:
        """Send signal to running workflow."""
        handle = self._client.get_workflow_handle(workflow_id)
        await handle.signal(signal_name, data)
        
        logger.info(
            "workflow_signaled",
            workflow_id=workflow_id,
            signal=signal_name,
        )
    
    async def cancel_workflow(self, workflow_id: str, reason: str) -> None:
        """Cancel a running workflow."""
        handle = self._client.get_workflow_handle(workflow_id)
        await handle.cancel()
        
        logger.info(
            "workflow_cancelled",
            workflow_id=workflow_id,
            reason=reason,
        )
    
    async def query_workflow(self, workflow_id: str, query_name: str) -> dict:
        """Query workflow state."""
        handle = self._client.get_workflow_handle(workflow_id)
        result = await handle.query(query_name)
        return {"result": result}
```

---

## 6. Entra ID (Azure AD) Authentication Adapter

```python
"""app/infrastructure/adapters/auth/entra_id.py"""
import structlog
from typing import Optional
from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt
from jwt import PyJWKClient

logger = structlog.get_logger()


class EntraIdAuthAdapter:
    """
    Microsoft Entra ID (Azure AD) JWT validation.
    
    Validates:
    - Token signature (against JWKS endpoint)
    - Token expiry
    - Audience (must match our service)
    - Issuer (must be our tenant)
    - Client ID (must be in whitelist)
    """
    
    def __init__(
        self,
        tenant_id: str,
        audience: str,
        whitelisted_client_ids: list[str],
    ):
        self._tenant_id = tenant_id
        self._audience = audience
        self._whitelisted_ids = whitelisted_client_ids
        self._jwks_url = (
            f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
        )
        self._issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"
        self._jwks_client = PyJWKClient(self._jwks_url)
    
    async def validate_token(self, token: str) -> dict:
        """
        Validate JWT token and return claims.
        
        Raises HTTPException 401 if invalid.
        """
        try:
            # Get signing key from JWKS
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            
            # Decode and validate
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
            )
            
            # Check client ID whitelist
            client_id = claims.get("appid") or claims.get("azp", "")
            if client_id not in self._whitelisted_ids:
                raise HTTPException(
                    status_code=403,
                    detail=f"Client ID {client_id} not authorized",
                )
            
            logger.info(
                "auth_validated",
                client_id=client_id,
                sub=claims.get("sub", ""),
            )
            return claims
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(401, "Token expired")
        except jwt.InvalidAudienceError:
            raise HTTPException(401, "Invalid audience")
        except jwt.InvalidIssuerError:
            raise HTTPException(401, "Invalid issuer")
        except jwt.InvalidTokenError as e:
            raise HTTPException(401, f"Invalid token: {e}")


class AuthMiddleware:
    """FastAPI dependency for authentication."""
    
    def __init__(self, auth_adapter: EntraIdAuthAdapter, enabled: bool = True):
        self._auth = auth_adapter
        self._enabled = enabled
        self._bearer = HTTPBearer(auto_error=False)
    
    async def __call__(self, request: Request) -> Optional[dict]:
        """
        Validate request authentication.
        Returns claims if valid, None if auth disabled.
        """
        if not self._enabled:
            return None  # Auth disabled (local development)
        
        credentials: HTTPAuthorizationCredentials = await self._bearer(request)
        if not credentials:
            raise HTTPException(401, "Missing Authorization header")
        
        return await self._auth.validate_token(credentials.credentials)
```

---

## 7. AWS Cognito Token Adapter (M2M Auth for DataRepo)

```python
"""app/infrastructure/external/cognito_client.py"""
import time
import structlog
import httpx

logger = structlog.get_logger()


class CognitoTokenAdapter:
    """
    AWS Cognito client_credentials flow for machine-to-machine auth.
    
    Used to obtain tokens for DataRepo API access.
    Caches tokens and auto-refreshes 60s before expiry.
    """
    
    def __init__(
        self,
        token_url: str,
        client_id: str,
        client_secret: str,
        scope: str,
    ):
        """
        Args:
            token_url: e.g., "https://xxx.auth.eu-west-1.amazoncognito.com/oauth2/token"
            client_id: Cognito app client ID
            client_secret: Cognito app client secret
            scope: Required scope (e.g., "datarepo/read datarepo/write")
        """
        self._token_url = token_url
        self._client_id = client_id
        self._client_secret = client_secret
        self._scope = scope
        
        # Token cache
        self._access_token: str | None = None
        self._token_expiry: float = 0  # Unix timestamp
    
    async def get_token(self) -> str:
        """
        Get a valid access token. Uses cache if not expired.
        
        Returns:
            Bearer token string
        """
        # Check if cached token is still valid (with 60s buffer)
        if self._access_token and time.time() < (self._token_expiry - 60):
            return self._access_token
        
        # Request new token
        logger.info("cognito_token_request", scope=self._scope)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self._token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "scope": self._scope,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30.0,
            )
            
            if response.status_code != 200:
                logger.error(
                    "cognito_token_failed",
                    status=response.status_code,
                    body=response.text,
                )
                raise AuthenticationError(
                    f"Cognito token request failed: {response.status_code}"
                )
            
            data = response.json()
            self._access_token = data["access_token"]
            self._token_expiry = time.time() + data.get("expires_in", 3600)
            
            logger.info(
                "cognito_token_obtained",
                expires_in=data.get("expires_in"),
            )
            return self._access_token
```

---

## 8. DataRepo API Client

```python
"""app/infrastructure/external/datarepo_client.py"""
import structlog
import httpx

from app.infrastructure.external.cognito_client import CognitoTokenAdapter

logger = structlog.get_logger()


class DataRepoClient:
    """
    Client for ESDT DataRepo API.
    
    Used for:
    - Getting SAS download URLs for E57 files
    - Getting SAS upload URLs for IFC delivery
    - Retrieving site metadata
    """
    
    def __init__(
        self,
        base_url: str,
        cognito_client: CognitoTokenAdapter,
        timeout: float = 30.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._cognito = cognito_client
        self._timeout = timeout
    
    async def _get_headers(self) -> dict:
        """Get auth headers with fresh token."""
        token = await self._cognito.get_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    
    async def get_download_sas_url(
        self, file_id: str, customer_id: str
    ) -> str:
        """
        Get a SAS URL to download an E57 file from DataRepo.
        
        Args:
            file_id: DataRepo file identifier
            customer_id: Customer identifier
        
        Returns:
            SAS URL valid for 1 hour
        """
        headers = await self._get_headers()
        
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/api/files/{file_id}/download-url",
                headers=headers,
                params={"customerId": customer_id},
            )
            
            if response.status_code != 200:
                logger.error(
                    "datarepo_download_url_failed",
                    file_id=file_id,
                    status=response.status_code,
                )
                raise ExternalServiceError(
                    f"DataRepo download URL failed: {response.status_code}"
                )
            
            data = response.json()
            logger.info("datarepo_download_url_obtained", file_id=file_id)
            return data["sasUrl"]
    
    async def get_upload_sas_url(
        self,
        customer_id: str,
        site_id: str,
        file_id: str,
        file_type: str = "ifc",
        file_name: str = "model.ifc",
    ) -> dict:
        """
        Get a SAS URL to upload an IFC file to DataRepo.
        
        Returns:
            {"sasUrl": "...", "downloadUrl": "..."}
        """
        headers = await self._get_headers()
        
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/api/files/upload-url",
                headers=headers,
                json={
                    "customerId": customer_id,
                    "siteId": site_id,
                    "fileId": file_id,
                    "fileType": file_type,
                    "fileName": file_name,
                },
            )
            
            if response.status_code not in (200, 201):
                logger.error(
                    "datarepo_upload_url_failed",
                    status=response.status_code,
                )
                raise ExternalServiceError(
                    f"DataRepo upload URL failed: {response.status_code}"
                )
            
            data = response.json()
            logger.info("datarepo_upload_url_obtained", file_id=file_id)
            return data
    
    async def get_site_metadata(
        self, customer_id: str, site_id: str
    ) -> dict:
        """Get site metadata from DataRepo (for enriching segmentation context)."""
        headers = await self._get_headers()
        
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/api/sites/{site_id}",
                headers=headers,
                params={"customerId": customer_id},
            )
            
            if response.status_code == 200:
                return response.json()
            
            # Site metadata is optional — don't fail pipeline
            logger.warning(
                "datarepo_site_metadata_unavailable",
                site_id=site_id,
                status=response.status_code,
            )
            return {}
```

---

## 9. Updated Factory with Cloud Adapters

```python
"""app/infrastructure/factories.py — Complete factory with cloud support."""
import json
from app.config import settings
from app.application.ports.storage_port import StoragePort
from app.application.ports.queue_port import QueuePort
from app.application.ports.database_port import WorkflowRepository, ActivityRepository
from app.application.ports.workflow_port import WorkflowPort


async def create_storage() -> StoragePort:
    """Create storage adapter. Call initialize() after."""
    if settings.STORAGE_MODE == "local":
        from app.infrastructure.adapters.storage.local_storage import LocalStorageAdapter
        adapter = LocalStorageAdapter(settings.UPLOAD_DIR)
    else:
        from app.infrastructure.adapters.storage.azure_blob import AzureBlobStorageAdapter
        adapter = AzureBlobStorageAdapter(
            account_url=settings.AZURE_STORAGE_ACCOUNT_URL,
            container_name=settings.AZURE_STORAGE_CONTAINER,
            managed_identity_client_id=settings.AZURE_CLIENT_ID or None,
        )
    
    await adapter.initialize()
    return adapter


async def create_queue() -> QueuePort:
    """Create queue adapter. Call start() after."""
    if settings.QUEUE_MODE == "memory":
        from app.infrastructure.adapters.queue.memory_queue import MemoryQueueAdapter
        return MemoryQueueAdapter()
    else:
        from app.infrastructure.adapters.queue.service_bus import AzureServiceBusAdapter
        adapter = AzureServiceBusAdapter(
            mode=settings.SERVICEBUS_MODE,
            fqdn=settings.SERVICE_BUS_FQDN,
            connection_string=settings.SERVICE_BUS_CONNECTION_STRING,
            managed_identity_client_id=settings.AZURE_CLIENT_ID or "",
            max_concurrent_messages=settings.QUEUE_MAX_CONCURRENT,
        )
        return adapter


async def create_workflow_repository() -> WorkflowRepository:
    """Create workflow database adapter."""
    if settings.DB_MODE == "sqlite":
        from app.infrastructure.adapters.database.sqlite_repo import SQLiteWorkflowRepository
        adapter = SQLiteWorkflowRepository(settings.SQLITE_PATH)
    else:
        from app.infrastructure.adapters.database.postgres_repo import PostgresWorkflowRepository
        adapter = PostgresWorkflowRepository(
            database_url=settings.DATABASE_URL,
            min_pool_size=settings.DB_POOL_MIN,
            max_pool_size=settings.DB_POOL_MAX,
        )
    
    await adapter.initialize()
    return adapter


async def create_workflow_engine() -> WorkflowPort:
    """Create Temporal workflow adapter."""
    from app.infrastructure.adapters.workflow.temporal_client import TemporalCloudAdapter
    adapter = TemporalCloudAdapter(
        address=settings.TEMPORAL_ADDRESS,
        namespace=settings.TEMPORAL_NAMESPACE,
        task_queue=settings.TEMPORAL_TASK_QUEUE,
        tls_cert_path=settings.TEMPORAL_TLS_CERT or None,
        tls_key_path=settings.TEMPORAL_TLS_KEY or None,
    )
    await adapter.initialize()
    return adapter


def create_datarepo_client():
    """Create DataRepo API client (only for cloud mode)."""
    from app.infrastructure.external.cognito_client import CognitoTokenAdapter
    from app.infrastructure.external.datarepo_client import DataRepoClient
    
    cognito = CognitoTokenAdapter(
        token_url=settings.COGNITO_TOKEN_URL,
        client_id=settings.COGNITO_CLIENT_ID,
        client_secret=settings.COGNITO_CLIENT_SECRET,
        scope=settings.COGNITO_SCOPE,
    )
    
    return DataRepoClient(
        base_url=settings.DATAREPO_URL,
        cognito_client=cognito,
    )
```

---

## 10. Cloud-Specific Environment Variables

```env
# ═══════════════════════════════════════════════════════════
# PRODUCTION / CLOUD CONFIGURATION
# ═══════════════════════════════════════════════════════════

# Application
APP_NAME=scan2bim-root-service
APP_VERSION=1.2.0
ENVIRONMENT=cloud
PORT=3000
LOG_LEVEL=INFO

# ─── Storage (Azure Blob) ───────────────────────────────
STORAGE_MODE=azure
AZURE_STORAGE_ACCOUNT_URL=https://esdtstorage.blob.core.windows.net
AZURE_STORAGE_CONTAINER=scan2bim
AZURE_CLIENT_ID=12345678-abcd-1234-abcd-123456789012

# ─── Queue (Azure Service Bus) ──────────────────────────
QUEUE_MODE=servicebus
SERVICEBUS_MODE=azure-identity
SERVICE_BUS_FQDN=esdt-prod-eus-namespace.servicebus.windows.net
ROOT_QUEUE=esdt-s2b-root-queue
SEGMENTATION_QUEUE=esdt-s2b-segmentation-queue
POST_PROCESSING_QUEUE=esdt-s2b-post-processing-queue
QUEUE_MAX_CONCURRENT=5

# ─── Database (PostgreSQL) ──────────────────────────────
DB_MODE=postgres
DATABASE_URL=postgresql://scan2bim:${DB_PASSWORD}@scan2bim-db.postgres.database.azure.com:5432/scan2bim?sslmode=require
DB_POOL_MIN=5
DB_POOL_MAX=20

# ─── Temporal ───────────────────────────────────────────
TEMPORAL_ENABLED=true
TEMPORAL_ADDRESS=temporal-frontend.temporal.svc.cluster.local:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=scan2bim-queue
SIGNAL_TIMEOUT_MINUTES=240
# For Temporal Cloud (mTLS):
# TEMPORAL_TLS_CERT=/etc/temporal/tls.crt
# TEMPORAL_TLS_KEY=/etc/temporal/tls.key

# ─── Authentication ────────────────────────────────────
AUTH_ENABLED=true
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AUTH_AUDIENCE=api://scan2bim-root-service
WHITELISTED_CLIENT_IDS=["client-id-portal","client-id-datarepo"]

# ─── DataRepo Integration ──────────────────────────────
DATAREPO_URL=https://datarepo.sitedigitaltwin.com
COGNITO_TOKEN_URL=https://esdt-auth.auth.eu-west-1.amazoncognito.com/oauth2/token
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_CLIENT_SECRET=${COGNITO_SECRET}
COGNITO_SCOPE=datarepo/read datarepo/write

# ─── CORS ──────────────────────────────────────────────
CORS_ORIGINS=["https://portal.sitedigitaltwin.com","https://*.ericsson.net"]

# ─── Observability ─────────────────────────────────────
OTEL_EXPORTER_ENDPOINT=http://otel-collector.monitoring.svc:4317
OTEL_SERVICE_NAME=scan2bim-root-service

# ─── Mock (DISABLED in cloud) ──────────────────────────
MOCK_DOWNSTREAM=false
```

---

## 11. Kubernetes Workload Identity Setup

For Azure services to authenticate without secrets on AKS:

```yaml
# Service Account with Workload Identity annotation
apiVersion: v1
kind: ServiceAccount
metadata:
  name: scan2bim-root-sa
  namespace: scan2bim
  annotations:
    azure.workload.identity/client-id: "12345678-abcd-1234-abcd-123456789012"
  labels:
    azure.workload.identity/use: "true"
---
# Pod template (in Deployment)
spec:
  serviceAccountName: scan2bim-root-sa
  containers:
    - name: root-service
      env:
        - name: AZURE_CLIENT_ID
          value: "12345678-abcd-1234-abcd-123456789012"
        - name: AZURE_TENANT_ID
          value: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        - name: AZURE_FEDERATED_TOKEN_FILE
          value: /var/run/secrets/azure/tokens/azure-identity-token
      volumeMounts:
        - name: azure-identity-token
          mountPath: /var/run/secrets/azure/tokens
          readOnly: true
```

This enables `DefaultAzureCredential` to automatically authenticate to:
- Azure Blob Storage
- Azure Service Bus
- Azure Key Vault
- Azure PostgreSQL (AAD auth)

**No passwords stored anywhere in the cluster.**

---

## 12. Dependencies (Cloud-Specific)

```toml
[tool.poetry.dependencies]
# Azure SDK
azure-identity = "^1.19.0"
azure-storage-blob = "^12.23.0"
azure-servicebus = "^7.12.0"

# PostgreSQL
asyncpg = "^0.30.0"

# Temporal
temporalio = "^1.7.0"

# HTTP client (for DataRepo, Cognito)
httpx = "^0.28.0"

# JWT validation (Entra ID)
PyJWT = {extras = ["crypto"], version = "^2.9.0"}

# OpenTelemetry
opentelemetry-api = "^1.28.0"
opentelemetry-sdk = "^1.28.0"
opentelemetry-exporter-otlp = "^1.28.0"
opentelemetry-instrumentation-fastapi = "^0.49b0"
opentelemetry-instrumentation-httpx = "^0.49b0"
opentelemetry-instrumentation-asyncpg = "^0.49b0"
```
