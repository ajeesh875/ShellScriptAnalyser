# 16 — Testing Strategy

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 15_OBSERVABILITY.md

---

## 1. Test Pyramid

```
           ┌──────────┐
           │   E2E    │  2-3 tests (full pipeline)
           ├──────────┤
           │ Contract │  10+ tests (schema validation)
          ┌┤          ├┐
          │├──────────┤│
          ││Integration││ 20+ tests (adapters, DB, queue)
         ┌┤│          │├┐
         │├┤──────────├┤│
         ││ Unit Tests │││ 50+ tests (domain, use cases)
         └┴────────────┴┘
```

---

## 2. Test Framework

| Tool | Purpose |
|------|---------|
| pytest | Test runner |
| pytest-asyncio | Async test support |
| pytest-cov | Coverage reporting |
| httpx | API testing (async client) |
| factory_boy | Test data factories |
| hypothesis | Property-based testing |

---

## 3. Unit Tests (Domain + Application Layer)

### Domain Entity Tests

```python
"""tests/unit/domain/test_workflow.py"""
import pytest
from app.domain.entities import Workflow, WorkflowStatus


class TestWorkflow:
    def test_create_workflow_generates_id(self):
        wf = Workflow(
            workflow_id="scan2bim-123",
            ingestion_request_id=uuid4(),
            file_id=uuid4(),
            customer_id="C001",
            site_id="S001",
        )
        assert wf.status == WorkflowStatus.PENDING
        assert wf.workflow_id.startswith("scan2bim-")
    
    def test_workflow_status_transitions(self):
        """Only valid transitions allowed."""
        wf = Workflow(...)
        assert wf.status == WorkflowStatus.PENDING
        # PENDING → RUNNING is valid
        wf.status = WorkflowStatus.RUNNING
        assert wf.status == WorkflowStatus.RUNNING
```

### Use Case Tests

```python
"""tests/unit/application/test_store_file.py"""
import pytest
from unittest.mock import AsyncMock
from app.application.use_cases.store_file import StoreFileUseCase


class TestStoreFileUseCase:
    @pytest.fixture
    def use_case(self):
        return StoreFileUseCase(
            storage=AsyncMock(),
            file_repo=AsyncMock(),
        )
    
    async def test_successful_storage(self, use_case):
        command = StoreFileCommand(
            file_data=b"fake-e57-data",
            file_name="scan.e57",
            file_format="e57",
            customer_id="C001",
            site_id="S001",
        )
        result = await use_case.execute(command)
        
        assert result.file_id  # UUID generated
        assert result.storage_path.startswith("C001/S001/")
        use_case.storage.upload.assert_called_once()
    
    async def test_rejects_invalid_format(self, use_case):
        command = StoreFileCommand(
            file_data=b"data",
            file_name="scan.xyz",
            file_format="xyz",
            customer_id="C001",
            site_id="S001",
        )
        with pytest.raises(ValidationError, match="Unsupported format"):
            await use_case.execute(command)
```

### Webhook Use Case Tests

