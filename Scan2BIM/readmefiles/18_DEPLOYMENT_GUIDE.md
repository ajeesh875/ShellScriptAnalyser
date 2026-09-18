# 18 — Deployment Guide

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 17_CICD_PIPELINE.md

---

## 1. Environment Matrix

| Environment | Purpose | URL | Auto-Deploy |
|-------------|---------|-----|-------------|
| Local | Development | localhost:3000 | N/A |
| Dev | Integration testing | dev.scan2bim.internal | On merge to main |
| Staging | Pre-production validation | staging.scan2bim.internal | On release tag |
| Production | Live system | scan2bim.sitedigitaltwin.com | Manual approval |

---

## 2. Deployment Checklist

### Pre-Deployment

- [ ] All CI tests passing
- [ ] Docker images built and pushed to ACR
- [ ] Security scan clean (no CRITICAL/HIGH)
- [ ] Database migrations tested (if any)
- [ ] Environment variables updated (if new ones added)
- [ ] Secrets rotated (if needed)

### Deployment Steps

```bash
# 1. Tag release
git tag v1.2.3
git push origin v1.2.3

# 2. CI builds + pushes images automatically

# 3. Update Helm values (GitOps)
# Edit: infrastructure/helm/values-{env}.yaml
# Set new image tag: abc123def

# 4. Flux CD detects change → deploys automatically
# OR manual: helm upgrade scan2bim ./chart -f values-staging.yaml

# 5. Verify deployment
kubectl get pods -n scan2bim
kubectl logs -f deployment/root-service -n scan2bim

# 6. Run smoke tests
curl https://staging.scan2bim.internal/api/health
curl https://staging.scan2bim.internal/api/ready
```

### Post-Deployment

- [ ] Health checks passing
- [ ] Readiness probes green
- [ ] Upload test file → workflow completes
- [ ] Monitor error rate for 30 minutes
- [ ] Check Temporal Web UI for workflow execution

---

## 3. Rollback Procedure

```bash
# Option 1: Revert Helm release
helm rollback scan2bim 1 -n scan2bim

# Option 2: Revert GitOps commit
git revert HEAD
git push origin main

# Option 3: Scale down problematic service
kubectl scale deployment/root-service --replicas=0 -n scan2bim
```

---

## 4. Secret Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| PostgreSQL password | Azure Key Vault | 90 days |
| Service Bus connection | Managed Identity | N/A (no password) |
| Blob Storage | Managed Identity | N/A |
| Cognito client secret | Azure Key Vault | 365 days |
| ACR credentials | Service Principal | 365 days |

### SOPS Encryption (GitOps)

```bash
# Encrypt a secret
sops -e --azure-kv https://vault.vault.azure.net/keys/sops-key \
  secrets.yaml > secrets.enc.yaml

# Decrypt (in cluster via Flux)
# Flux automatically decrypts using Azure Key Vault key
```

---

## 5. Database Migrations

```bash
# Using Alembic for PostgreSQL migrations
cd services/root-service

# Create migration
poetry run alembic revision --autogenerate -m "add_new_column"

# Apply migration (locally)
poetry run alembic upgrade head

# Apply migration (production)
# Run as Kubernetes Job before deployment
kubectl apply -f infrastructure/jobs/db-migrate.yaml
```

---

## 6. Monitoring Production

| What to Watch | Where | Alert Threshold |
|---------------|-------|-----------------|
| Workflow completion rate | Prometheus/Grafana | < 95% per hour |
| Average workflow duration | Prometheus | > 120 minutes |
| DLQ depth | Service Bus metrics | > 0 |
| Pod restarts | Kubernetes | > 3 in 10 min |
| GPU utilization | NVIDIA DCGM | > 95% sustained |
| Memory pressure | Kubernetes | > 90% of limit |
| Error logs | Log Analytics | Error rate spike |
