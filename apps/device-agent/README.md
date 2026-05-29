# Raspberry Pi Device Agent (MVP)

This agent is intentionally small and can run on Raspberry Pi OS.

## API Contract

- Heartbeat: `POST /api/v1/devices/:id/heartbeat`
  - body: `{ metadata: { role: string } }`
- Event: `POST /api/v1/device-events`
  - body: `{ deviceId: string, type: string, payload: object }`

Supported event types in MVP:
- `BUZZER_PRESSED`
- `ENTER_BEAM_TRIGGERED`
- `EXIT_BEAM_TRIGGERED`

## Run

```bash
npm install
API_BASE=http://backend-host:8080/api/v1 DEVICE_ID=buzzer-1 DEVICE_ROLE=buzzer-pi EVENT_TYPE=BUZZER_PRESSED npm start
```

Use `trigger` in stdin to simulate a GPIO event.
In production, replace stdin trigger with GPIO listener + debounce logic.
