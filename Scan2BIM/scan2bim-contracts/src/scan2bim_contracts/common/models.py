from typing import Any, Annotated
from uuid import UUID
from pydantic import Field, HttpUrl
from .base import ContractModel
from .enums import ArtifactType, ChecksumAlgorithm, WorkflowStage

NonBlank = Annotated[str, Field(min_length=1)]
ContractVersion = Annotated[str, Field(pattern=r"^1\.[0-9]+$")]

class ArtifactReference(ContractModel):
    artifact_id: UUID
    artifact_type: ArtifactType
    file_name: NonBlank
    content_type: NonBlank
    storage_reference: NonBlank
    checksum_algorithm: ChecksumAlgorithm = ChecksumAlgorithm.SHA256
    checksum: Annotated[str, Field(min_length=32, max_length=128)]
    size_bytes: Annotated[int, Field(ge=0)]
    version: ContractVersion = "1.0"

class CommonError(ContractModel):
    error_code: Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]+$")]
    error_category: Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]+$")]
    message: NonBlank
    retryable: bool
    failed_stage: WorkflowStage | None = None
    attempt: Annotated[int, Field(ge=1)] | None = None
    details_reference: str | None = None

class FieldError(ContractModel):
    field: NonBlank; code: NonBlank; message: NonBlank

class ProblemDetails(ContractModel):
    type: HttpUrl
    title: NonBlank
    status: Annotated[int, Field(ge=400, le=599)]
    detail: NonBlank
    instance: NonBlank
    error_code: NonBlank
    correlation_id: UUID
    errors: tuple[FieldError, ...] = ()

class Page(ContractModel):
    items: tuple[Any, ...]
    page_size: Annotated[int, Field(ge=1)]
    continuation_token: str | None = None
