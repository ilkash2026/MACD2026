# Inner Circle MVP

Production-minded MVP for an interactive installation controlling access to an Inner Circle room using observation, imitation, and AI evaluation.

## 1. Architecture Summary

- Modular monolith backend (`apps/backend`) with explicit domain services.
- React frontend (`apps/frontend`) with route-based kiosk/operator views:
  - `/access`
  - `/inner-display`
  - `/traffic-light`
  - `/operator`
- Shared contracts package (`packages/contracts`) for typed DTOs/states/events.
- PostgreSQL + Prisma for persistence.
- Socket.IO for realtime room/device updates.
- OpenAI adapter abstraction for image-based evaluation.
- Storage abstraction supporting local filesystem and Google Cloud Storage.

## 2. Project Structure

```text
.
├─ apps/
│  ├─ backend/
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  └─ seed.ts
│  │  ├─ src/
│  │  │  ├─ domain/
│  │  │  │  ├─ pricing-engine.ts
│  │  │  │  └─ state-machine.ts
│  │  │  ├─ routes/
│  │  │  │  ├─ operator.ts
│  │  │  │  └─ public.ts
│  │  │  ├─ services/
│  │  │  │  ├─ evaluation-service.ts
│  │  │  │  ├─ openai-adapter.ts
│  │  │  │  ├─ room-service.ts
│  │  │  │  └─ storage-service.ts
│  │  │  └─ server.ts
│  │  └─ test/state-machine.test.ts
│  ├─ frontend/
│  │  └─ src/
│  │     ├─ App.tsx
│  │     ├─ api.ts
│  │     ├─ socket.ts
│  │     └─ styles.css
│  └─ device-agent/
│     └─ agent.js
├─ packages/contracts/src/index.ts
├─ docker-compose.yml
└─ deploy/cloudrun/
   ├─ backend.service.yaml
   ├─ frontend.service.yaml
   └─ DEPLOY.md
```

## 3. Core MVP Decisions

- Exactly one active session is enforced by room state and transition guards.
- Buzzer duplicate resilience is done by CLOSED-only session creation and device-event dedupe window.
- Beam duplicate resilience is done with per-device/type debounce window before occupancy mutation.
- Outside visitors never receive task instruction digitally; task is exposed only on inner display endpoint.
- Operator has hard override capability for pass/fail/open/block/reset and occupancy correction.
- `UNCERTAIN` AI result does not open the door unless explicitly enabled with env flag.

## 4. Room State Machine

States:
- `CLOSED`
- `VERIFICATION`
- `EVALUATION`
- `OPEN`
- `BLOCKED`

Implemented transitions:
- `CLOSED -> VERIFICATION` on `BUZZER_PRESSED`
- `VERIFICATION -> EVALUATION` on `SOLVE_STARTED`
- `EVALUATION -> OPEN` on `EVALUATION_PASSED`
- `EVALUATION -> CLOSED` on `EVALUATION_FAILED`
- `OPEN -> CLOSED` on `OPEN_TIMEOUT`
- `ANY -> BLOCKED` on `SYSTEM_ERROR` or `OPERATOR_BLOCK`
- `BLOCKED -> CLOSED` on `OPERATOR_RESET`

Invalid transitions are rejected and audit-logged.

## 5. REST API Contracts

Public/Device API:
- `GET /api/v1/room-state`
- `POST /api/v1/sessions`
- `POST /api/v1/sessions/:id/solve`
- `POST /api/v1/sessions/:id/submissions`
- `POST /api/v1/device-events`
- `POST /api/v1/devices/:id/heartbeat`
- `GET /api/v1/inner-display`

Operator API:
- `POST /api/v1/operator/override`
- `POST /api/v1/operator/occupancy/adjust`
- `GET /api/v1/operator/tasks`
- `POST /api/v1/operator/tasks`
- `PATCH /api/v1/operator/tasks/:id`
- `DELETE /api/v1/operator/tasks/:id`
- `GET /api/v1/operator/drinks`
- `POST /api/v1/operator/drinks`
- `PATCH /api/v1/operator/drinks/:id`
- `GET /api/v1/operator/pricing-rules`
- `POST /api/v1/operator/pricing-rules`
- `PATCH /api/v1/operator/pricing-rules/:id`
- `GET /api/v1/operator/devices`
- `GET /api/v1/operator/sessions`
- `GET /api/v1/operator/audit-logs`

Operator auth is `x-operator-key` header.

## 6. WebSocket Events

From `packages/contracts` event map:
- `room.state.changed`
- `session.started`
- `session.evaluation.started`
- `session.evaluation.completed`
- `door.opened`
- `door.closed`
- `occupancy.changed`
- `pricing.updated`
- `device.status.changed`
- `operator.audit.logged`

## 7. Dynamic Drink Pricing

`pricingRule.config` JSON uses occupancy tiers:

```json
{
  "ranges": [
    { "max": 10, "multiplier": 0.8 },
    { "min": 11, "max": 20, "multiplier": 1.0 },
    { "min": 21, "multiplier": 1.3 }
  ]
}
```

`innerPrice = basePriceInner * multiplier` for matched tier.

## 8. OpenAI Evaluation

Flow:
1. Access tablet uploads captured image (base64).
2. Backend stores image (local or GCS).
3. Backend sends image URL + task prompt to OpenAI adapter.
4. Adapter normalizes result to `PASSED | FAILED | UNCERTAIN`.
5. Raw response and normalized result are persisted.
6. State transition occurs based on result and operator policy.

## 9. Local Development

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Install:

```bash
npm install
```

3. Start Postgres:

```bash
docker compose up -d postgres
```

4. Prisma migrate + generate + seed:

```bash
npm run prisma:generate -w @inner-circle/backend
npm run prisma:migrate -w @inner-circle/backend
npm run prisma:seed -w @inner-circle/backend
```

5. Run backend and frontend:

```bash
npm run dev -w @inner-circle/backend
npm run dev -w @inner-circle/frontend
```

Backend: `http://localhost:8080`
Frontend: `http://localhost:5173`

### Full local stack via compose

```bash
docker compose up --build
```

## 10. Deploy to Google Cloud

See `deploy/cloudrun/DEPLOY.md`.

High-level:
1. Provision Cloud SQL + GCS.
2. Build/push backend and frontend images.
3. Replace service YAML placeholders.
4. Deploy with `gcloud run services replace ...`.
5. Run Prisma migrations and seed against Cloud SQL.

## 11. Operator-First Recovery Model

- Block entire system with override (`BLOCK`).
- Reset to safe closed state (`RESET`).
- Manual pass/fail/open for any active session.
- Manual occupancy corrections.
- Audit log records transitions, overrides, and occupancy changes.

## 12. Tests

Run:

```bash
npm run test -w @inner-circle/backend
```

Included:
- State machine transition tests for valid and invalid transitions.

## 13. Notes for MVP Expansion

- Add durable distributed lock if scaling backend beyond one Cloud Run instance.
- Add richer operator CRUD forms (currently JSON-focused control panel).
- Add GPIO-native debounce implementation in Pi agent.
- Add signed URL upload flow for large camera files.
