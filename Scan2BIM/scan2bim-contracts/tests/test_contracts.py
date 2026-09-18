from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from pydantic import ValidationError
from scan2bim_contracts.common.enums import ArtifactType, ChecksumAlgorithm, CommandType, SubjectType, ValidationStatus
from scan2bim_contracts.common.models import ArtifactReference
from scan2bim_contracts.commands.models import CommandEnvelope, ModelSelection, StartSegmentationData
from scan2bim_contracts.workflows.models import ScanToBimWorkflowInput

def artifact(kind=ArtifactType.CANONICAL_POINT_CLOUD):
    return ArtifactReference(artifactId=uuid4(), artifactType=kind, fileName="a.bin", contentType="application/octet-stream", storageReference="blob:container/key", checksumAlgorithm=ChecksumAlgorithm.SHA256, checksum="a"*64, sizeBytes=1, version="1.0")
def test_camel_case_round_trip():
    a=artifact(); assert "artifactId" in a.model_dump(by_alias=True); assert ArtifactReference.model_validate(a.model_dump(by_alias=True))==a
def test_unknown_fields_rejected():
    data=artifact().model_dump(by_alias=True); data["surprise"]=1
    with pytest.raises(ValidationError): ArtifactReference.model_validate(data)
def test_workflow_identity_and_count():
    rid=uuid4(); a=artifact(); now=datetime.now(timezone.utc)
    model=ScanToBimWorkflowInput(workflowId=f"scan2bim:{rid}", ingestionRequestId=rid, correlationId=uuid4(), requestedFileCount=1, canonicalArtifacts=[a], requestedAt=now)
    assert model.requested_file_count==1
    with pytest.raises(ValidationError): ScanToBimWorkflowInput(workflowId="wrong", ingestionRequestId=rid, correlationId=uuid4(), requestedFileCount=1, canonicalArtifacts=[a], requestedAt=now)
def test_command_envelope():
    now=datetime.now(timezone.utc); rid=uuid4(); a=artifact(); payload=StartSegmentationData(canonicalArtifacts=[a], modelSelection=ModelSelection(modelName="baseline"))
    cmd=CommandEnvelope[StartSegmentationData](commandId=uuid4(), commandType=CommandType.START_SEGMENTATION, issuedAt=now, deadlineAt=now+timedelta(hours=1), targetService="segmentation-service", correlationId=uuid4(), causationId=str(uuid4()), ingestionRequestId=rid, workflowId=f"scan2bim:{rid}", subjectId=a.artifact_id, subjectType=SubjectType.CANONICAL_POINT_CLOUD, attempt=1, data=payload)
    assert cmd.data.canonical_artifacts[0]==a
