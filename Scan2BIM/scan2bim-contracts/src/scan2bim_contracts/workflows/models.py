from datetime import datetime
from typing import Annotated
from uuid import UUID
from pydantic import Field, model_validator
from scan2bim_contracts.common.base import ContractModel
from scan2bim_contracts.common.enums import ArtifactType, StageStatus, ValidationStatus, WorkflowInitiationStatus, WorkflowStage, WorkflowStatus
from scan2bim_contracts.common.models import ArtifactReference, CommonError, ContractVersion, NonBlank
class ScanToBimWorkflowInput(ContractModel):
    workflow_contract_version: ContractVersion="1.0"; workflow_id: NonBlank; ingestion_request_id: UUID
    project_id: UUID|None=None; site_id: UUID|None=None; correlation_id: UUID
    requested_file_count: Annotated[int,Field(ge=1)]; canonical_artifacts: Annotated[tuple[ArtifactReference,...],Field(min_length=1)]; requested_at: datetime
    @model_validator(mode="after")
    def validate_input(self):
        if self.workflow_id != f"scan2bim:{self.ingestion_request_id}": raise ValueError("workflowId must be scan2bim:{ingestionRequestId}")
        ids={a.artifact_id for a in self.canonical_artifacts}
        if len(ids)!=self.requested_file_count: raise ValueError("canonical artifact count must equal requestedFileCount")
        if any(a.artifact_type != ArtifactType.CANONICAL_POINT_CLOUD for a in self.canonical_artifacts): raise ValueError("workflow input requires canonical artifacts")
        return self
class WorkflowStageState(ContractModel):
    stage: WorkflowStage; status: StageStatus; attempt: Annotated[int,Field(ge=1)]; command_id: UUID|None=None
    started_at: datetime|None=None; completed_at: datetime|None=None; expected_success_event: str|None=None; expected_failure_event: str|None=None
    result_subject_id: UUID|None=None; result_subject_type: str|None=None; last_applied_event_id: UUID|None=None; failure: CommonError|None=None
class WorkflowInitiation(ContractModel):
    workflow_id: NonBlank; ingestion_request_id: UUID; workflow_type: str="ScanToBimWorkflow"; status: WorkflowInitiationStatus
    requested_at: datetime; accepted_at: datetime|None=None; failure_code: str|None=None
class ProcessingOutcomeSignal(ContractModel):
    signal_version: ContractVersion="1.0"; event_id: UUID; event_type: NonBlank; event_version: ContractVersion="1.0"
    workflow_id: NonBlank; stage: WorkflowStage; attempt: Annotated[int,Field(ge=1)]; occurred_at: datetime
    result_subject_id: UUID|None=None; result_subject_type: str|None=None; result_artifact_ids: tuple[UUID,...]=()
    validation_status: ValidationStatus|None=None; error: CommonError|None=None
    @model_validator(mode="after")
    def success_or_failure(self):
        if self.error is not None and (self.result_subject_id is not None or self.result_artifact_ids): raise ValueError("failure signal cannot contain result references")
        return self
class WorkflowQuery(ContractModel):
    query_version: ContractVersion="1.0"; workflow_id: NonBlank; status: WorkflowStatus; current_stage: WorkflowStage|None=None
    current_attempt: int|None=None; started_at: datetime; updated_at: datetime; completed_at: datetime|None=None
    ready_artifact_ids: tuple[UUID,...]=(); failure: CommonError|None=None
class WorkflowResult(ContractModel):
    workflow_contract_version: ContractVersion="1.0"; workflow_id: NonBlank; status: WorkflowStatus; completed_at: datetime
    ifc_model_id: UUID|None=None; ready_artifact_ids: tuple[UUID,...]=(); failed_stage: WorkflowStage|None=None; failure: CommonError|None=None
class WorkflowRetryPolicy(ContractModel):
    policy_version: ContractVersion="1.0"; stage: WorkflowStage; maximum_attempts: Annotated[int,Field(ge=1)]
    initial_interval_seconds: Annotated[int,Field(gt=0)]; backoff_coefficient: Annotated[float,Field(ge=1)]
    maximum_interval_seconds: Annotated[int,Field(gt=0)]; stage_timeout_seconds: Annotated[int,Field(gt=0)]