```python
"""tests/unit/application/test_handle_webhook.py"""
import pytest
from unittest.mock import AsyncMock
from app.application.use_cases.handle_webhook import HandleWebhookUseCase


class TestHandleWebhookUseCase:
    @pytest.fixture
    def use_case(self):
        return HandleWebhookUseCase(
            queue=AsyncMock(),
            workflow_repo=AsyncMock(),
        )
    
    async def test_successful_webhook(self, use_case):
        use_case.workflow_repo.get_workflow_by_correlation.return_value = None
        
        event = WebhookEvent(
            customerID="C001",
            siteID="S001",
            fileID="F001",
            type="pointcloud",
            source="e57",
            state="uploaded",
            status="active",
            storageLocation="internal",
        )
        result = await use_case.execute(event)
        
        assert result.workflow_id.startswith("scan2bim-")
        assert result.status == "accepted"
        use_case.workflow_repo.create_workflow.assert_called_once()
        use_case.queue.send.assert_called_once()
    
    async def test_rejects_non_e57_source(self, use_case):
        event = WebhookEvent(
            customerID="C001", siteID="S001", fileID="F001",
            type="pointcloud", source="xyz", state="uploaded", status="active",
        )
        with pytest.raises(ValidationError, match="Unsupported source"):
            await use_case.execute(event)
    
    async def test_rejects_duplicate_correlation(self, use_case):
        use_case.workflow_repo.get_workflow_by_correlation.return_value = {"workflow_id": "existing"}
        
        event = WebhookEvent(
            customerID="C001", siteID="S001", fileID="F001",
            type="pointcloud", source="e57", state="uploaded", status="active",
            correlationId="existing",
        )
        with pytest.raises(DuplicateWorkflowError):
            await use_case.execute(event)
```

---

## 4. Integration Tests (Infrastructure Layer)

### Database Integration

```python
"""tests/integration/test_postgres_repo.py"""
import pytest
from app.infrastructure.adapters.database.postgres_repo import PostgresWorkflowRepo


@pytest.fixture
async def repo():
    """Use test database (Docker PostgreSQL)."""
    repo = PostgresWorkflowRepo("postgresql+asyncpg://scan2bim:scan2bim@localhost:5432/scan2bim_test")
    await repo.initialize()
    yield repo
    await repo.cleanup()


class TestPostgresWorkflowRepo:
    async def test_create_and_get_workflow(self, repo):
        workflow = {
            "workflow_id": "scan2bim-test-001",
            "customer_id": "C001",
            "site_id": "S001",
            "file_id": "F001",
            "status": "PENDING",
        }
        await repo.create_workflow(workflow)
        
        result = await repo.get_workflow("scan2bim-test-001")
        assert result["status"] == "PENDING"
        assert result["customer_id"] == "C001"
    
    async def test_update_status(self, repo):
        await repo.create_workflow({...})
        await repo.update_workflow_status("scan2bim-test-001", "RUNNING")
        
        result = await repo.get_workflow("scan2bim-test-001")
        assert result["status"] == "RUNNING"
```

### Temporal Integration

```python
"""tests/integration/test_temporal_workflow.py"""
import pytest
from temporalio.testing import WorkflowEnvironment
from app.workflow.definition import Scan2BimWorkflow
from app.workflow.activities import generate_file_url, dispatch_segmentation


class TestScan2BimWorkflow:
    async def test_workflow_starts_and_waits_for_signal(self):
        async with await WorkflowEnvironment.start_time_skipping() as env:
            # Register workflow and activities
            async with Worker(
                env.client,
                task_queue="test-queue",
                workflows=[Scan2BimWorkflow],
                activities=[generate_file_url, dispatch_segmentation, track_post_processing],
            ):
                handle = await env.client.start_workflow(
                    Scan2BimWorkflow.run,
                    {"workflow_id": "test-001", "customer_id": "C001", ...},
                    id="test-001",
                    task_queue="test-queue",
                )
                
                # Workflow should be waiting for segmentation signal
                status = await handle.query(Scan2BimWorkflow.get_status)
                assert status == "WAITING_SEGMENTATION"
                
                # Send signal
                await handle.signal(
                    Scan2BimWorkflow.activity_completed,
                    {"activityName": "SEGMENTATION", "status": "COMPLETED"},
                )
                
                # Now waiting for post-processing
                status = await handle.query(Scan2BimWorkflow.get_status)
                assert status == "WAITING_POST_PROCESSING"
```

---

## 5. Contract Tests

