from datetime import datetime
from typing import Any, Annotated, Generic, TypeVar
from uuid import UUID
from pydantic import Field
from scan2bim_contracts.common.base import ContractModel
from scan2bim_contracts.common.enums import SubjectType, ValidationStatus, WorkflowStage
from scan2bim_contracts.common.models import ArtifactReference, CommonError, ContractVersion, NonBlank
T=TypeVar("T", bound=ContractModel)
class EventEnvelope(ContractModel, Generic[T]):
    event_id: UUID; event_type: NonBlank; event_version: ContractVersion="1.0"; occurred_at: datetime
    producer: NonBlank; correlation_id: UUID; causation_id: str|None=None; trace_id: str|None=None
    ingestion_request_id: UUID|None=None; workflow_id: str|None=None; project_id: UUID|None=None; site_id: UUID|None=None
    subject_id: UUID; subject_type: SubjectType; data: T; metadata: dict[str,Any]=Field(default_factory=dict)
class CanonicalPointCloudCreatedData(ContractModel):
    point_cloud_file_id: UUID; canonical_artifact_id: UUID; source_format: NonBlank; adapter_name: NonBlank; adapter_version: ContractVersion
    canonical_model_version: ContractVersion; validation_status: LiteralValid; point_count: Annotated[int,Field(ge=0)]
    available_attributes: tuple[str,...]; artifact: ArtifactReference
class LiteralValid(str):
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler):
        from pydantic_core import core_schema
        return core_schema.literal_schema(["VALID"])
class ProcessingCompletedData(ContractModel):
    attempt: Annotated[int,Field(ge=1)]; result_id: UUID; artifacts: tuple[ArtifactReference,...]=()
    validation_status: ValidationStatus|None=None
class ProcessingFailedData(ContractModel):
    attempt: Annotated[int,Field(ge=1)]; stage: WorkflowStage; error: CommonError
class WorkflowStartedData(ContractModel): workflow_id: NonBlank; started_at: datetime
class WorkflowTerminalData(ContractModel): workflow_id: NonBlank; completed_at: datetime; error: CommonError|None=None
class ArtifactReadyData(ContractModel): artifact: ArtifactReference; ifc_model_id: UUID; validation_status: ValidationStatus
