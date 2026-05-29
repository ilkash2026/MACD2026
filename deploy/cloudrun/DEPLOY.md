# Google Cloud Deployment (MVP)

## 1. Provision

1. Create Cloud SQL PostgreSQL instance and database `inner_circle`.
2. Create GCS bucket for evaluation images.
3. Enable APIs: Cloud Run, Artifact Registry, Cloud SQL Admin, Storage.

## 2. Build and push images

```bash
gcloud auth configure-docker REGION-docker.pkg.dev

docker build -f apps/backend/Dockerfile -t REGION-docker.pkg.dev/PROJECT/inner-circle/backend:latest .
docker push REGION-docker.pkg.dev/PROJECT/inner-circle/backend:latest

docker build \
	-f apps/frontend/Dockerfile \
	--build-arg VITE_API_BASE_URL=https://BACKEND_RUN_URL \
	--build-arg VITE_SOCKET_URL=https://BACKEND_RUN_URL \
	--build-arg VITE_OPERATOR_API_KEY=YOUR_OPERATOR_KEY \
	-t REGION-docker.pkg.dev/PROJECT/inner-circle/frontend:latest .
docker push REGION-docker.pkg.dev/PROJECT/inner-circle/frontend:latest
```

## 3. Deploy services

Update placeholders in:
- `deploy/cloudrun/backend.service.yaml`
- `deploy/cloudrun/frontend.service.yaml`

Then:

```bash
gcloud run services replace deploy/cloudrun/backend.service.yaml --region REGION
gcloud run services replace deploy/cloudrun/frontend.service.yaml --region REGION
```

## 4. Migrate database

Run Prisma migration from CI job or local machine with production `DATABASE_URL`:

```bash
npm install
npm run prisma:migrate -w @inner-circle/backend
npm run prisma:seed -w @inner-circle/backend
```

## 5. Notes on WebSockets in Cloud Run

- Socket.IO works with Cloud Run WebSocket support.
- Keep backend minScale 1 for this installation MVP.
- For this MVP use single backend instance semantics to avoid multi-instance room-state contention.

## 6. Central URL strategy

- End users should access only the frontend Cloud Run URL (or mapped custom domain).
- All kiosk routes are available from the same host:
	- /access
	- /inner-display
	- /traffic-light
	- /operator
- The frontend calls backend API and Socket.IO using Vite build args set during image build.
