# Cloud First Deploy Quickstart

This guide uses your provided values and highlights only what is still missing.

## Fixed Values

- PROJECT_ID: macd2026
- REGION: europe-west3
- CLOUD_SQL_INSTANCE: macd2026-postresql
- DB_NAME: inner_circle
- GCS_BUCKET_NAME: aschoenhals-inner-circle-images
- OPERATOR_API_KEY: macd2026-operator-key

## Still Required

- DB_USER (choose a new db user, for example app_user)
- DB_PASS (strong password for DB_USER)
- OPENAI_API_KEY

## 1. Authenticate gcloud

```bash
gcloud auth login
gcloud config set project macd2026
gcloud config set run/region europe-west3
```

## 2. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

## 3. Create core resources

```bash
gcloud artifacts repositories create inner-circle \
  --repository-format=docker \
  --location=europe-west3 \
  --description="Inner Circle images" || true

gsutil mb -l europe-west3 gs://aschoenhals-inner-circle-images || true

gcloud sql instances create macd2026-postresql \
  --database-version=POSTGRES_15 \
  --cpu=1 \
  --memory=3840MiB \
  --region=europe-west3 \
  --availability-type=zonal \
  --storage-size=20GB \
  --storage-type=SSD || true

gcloud sql databases create inner_circle --instance=macd2026-postresql || true
```

## 4. Create DB user

```bash
export DB_USER="app_user"
export DB_PASS="CHANGE_ME_STRONG_PASSWORD"

gcloud sql users create "$DB_USER" \
  --instance=macd2026-postresql \
  --password="$DB_PASS" || true
```

## 5. Build and push images

```bash
gcloud auth configure-docker europe-west3-docker.pkg.dev

docker build -f apps/backend/Dockerfile \
  -t europe-west3-docker.pkg.dev/macd2026/inner-circle/backend:latest .
docker push europe-west3-docker.pkg.dev/macd2026/inner-circle/backend:latest
```

Deploy backend once first to get BACKEND_URL:

```bash
export OPENAI_API_KEY="CHANGE_ME_OPENAI_KEY"

gcloud run deploy inner-circle-backend \
  --image europe-west3-docker.pkg.dev/macd2026/inner-circle/backend:latest \
  --platform managed \
  --region europe-west3 \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars NODE_ENV=production,OPERATOR_API_KEY=macd2026-operator-key,OPENAI_API_KEY=$OPENAI_API_KEY,OPENAI_MODEL=gpt-4.1-mini,IMAGE_STORAGE_MODE=gcs,GCS_BUCKET_NAME=aschoenhals-inner-circle-images,GCP_PROJECT_ID=macd2026,OPEN_WINDOW_SECONDS=20,EVALUATION_TIMEOUT_SECONDS=30,ALLOW_UNCERTAIN_AUTO_OPEN=false \
  --set-env-vars DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost/inner_circle?host=/cloudsql/macd2026:europe-west3:macd2026-postresql" \
  --add-cloudsql-instances macd2026:europe-west3:macd2026-postresql

export BACKEND_URL="$(gcloud run services describe inner-circle-backend --region europe-west3 --format='value(status.url)')"
echo "$BACKEND_URL"
```

Now build and deploy frontend against BACKEND_URL:

```bash
docker build -f apps/frontend/Dockerfile \
  --build-arg VITE_API_BASE_URL="$BACKEND_URL/api/v1" \
  --build-arg VITE_SOCKET_URL="$BACKEND_URL" \
  --build-arg VITE_OPERATOR_API_KEY="macd2026-operator-key" \
  -t europe-west3-docker.pkg.dev/macd2026/inner-circle/frontend:latest .
docker push europe-west3-docker.pkg.dev/macd2026/inner-circle/frontend:latest

gcloud run deploy inner-circle-frontend \
  --image europe-west3-docker.pkg.dev/macd2026/inner-circle/frontend:latest \
  --platform managed \
  --region europe-west3 \
  --allow-unauthenticated \
  --min-instances 1
```

## 6. Run migration and seed against Cloud SQL

```bash
export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@/inner_circle?host=/cloudsql/macd2026:europe-west3:macd2026-postresql"
npm run prisma:migrate -w @inner-circle/backend
npm run prisma:seed -w @inner-circle/backend
```

## 7. Central URL

```bash
FRONTEND_URL="$(gcloud run services describe inner-circle-frontend --region europe-west3 --format='value(status.url)')"
echo "$FRONTEND_URL"
echo "$FRONTEND_URL/access"
echo "$FRONTEND_URL/inner-display"
echo "$FRONTEND_URL/traffic-light"
echo "$FRONTEND_URL/operator"
```

## 8. Auto Deploy On main (GitHub Actions + OIDC)

The repository now contains workflow `.github/workflows/deploy-cloudrun.yml`.

### Trigger

- Automatic on push to `main`
- Manual via `workflow_dispatch`

### Required GitHub Actions variables

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_ARTIFACT_REPOSITORY`
- `GCP_CLOUD_SQL_INSTANCE`
- `GCP_DB_NAME`
- `GCP_GCS_BUCKET`
- `CLOUD_RUN_BACKEND_SERVICE`
- `CLOUD_RUN_FRONTEND_SERVICE`
- `OPENAI_MODEL`
- `OPEN_WINDOW_SECONDS`
- `EVALUATION_TIMEOUT_SECONDS`
- `ALLOW_UNCERTAIN_AUTO_OPEN`

### Required GitHub Actions secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `OPENAI_API_KEY`
- `DB_USER`
- `DB_PASS`
- `OPERATOR_API_KEY`

### Verify pipeline result

```bash
gh run list --repo aschoenhals/MACD2026 --workflow deploy-cloudrun.yml --limit 5
gh run view --repo aschoenhals/MACD2026 <RUN_ID> --log
```

When successful, the workflow performs smoke tests against:

- Backend: `/api/v1/room-state`
- Frontend: `/` and `/operator`