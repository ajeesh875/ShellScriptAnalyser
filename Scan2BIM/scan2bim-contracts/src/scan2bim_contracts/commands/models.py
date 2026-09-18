from datetime import datetime
from typing import Annotated, Any, Generic, TypeVar, Literal
from uuid import UUID
from pydantic import Field, model_validator
from scan2bim_contracts.common.base import ContractModel
from scan2bim_contracts.common.enums import ArtifactType, CommandType, SubjectType, ValidationStatus
from scan2bim_contracts.common.models import ArtifactReference, ContractVersion, NonBlank

T=TypeVar("T", bound=ContractModel)
class CommandEnvelope(ContractModel, Generic[T]):
    command_id: UUID; command_type: CommandType; command_version: ContractVersion="1.0"
    issued_at: datetime; not_before: datetime|None=None; deadline_at: datetime
    producer: Literal["workflow-service"]="workflow-service"; target_service: NonBlank
    correlation_id: UUID; causation_id: NonBlank; trace_id: str|None=None
    ingestion_request_id: UUID; workflow_id: NonBlank; project_id: UUID|None=None; site_id: UUID|None=None
    subject_id: UUID; subject_type: SubjectType; attempt: Annotated[int, Field(ge=1)]
    data: T; metadata: dict[str, Any] = Field(default_factory=dict)
    @model_validator(mode="after")
    def validate_times(self):
        if self.deadline_at <= self.issued_at: raise ValueError("deadlineAt must be after issuedAt")
        if self.not_before and self.not_before >= self.deadline_at: raise ValueError("notBefore must be before deadlineAt")
        return self

class ModelSelection(ContractModel): model_name: NonBlank; model_version: str|None=None
class SegmentationOptions(ContractModel): use_available_semantic_labels: bool=True
class StartSegmentationData(ContractModel):
    canonical_artifacts: Annotated[tuple[ArtifactReference,...], Field(min_length=1)]
    model_selection: ModelSelection; processing_options: SegmentationOptions=SegmentationOptions()
    @model_validator(mode="after")
    def validate_artifacts(self):
        ids=[a.artifact_id for a in self.canonical_artifacts]
        if len(ids)!=len(set(ids)): raise ValueError("canonicalArtifacts must be unique")
        if any(a.artifact_type != ArtifactType.CANONICAL_POINT_CLOUD for a in self.canonical_artifacts): raise ValueError("StartSegmentation requires CANONICAL_POINT_CLOUD")
        return self
class GenerateGeometryData(ContractModel):
    segmentation_result_id: UUID; segmentation_artifact: ArtifactReference
    canonical_artifact_ids: Annotated[tuple[UUID,...], Field(min_length=1)]; geometry_profile: NonBlank="MVP_GENERAL"
    @model_validator(mode="after")
    def type_check(self):
        if self.segmentation_artifact.artifact_type != ArtifactType.SEGMENTATION_RESULT: raise ValueError("GenerateGeometry requires SEGMENTATION_RESULT")
        return self
class GenerateIFCData(ContractModel):
    geometry_model_id: UUID; geometry_artifact: ArtifactReference; target_ifc_schema: NonBlank="IFC4"; generation_profile: NonBlank="MVP_GENERAL"
    @model_validator(mode="after")
    def type_check(self):
        if self.geometry_artifact.artifact_type != ArtifactType.GEOMETRY_MODEL: raise ValueError("GenerateIFC requires GEOMETRY_MODEL")
        return self
class ValidateIFCData(ContractModel):
    ifc_model_id: UUID; ifc_artifact: ArtifactReference; validation_policy: NonBlank="MVP_FEASIBILITY_V1"
    @model_validator(mode="after")
    def type_check(self):
        if self.ifc_artifact.artifact_type != ArtifactType.IFC_MODEL_UNVALIDATED: raise ValueError("ValidateIFC requires IFC_MODEL_UNVALIDATED")
        return self
class PrepareArtifactDeliveryData(ContractModel):
    ifc_model_id: UUID; validation_status: ValidationStatus; source_artifact: ArtifactReference; delivery_profile: NonBlank="PORTAL_DOWNLOAD"
    @model_validator(mode="after")
    def validate_delivery(self):
        if self.validation_status not in {ValidationStatus.PASSED, ValidationStatus.PASSED_WITH_WARNINGS}: raise ValueError("Delivery requires passing validation")
        if self.source_artifact.artifact_type != ArtifactType.IFC_MODEL: raise ValueError("Delivery requires IFC_MODEL")
        return self