```python
"""tests/contract/test_queue_messages.py"""
from shared.contracts.messages import (
    SegmentationStartMessage,
    SegmentationCompleteMessage,
    PostProcessingStartMessage,
)


class TestQueueMessageContracts:
    def test_segmentation_start_message_schema(self):
        """Verify message matches what Segmentation Service expects."""
        msg = SegmentationStartMessage(
            workflow_id="scan2bim-001",
            payload=SegmentationStartMessage.Payload(
                customer_id="C001",
                site_id="S001",
                file_id="F001",
                file_url="https://blob.storage/scan.e57",
            ),
        )
        
        # Serialize and deserialize
        json_str = msg.model_dump_json()
        parsed = SegmentationStartMessage.model_validate_json(json_str)
        
        assert parsed.type == "SEGMENTATION_START"
        assert parsed.payload.file_url.startswith("https://")
    
    def test_segmentation_complete_backward_compatible(self):
        """Ensure old messages can still be parsed."""
        old_format = {
            "id": "uuid-001",
            "workflowId": "scan2bim-001",
            "type": "SEGMENTATION_COMPLETE",
            "step": "SEGMENTATION_DONE",
            "source": "segmentation-service",
            "payload": {
                "segmented_file_path": "path/to/output.ply",
                "point_count": 1500000,
            },
        }
        # Should parse without error (extra fields ignored)
        msg = SegmentationCompleteMessage.model_validate(old_format)
        assert msg.type == "SEGMENTATION_COMPLETE"
```

---

## 6. E2E Tests

```python
"""tests/e2e/test_full_pipeline.py"""
import pytest
import httpx
import asyncio


class TestFullPipeline:
    """
    E2E test: Upload → Workflow → Mock Segmentation → Mock PP → Complete
    Requires: Root Service running with MOCK_DOWNSTREAM=true
    """
    
    BASE_URL = "http://localhost:3000"
    
    async def test_upload_to_completion(self):
        """Full pipeline with mock downstream services."""
        async with httpx.AsyncClient() as client:
            # Step 1: Upload file
            with open("tests/fixtures/small_scan.e57", "rb") as f:
                upload_resp = await client.post(
                    f"{self.BASE_URL}/api/files/upload",
                    files={"file": ("scan.e57", f, "application/octet-stream")},
                    data={"customer_id": "TEST", "site_id": "SITE-001"},
                )
            
            assert upload_resp.status_code == 201
            file_id = upload_resp.json()["file_id"]
            
            # Step 2: Trigger pipeline via webhook (same as external system)
            webhook_resp = await client.post(
                f"{self.BASE_URL}/api/webhook",
                json={
                    "customerID": "TEST",
                    "siteID": "SITE-001",
                    "fileID": file_id,
                    "fileName": "scan.e57",
                    "type": "pointcloud",
                    "source": "e57",
                    "state": "uploaded",
                    "status": "active",
                    "storageLocation": "internal",
                },
            )
            
            assert webhook_resp.status_code == 200
            workflow_id = webhook_resp.json()["workflow_id"]
            
            # Wait for completion (mock signals after 5s × 2)
            for _ in range(30):  # Max 30 seconds
                await asyncio.sleep(1)
                status_resp = await client.get(
                    f"{self.BASE_URL}/api/workflows/{workflow_id}"
                )
                if status_resp.json()["status"] == "COMPLETED":
                    break
            
            # Verify completion
            final = await client.get(
                f"{self.BASE_URL}/api/workflows/{workflow_id}"
            )
            assert final.json()["status"] == "COMPLETED"
```

---

## 7. Coverage Requirements

| Layer | Minimum Coverage |
|-------|-----------------|
| Domain | 90% |
| Application (use cases) | 85% |
| Infrastructure (adapters) | 70% |
| API (routes) | 80% |
| Overall | 80% |

---

## 8. Running Tests

```bash
# All tests
poetry run pytest

# Unit only
poetry run pytest tests/unit/ -v

# Integration (needs Docker infra)
poetry run pytest tests/integration/ -v

# With coverage
poetry run pytest --cov=app --cov-report=html

# Property-based tests
poetry run pytest tests/property/ -v
```
