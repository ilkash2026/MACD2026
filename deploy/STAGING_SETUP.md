# Staging Deployment Setup

## Overview

This document describes how to set up the staging deployment environment for the Inner Circle MVP.

The project uses two independent deployment pipelines:

| URL | Branch | Service | Purpose |
|-----|--------|---------|---------|
| Production URL (TBD) | `main` | `inner-circle-{backend,frontend}` | Production/Stable |
| Staging URL (TBD) | `staging` | `inner-circle-{backend,frontend}-staging` | Testing/Integration |

## GitHub Actions Workflows

### Production Workflow
- **File**: `.github/workflows/deploy-cloudrun.yml`
- **Trigger**: Pushes to `main` branch
- **Services**: `CLOUD_RUN_BACKEND_SERVICE`, `CLOUD_RUN_FRONTEND_SERVICE`

### Staging Workflow
- **File**: `.github/workflows/deploy-staging-cloudrun.yml`
- **Trigger**: Pushes to `staging` branch
- **Services**: `CLOUD_RUN_STAGING_BACKEND_SERVICE`, `CLOUD_RUN_STAGING_FRONTEND_SERVICE`

## GitHub Repository Variables

Add these variables to your GitHub repository settings (`Settings > Secrets and variables > Variables`):

### Staging-specific variables (in addition to existing production variables):

```
CLOUD_RUN_STAGING_BACKEND_SERVICE=inner-circle-backend-staging
CLOUD_RUN_STAGING_FRONTEND_SERVICE=inner-circle-frontend-staging
```

## Setup Steps

### 1. Create Cloud Run Services

Create two new Cloud Run services for staging (optional if using `gcloud run deploy`):

```bash
# Backend staging
gcloud run deploy inner-circle-backend-staging \
  --region REGION \
  --project PROJECT_ID \
  --platform managed \
  --allow-unauthenticated \
  --image REGION-docker.pkg.dev/PROJECT_ID/inner-circle/backend-staging:latest

# Frontend staging
gcloud run deploy inner-circle-frontend-staging \
  --region REGION \
  --project PROJECT_ID \
  --platform managed \
  --allow-unauthenticated \
  --image REGION-docker.pkg.dev/PROJECT_ID/inner-circle/frontend-staging:latest
```

The GitHub Actions workflow will automatically update these services on pushes to `staging` branch.

### 2. Configure GitHub Variables

Add staging service names to repository variables:
- `CLOUD_RUN_STAGING_BACKEND_SERVICE=inner-circle-backend-staging`
- `CLOUD_RUN_STAGING_FRONTEND_SERVICE=inner-circle-frontend-staging`

### 3. Test the Staging Workflow

Push a commit to the `staging` branch:

```bash
git checkout staging
# Make changes...
git add .
git commit -m "test: staging deployment"
git push origin staging
```

The workflow will trigger automatically. Monitor progress in GitHub Actions tab.

## Deployment Flow

```
Feature Development
        ↓
feature/buzzer (or any feature branch)
        ↓
[Manual] Merge to staging
        ↓
GitHub Actions: Deploy to staging URL
        ↓
[Test features on staging]
        ↓
[If OK] Create PR: staging → main
        ↓
[Review & Merge]
        ↓
GitHub Actions: Deploy to production URL
```

## Container Image Tags

- **Production**: `backend:latest`, `frontend:latest`
- **Staging**: `backend-staging:latest`, `frontend-staging:latest`

Images are tagged with both `latest` (for quick updates) and commit SHA (for traceability).

## Monitoring Deployments

### View deployment logs

```bash
# Production
gcloud run services describe inner-circle-frontend --region REGION --project PROJECT_ID

# Staging
gcloud run services describe inner-circle-frontend-staging --region REGION --project PROJECT_ID
```

### View GitHub Actions logs

1. Go to: `https://github.com/YOUR_ORG/MACD2026/actions`
2. Click on the relevant workflow run
3. View logs for each step

## Rollback

To rollback to a previous deployment:

```bash
# Get previous revisions
gcloud run revisions list --service inner-circle-frontend-staging --region REGION

# Route traffic to previous revision
gcloud run services update-traffic inner-circle-frontend-staging \
  --to-revisions REVISION_NAME=100 \
  --region REGION
```

## Notes

- Both `main` and `staging` branches deploy independently
- Staging uses the same database and resources as production by default
- Consider using separate Cloud SQL instances for full isolation (advanced setup)
- Staging deployments do not block production deployments and vice versa
