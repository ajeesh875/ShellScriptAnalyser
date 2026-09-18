from datetime import datetime
from typing import Any, Annotated
from uuid import UUID
from pydantic import Field
from scan2bim_contracts.common.base import ContractModel
from scan2bim_contracts.common.enums import ArtifactType, IngestionStatus, SourceChannel, WorkflowStage, WorkflowStatus
from scan2bim_contracts.common.models import ArtifactReference, CommonError, NonBlank
class CreateProjectRequest(ContractModel): project_name: NonBlank; customer_name: NonBlank; description: str|None=None
class ProjectResource(ContractModel): project_id: UUID; project_name: NonBlank; customer_name: NonBlank; description: str|None=None; status: str; created_at: datetime; updated_at: datetime
class Location(ContractModel): latitude: Annotated[float,Field(ge=-90,le=90)]; longitude: Annotated[float,Field(ge=-180,le=180)]; elevation_meters: float|None=None
class CreateSiteRequest(ContractModel): site_name: NonBlank; site_type: NonBlank; location: Location; metadata: dict[str,Any]=Field(default_factory=dict)
class CreateIngestionRequest(ContractModel): project_id: UUID; site_id: UUID; source_channel: SourceChannel; source_reference: str|None=None; requested_file_count: Annotated[int,Field(ge=1)]; metadata: dict[str,Any]=Field(default_factory=dict)
class IngestionRequestResource(ContractModel): ingestion_request_id: UUID; project_id: UUID; site_id: UUID; source_channel: SourceChannel; requested_file_count: int; registered_file_count: int; status: IngestionStatus; workflow_id: str|None=None; created_at: datetime; updated_at: datetime; failure: CommonError|None=None
class WorkflowResource(ContractModel): workflow_id: NonBlank; ingestion_request_id: UUID; status: WorkflowStatus; current_stage: WorkflowStage|None=None; created_at: datetime; updated_at: datetime; completed_at: datetime|None=None; failure: CommonError|None=None
class CancellationResponse(ContractModel): workflow_id: NonBlank; status: WorkflowStatus=WorkflowStatus.CANCELLATION_REQUESTED; requested_at: datetime
class ArtifactResource(ContractModel): artifact: ArtifactReference; workflow_id: NonBlank; ready: bool; created_at: datetime
class DownloadSession(ContractModel): download_session_id: UUID; artifact_id: UUID; download_url: NonBlank; expires_at: datetime
