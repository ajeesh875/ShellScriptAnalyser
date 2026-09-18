# 17 — CI/CD Pipeline (GitHub Actions)

Version: 1.0  
Status: Implementation Ready  
Prerequisite: 16_TESTING_STRATEGY.md

---

## 1. Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    CI/CD PIPELINE                                  │
│                                                                  │
│  PR Created/Updated                                              │
│  ├── Lint (ruff, black)                                         │
│  ├── Type Check (mypy)                                          │
│  ├── Unit Tests                                                 │
│  ├── Integration Tests (Docker services)                         │
│  ├── Contract Tests                                             │
│  ├── Security Scan (trivy, bandit)                              │
│  └── Build Docker Image (verify builds)                         │
│                                                                  │
│  Merge to main                                                   │
│  ├── All above +                                                │
│  ├── Build & Push Docker Image → ACR                            │
│  ├── Update Helm chart version                                  │
│  └── Deploy to Dev environment (auto)                           │
│                                                                  │
│  Release tag (v1.x.x)                                            │
│  ├── Promote image to staging ACR                               │
│  ├── Deploy to Staging                                          │
│  ├── Run E2E tests                                              │
│  └── Manual approval → Deploy to Production                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
    tags: ['v*']

env:
  PYTHON_VERSION: '3.12'
  REGISTRY: esdtcommonacr.azurecr.io

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - run: pip install ruff black mypy
      - run: ruff check services/
      - run: black --check services/
      - run: mypy services/root-service/app/ --ignore-missing-imports

  test-unit:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [root-service, post-processing-service, segmentation-service]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - name: Install dependencies
        working-directory: services/${{ matrix.service }}
        run: |
          pip install poetry
          poetry install
      - name: Run unit tests
        working-directory: services/${{ matrix.service }}
        run: poetry run pytest tests/unit/ -v --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: services/${{ matrix.service }}/coverage.xml

  test-integration:
    runs-on: ubuntu-latest
    needs: [lint, test-unit]
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: scan2bim_test
          POSTGRES_USER: scan2bim
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - name: Start Temporal
        run: |
          docker run -d --name temporal -p 7233:7233 -p 8233:8233 \
            temporalio/auto-setup:latest
      - name: Install & run integration tests
        working-directory: services/root-service
        env:
          DATABASE_URL: postgresql+asyncpg://scan2bim:test@localhost:5432/scan2bim_test
          TEMPORAL_ADDRESS: localhost:7233
        run: |
          pip install poetry
          poetry install
          poetry run pytest tests/integration/ -v

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bandit (Python security)
        run: |
          pip install bandit
          bandit -r services/ -ll -ii
      - name: Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'

  build:
    runs-on: ubuntu-latest
    needs: [test-integration, security-scan]
    if: github.event_name == 'push'
    strategy:
      matrix:
        service: [root-service, post-processing-service, segmentation-service]
    steps:
      - uses: actions/checkout@v4
      - name: Login to ACR
        uses: azure/docker-login@v1
        with:
          login-server: ${{ env.REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}
      - name: Build and push
        working-directory: services/${{ matrix.service }}
        run: |
          IMAGE=${{ env.REGISTRY }}/scan2bim-${{ matrix.service }}
          TAG=${{ github.sha }}
          docker build -t $IMAGE:$TAG -t $IMAGE:latest .
          docker push $IMAGE:$TAG
          docker push $IMAGE:latest
      - name: Trivy image scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '${{ env.REGISTRY }}/scan2bim-${{ matrix.service }}:${{ github.sha }}'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
```

---

## 3. Deployment Strategy

| Environment | Trigger | Approval |
|-------------|---------|----------|
| Dev | Merge to main | Automatic |
| Staging | Release tag (v*) | Automatic |
| Production | After staging E2E pass | Manual approval |

---

## 4. Version Strategy

```
Service version: {major}.{minor}.{patch}
Image tag: {git-sha} (immutable)
Chart version: matches service version

Example:
  scan2bim-root-service:abc123def  (git sha)
  scan2bim-root-service:1.2.3     (release)
  scan2bim-root-service:latest    (main branch)
```
