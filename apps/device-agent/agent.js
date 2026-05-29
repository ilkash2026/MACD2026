const axios = require("axios");

const API_BASE = process.env.API_BASE || "http://localhost:8080/api/v1";
const DEVICE_ID = process.env.DEVICE_ID || "buzzer-1";
const ROLE = process.env.DEVICE_ROLE || "buzzer-pi";
const EVENT_TYPE = process.env.EVENT_TYPE || "BUZZER_PRESSED";
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 5000);

async function heartbeat() {
  try {
    await axios.post(`${API_BASE}/devices/${DEVICE_ID}/heartbeat`, {
      metadata: { role: ROLE }
    });
    console.log("heartbeat sent");
  } catch (error) {
    console.error("heartbeat failed", error.message);
  }
}

async function sendEvent(payload = {}) {
  try {
    await axios.post(`${API_BASE}/device-events`, {
      deviceId: DEVICE_ID,
      type: EVENT_TYPE,
      payload
    });
    console.log("event sent", EVENT_TYPE);
  } catch (error) {
    console.error("event failed", error.message);
  }
}

setInterval(heartbeat, HEARTBEAT_MS);
heartbeat();

process.stdin.setEncoding("utf8");
console.log("Type 'trigger' to emit event, Ctrl+C to exit");
process.stdin.on("data", (line) => {
  if (line.trim().toLowerCase() === "trigger") {
    sendEvent({ source: "manual-cli" });
  }
});
