import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { socket } from "./socket";
import type { InnerDisplayData } from "./types";

const ROOM_MODE = {
  CLOSED: "CLOSED",
  VERIFICATION: "VERIFICATION",
  EVALUATION: "EVALUATION",
  OPEN: "OPEN",
  BLOCKED: "BLOCKED"
} as const;

type TaskEditorState = {
  id?: string;
  name: string;
  category: string;
  instructionInner: string;
  evaluationPrompt: string;
  active: boolean;
  difficulty: number;
  version: number;
};

type DrinkEditorState = {
  id?: string;
  name: string;
  active: boolean;
  basePriceOuter: number;
  pricingRuleId: string;
};

type PricingRuleEditorState = {
  id?: string;
  name: string;
  active: boolean;
  configText: string;
};

type AccessPhase = "idle" | "arming" | "countdown" | "capturing" | "submitting" | "success" | "failed";

function toTaskEditorState(task: any): TaskEditorState {
  return {
    id: task.id,
    name: task.name ?? "",
    category: task.category ?? "",
    instructionInner: task.instructionInner ?? "",
    evaluationPrompt: task.evaluationPrompt ?? "",
    active: Boolean(task.active),
    difficulty: Number(task.difficulty ?? 1),
    version: Number(task.version ?? 1)
  };
}

function toDrinkEditorState(drink: any): DrinkEditorState {
  return {
    id: drink.id,
    name: drink.name ?? "",
    active: Boolean(drink.active),
    basePriceOuter: Number(drink.basePriceOuter ?? 0),
    pricingRuleId: drink.pricingRuleId ?? ""
  };
}

function toPricingRuleEditorState(rule: any): PricingRuleEditorState {
  return {
    id: rule.id,
    name: rule.name ?? "",
    active: Boolean(rule.active),
    configText: JSON.stringify(rule.config ?? {}, null, 2)
  };
}

function OperatorNav() {
  return (
    <div className="panel nav operatorNav">
      <NavLink to="/operator" end className={({ isActive }) => (isActive ? "navActive" : undefined)}>
        Overview
      </NavLink>
      <NavLink to="/operator/tasks" className={({ isActive }) => (isActive ? "navActive" : undefined)}>
        Tasks
      </NavLink>
      <NavLink to="/operator/drinks" className={({ isActive }) => (isActive ? "navActive" : undefined)}>
        Drinks
      </NavLink>
    </div>
  );
}

function useRoomState() {
  const [roomState, setRoomState] = useState<any>(null);

  const load = async () => {
    const response = await api.roomState();
    setRoomState(response.data);
  };

  useEffect(() => {
    load().catch(console.error);
    socket.on("room.state.changed", setRoomState);
    return () => {
      socket.off("room.state.changed", setRoomState);
    };
  }, []);

  return { roomState, reload: load };
}

function AccessPage() {
  const { roomState, reload } = useRoomState();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("Bereit.");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<AccessPhase>("idle");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const activeSessionId = roomState?.activeSessionId ?? null;
  const sessionIsReady = roomState?.mode === ROOM_MODE.VERIFICATION && Boolean(activeSessionId);
  const showWallpaper = !activeSessionId && phase === "idle";
  const showCamera = phase === "arming" || phase === "countdown" || phase === "capturing" || phase === "submitting";
  const wallpaperMessage = roomState?.mode === ROOM_MODE.OPEN ? "OPEN" : roomState?.mode === ROOM_MODE.BLOCKED ? "BLOCKED" : "STANDBY";

  const waitForVideoElement = async () => {
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (videoRef.current) {
          resolve();
          return;
        }
        window.requestAnimationFrame(tick);
      };

      tick();
    });
  };

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });

    streamRef.current = stream;
    await waitForVideoElement();

    const video = videoRef.current;
    if (!video) throw new Error("Video element not available");

    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  };

  const captureAndSubmit = async (sessionId: string) => {
    const video = videoRef.current;
    if (!video || !streamRef.current) {
      throw new Error("Camera stream not ready");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context not available");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const imageBase64 = dataUrl.split(",")[1];
    return api.submitImage(sessionId, imageBase64, "image/png");
  };

  const solve = async () => {
    if (!activeSessionId || !sessionIsReady || busy) return;

    setBusy(true);
    try {
      setPhase("arming");
      setStatus("Kamera wird gestartet...");
      await startCamera();

      await api.startSolve(activeSessionId, "access-control-tablet");
      await reload();

      setPhase("countdown");
      for (const step of [3, 2, 1]) {
        setCountdown(step);
        setStatus(`Bitte stillhalten. Foto in ${step}...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      setPhase("capturing");
      setCountdown(null);
      setStatus("Foto wird aufgenommen...");

      setPhase("submitting");
      const result = await captureAndSubmit(activeSessionId);
      const evaluationResult = (result.data as any)?.result ?? (result.data as any)?.data?.result ?? null;

      stopCamera();

      if (evaluationResult === "PASSED") {
        setPhase("success");
        setStatus("Glückwunsch, du bist erfolgreich geprüft worden.");
        window.setTimeout(() => setPhase("idle"), 2500);
      } else {
        setPhase("failed");
        setStatus("Zugang abgelehnt. Die Station wechselt wieder zu Closed.");
        window.setTimeout(() => {
          setPhase("idle");
          setStatus("Bereit.");
        }, 1800);
      }

      await reload();
    } catch (error) {
      stopCamera();
      setPhase("failed");
      setStatus(`Evaluation fehlgeschlagen: ${(error as Error).message}`);
      await reload();
      window.setTimeout(() => {
        setPhase("idle");
        setStatus("Bereit.");
      }, 1800);
    } finally {
      setCountdown(null);
      setBusy(false);
    }
  };

  return (
    <div className={`accessScreen ${showWallpaper ? "accessScreenWallpaper" : "accessScreenActive"}`}>
      {showWallpaper ? (
        <div className="accessWallpaper">
          <div className="accessWallpaperGlow" />
          <div className="accessWallpaperPanel">
            <p className="accessWallpaperLabel">Access Control Station</p>
            <h1>{wallpaperMessage}</h1>
            <p className="muted">Warte auf eine laufende Session. Sobald der Buzzervorgang gestartet ist, erscheint der Löse-Button.</p>
            <div className="accessWallpaperMeta">
              <span>Mode: {roomState?.mode ?? "..."}</span>
              <span>Door: {roomState?.doorStatus ?? "..."}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="accessStation">
          <div className="accessStationHeader">
            <p className="accessWallpaperLabel">Access Control Station</p>
            <h1>{phase === "success" ? "Geschafft" : phase === "failed" ? "Nochmals versuchen" : "Lösen"}</h1>
            <p className="muted">
              {showCamera || phase === "success" || phase === "failed"
                ? "Du wirst gerade gefilmt. Bitte bleibe im Bild und halte still."
                : sessionIsReady
                  ? "Session aktiv. Der Button startet den Countdown, zeigt die Kamera und sendet das Bild zur Evaluation."
                  : "Session läuft gerade, bitte warten."}
            </p>
          </div>

          {showCamera ? (
            <div className="accessCameraFrame">
              <video ref={videoRef} className="accessCameraVideo" autoPlay playsInline muted />
              <div className="accessCameraOverlay">
                <div className="accessCameraBadge">LIVE</div>
                <div className="accessCameraCopy">Du wirst gefilmt</div>
                {countdown ? <div className="accessCountdown">{countdown}</div> : null}
              </div>
            </div>
          ) : null}

          <div className="panel accessStatusPanel">
            <p>Mode: {roomState?.mode ?? "..."}</p>
            <p>Door: {roomState?.doorStatus ?? "..."}</p>
            <p>Active Session: {activeSessionId ?? "none"}</p>
          </div>

          {phase === "success" ? (
            <div className="panel accessResultCard accessResultSuccess">
              <h2>Glückwunsch</h2>
              <p>Du hast die Prüfung erfolgreich bestanden.</p>
            </div>
          ) : null}

          {phase === "failed" ? (
            <div className="panel accessResultCard accessResultFailed">
              <h2>Kein Zutritt</h2>
              <p>Der Versuch war nicht erfolgreich. Die Station schaltet wieder auf Closed.</p>
            </div>
          ) : null}

          {phase === "idle" && sessionIsReady ? (
            <div className="accessActions">
              <button className="accessSolveButton" onClick={solve} disabled={busy || !sessionIsReady}>
                lösen
              </button>
            </div>
          ) : null}

          <p className="accessStatus">{status}</p>
        </div>
      )}
    </div>
  );
}

function InnerDisplayPage() {
  const [data, setData] = useState<InnerDisplayData | null>(null);

  const load = async () => {
    const response = await api.innerDisplay();
    setData(response.data as InnerDisplayData);
  };

  useEffect(() => {
    load().catch(console.error);
    socket.on("room.state.changed", load);
    socket.on("pricing.updated", load);
    return () => {
      socket.off("room.state.changed", load);
      socket.off("pricing.updated", load);
    };
  }, []);

  return (
    <div className="screen inner">
      <h1>Inner Room Display</h1>
      {data?.mode === ROOM_MODE.VERIFICATION && data.task ? (
        <div className="panel highlight">
          <h2>Current Social Cue</h2>
          <p>{data.task.instructionInner}</p>
        </div>
      ) : (
        <div className="panel">
          <h2>Drinks</h2>
          <p className="muted">Occupancy: {data?.pricing?.occupancy ?? 0}</p>
          <ul>
            {(data?.pricing?.drinks ?? []).map((d) => (
              <li key={d.drinkId}>
                {d.name}: Outside {d.outerPrice.toFixed(2)} | Inner {d.innerPrice.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TrafficLightPage() {
  const { roomState } = useRoomState();
  const green = roomState?.mode === ROOM_MODE.OPEN;
  return (
    <div className={`traffic ${green ? "green" : "red"}`}>
      <div className="trafficText">{green ? "OPEN" : "STOP"}</div>
    </div>
  );
}

function OperatorPage() {
  const { roomState, reload } = useRoomState();
  const [devices, setDevices] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [overrideStatus, setOverrideStatus] = useState<string>("");

  const load = async () => {
    const [dev, s, l] = await Promise.all([api.operator.devices(), api.operator.sessions(), api.operator.auditLogs()]);
    setDevices(dev.data as any[]);
    setSessions(s.data as any[]);
    setLogs(l.data as any[]);
  };

  useEffect(() => {
    load().catch(console.error);
    const onChange = () => {
      load().catch(console.error);
      reload().catch(console.error);
    };
    socket.on("room.state.changed", onChange);
    socket.on("operator.audit.logged", onChange);
    return () => {
      socket.off("room.state.changed", onChange);
      socket.off("operator.audit.logged", onChange);
    };
  }, []);

  const activeSession = useMemo(() => sessions.find((s) => s.id === roomState?.activeSessionId) ?? null, [sessions, roomState]);

  const override = async (action: "PASS" | "FAIL" | "OPEN_DOOR" | "BLOCK" | "RESET") => {
    const reason = prompt(`Reason for ${action}`) || "operator-action";
    try {
      await api.operator.override({ action, reason, sessionId: roomState?.activeSessionId || undefined });
      setOverrideStatus(`Override ${action} erfolgreich.`);
      await load();
      await reload();
    } catch {
      setOverrideStatus(`Override ${action} fehlgeschlagen.`);
    }
  };

  const startSessionFromOperator = async () => {
    try {
      await api.createSession("operator-buzzer");
      setOverrideStatus("Session via Buzzer-Button gestartet.");
      await load();
      await reload();
    } catch {
      setOverrideStatus("Session-Start nicht moeglich (vermutlich nicht in CLOSED).");
    }
  };

  const adjustOccupancy = async () => {
    const delta = Number(prompt("Occupancy delta (+/- int)", "1"));
    const reason = prompt("Reason", "manual-correction") || "manual-correction";
    if (!Number.isInteger(delta)) return;
    await api.operator.occupancyAdjust(delta, reason);
    await load();
    await reload();
  };

  return (
    <div className="screen operator">
      <h1>Operator Control Center</h1>
      <OperatorNav />
      <div className="grid">
        <section className="panel">
          <h2>Live Room</h2>
          <p>Mode: {roomState?.mode}</p>
          <p>Door: {roomState?.doorStatus}</p>
          <p>Occupancy: {roomState?.occupancyCount}</p>
          <p>Open Until: {roomState?.openUntil ?? "-"}</p>
          <p>Evaluation Deadline: {roomState?.evaluationDeadline ?? "-"}</p>
          <p>Active Session: {roomState?.activeSessionId ?? "none"}</p>
        </section>

        <section className="panel">
          <h2>Overrides</h2>
          {overrideStatus ? <p>{overrideStatus}</p> : null}
          <div className="buttons">
            <button onClick={startSessionFromOperator} disabled={roomState?.mode !== ROOM_MODE.CLOSED}>
              Buzzer / Start Session
            </button>
            <button onClick={() => override("PASS")}>Manual Pass</button>
            <button onClick={() => override("FAIL")}>Manual Fail</button>
            <button onClick={() => override("OPEN_DOOR")}>Force Open Door</button>
            <button onClick={() => override("BLOCK")}>Block System</button>
            <button onClick={() => override("RESET")}>Reset to Closed</button>
            <button onClick={adjustOccupancy}>Adjust Occupancy</button>
          </div>
        </section>

        <section className="panel">
          <h2>Current Session</h2>
          <pre>{JSON.stringify(activeSession, null, 2)}</pre>
        </section>

        <section className="panel">
          <h2>Devices ({devices.length})</h2>
          <pre>{JSON.stringify(devices.slice(0, 8), null, 2)}</pre>
        </section>

        <section className="panel">
          <h2>Recent Sessions</h2>
          <pre>{JSON.stringify(sessions.slice(0, 5), null, 2)}</pre>
        </section>

        <section className="panel full">
          <h2>Audit Timeline</h2>
          <pre>{JSON.stringify(logs.slice(0, 20), null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}

function OperatorDrinksPage() {
  const [drinks, setDrinks] = useState<any[]>([]);
  const [drinkEditors, setDrinkEditors] = useState<Record<string, DrinkEditorState>>({});
  const [newDrink, setNewDrink] = useState<DrinkEditorState>({
    name: "",
    active: true,
    basePriceOuter: 0,
    pricingRuleId: ""
  });
  const [drinkStatus, setDrinkStatus] = useState<string>("");
  const [rules, setRules] = useState<any[]>([]);
  const [ruleEditors, setRuleEditors] = useState<Record<string, PricingRuleEditorState>>({});
  const [newRule, setNewRule] = useState<PricingRuleEditorState>({
    name: "",
    active: true,
    configText: JSON.stringify(
      {
        ranges: [
          { max: 10, multiplier: 0.8 },
          { min: 11, max: 20, multiplier: 1.0 },
          { min: 21, multiplier: 1.3 }
        ]
      },
      null,
      2
    )
  });
  const [ruleStatus, setRuleStatus] = useState<string>("");

  const load = async () => {
    const [d, r] = await Promise.all([api.operator.drinks(), api.operator.pricingRules()]);
    setDrinks(d.data as any[]);
    setDrinkEditors(Object.fromEntries((d.data as any[]).map((drink) => [drink.id, toDrinkEditorState(drink)])));
    setRules(r.data as any[]);
    setRuleEditors(Object.fromEntries((r.data as any[]).map((rule) => [rule.id, toPricingRuleEditorState(rule)])));
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const updateDrinkField = <K extends keyof DrinkEditorState>(drinkId: string, field: K, value: DrinkEditorState[K]) => {
    setDrinkEditors((prev) => ({
      ...prev,
      [drinkId]: {
        ...prev[drinkId],
        [field]: value
      }
    }));
  };

  const updateNewDrinkField = <K extends keyof DrinkEditorState>(field: K, value: DrinkEditorState[K]) => {
    setNewDrink((prev) => ({ ...prev, [field]: value }));
  };

  const saveDrink = async (drinkId: string) => {
    const draft = drinkEditors[drinkId];
    if (!draft) return;
    if (!draft.name.trim()) {
      setDrinkStatus("Bitte Drink-Name ausfuellen.");
      return;
    }

    await api.operator.updateDrink(drinkId, {
      name: draft.name,
      active: draft.active,
      basePriceOuter: draft.basePriceOuter,
      pricingRuleId: draft.pricingRuleId || null
    });
    setDrinkStatus(`Drink ${drinkId} gespeichert.`);
    await load();
  };

  const deleteDrink = async (drinkId: string) => {
    await api.operator.deleteDrink(drinkId);
    setDrinkStatus(`Drink ${drinkId} gelöscht.`);
    await load();
  };

  const createDrink = async () => {
    if (!newDrink.name.trim()) {
      setDrinkStatus("Neue Drink: Bitte Name ausfuellen.");
      return;
    }

    await api.operator.createDrink({
      name: newDrink.name,
      active: newDrink.active,
      basePriceOuter: newDrink.basePriceOuter,
      pricingRuleId: newDrink.pricingRuleId || null
    });

    setNewDrink({
      name: "",
      active: true,
      basePriceOuter: 0,
      pricingRuleId: ""
    });
    setDrinkStatus("Neuer Drink angelegt.");
    await load();
  };

  const updateRuleField = <K extends keyof PricingRuleEditorState>(ruleId: string, field: K, value: PricingRuleEditorState[K]) => {
    setRuleEditors((prev) => ({
      ...prev,
      [ruleId]: {
        ...prev[ruleId],
        [field]: value
      }
    }));
  };

  const updateNewRuleField = <K extends keyof PricingRuleEditorState>(field: K, value: PricingRuleEditorState[K]) => {
    setNewRule((prev) => ({ ...prev, [field]: value }));
  };

  const saveRule = async (ruleId: string) => {
    const draft = ruleEditors[ruleId];
    if (!draft) return;

    let parsedConfig;
    try {
      parsedConfig = JSON.parse(draft.configText);
    } catch {
      setRuleStatus("Pricing Rule: config muss valides JSON sein.");
      return;
    }

    if (!draft.name.trim()) {
      setRuleStatus("Pricing Rule: Name fehlt.");
      return;
    }

    await api.operator.updatePricingRule(ruleId, {
      name: draft.name,
      active: draft.active,
      config: parsedConfig
    });
    setRuleStatus(`Pricing Rule ${ruleId} gespeichert.`);
    await load();
  };

  const createRule = async () => {
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(newRule.configText);
    } catch {
      setRuleStatus("Neue Pricing Rule: config muss valides JSON sein.");
      return;
    }

    if (!newRule.name.trim()) {
      setRuleStatus("Neue Pricing Rule: Name fehlt.");
      return;
    }

    await api.operator.createPricingRule({
      name: newRule.name,
      active: newRule.active,
      config: parsedConfig
    });
    setRuleStatus("Neue Pricing Rule angelegt.");
    setNewRule({
      name: "",
      active: true,
      configText: JSON.stringify(
        {
          ranges: [
            { max: 10, multiplier: 0.8 },
            { min: 11, max: 20, multiplier: 1.0 },
            { min: 21, multiplier: 1.3 }
          ]
        },
        null,
        2
      )
    });
    await load();
  };

  return (
    <div className="screen operator">
      <h1>Drinks & Pricing</h1>
      <OperatorNav />

      <section className="panel">
        <h2>Drinks ({drinks.length})</h2>
        <p className="muted">Jeder Drink hat einen Outer-Preis; der Inner-Preis wird dynamisch aus der Regel berechnet.</p>
        {drinkStatus ? <p>{drinkStatus}</p> : null}

        <div className="taskList">
          {drinks.map((drink) => {
            const editor = drinkEditors[drink.id] ?? toDrinkEditorState(drink);
            return (
              <div key={drink.id} className="taskCard">
                <div className="taskRow">
                  <label>Name</label>
                  <input value={editor.name} onChange={(e) => updateDrinkField(drink.id, "name", e.target.value)} />
                </div>

                <div className="taskRowSplit">
                  <div className="taskRow">
                    <label>Outer Base Price</label>
                    <input type="number" step="0.01" min={0} value={editor.basePriceOuter} onChange={(e) => updateDrinkField(drink.id, "basePriceOuter", Number(e.target.value || 0))} />
                  </div>
                  <div className="taskRow">
                    <label>Inner Price</label>
                    <input value="Wird aus Outer + Rule berechnet" readOnly />
                  </div>
                  <div className="taskRow taskCheckboxRow">
                    <label>Active</label>
                    <input type="checkbox" checked={editor.active} onChange={(e) => updateDrinkField(drink.id, "active", e.target.checked)} />
                  </div>
                </div>

                <div className="taskRow">
                  <label>Pricing Rule</label>
                  <select value={editor.pricingRuleId} onChange={(e) => updateDrinkField(drink.id, "pricingRuleId", e.target.value)}>
                    <option value="">Keine</option>
                    {rules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="buttons">
                  <button onClick={() => saveDrink(drink.id)}>Save</button>
                  <button onClick={() => deleteDrink(drink.id)}>Löschen</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="taskCreateBlock">
          <h3>Neuen Drink anlegen</h3>
          <div className="taskRow">
            <label>Name</label>
            <input value={newDrink.name} onChange={(e) => updateNewDrinkField("name", e.target.value)} />
          </div>

          <div className="taskRowSplit">
            <div className="taskRow">
              <label>Outer Base Price</label>
              <input type="number" step="0.01" min={0} value={newDrink.basePriceOuter} onChange={(e) => updateNewDrinkField("basePriceOuter", Number(e.target.value || 0))} />
            </div>
            <div className="taskRow">
              <label>Inner Price</label>
              <input value="Wird aus Outer + Rule berechnet" readOnly />
            </div>
            <div className="taskRow taskCheckboxRow">
              <label>Active</label>
              <input type="checkbox" checked={newDrink.active} onChange={(e) => updateNewDrinkField("active", e.target.checked)} />
            </div>
          </div>

          <div className="taskRow">
            <label>Pricing Rule</label>
            <select value={newDrink.pricingRuleId} onChange={(e) => updateNewDrinkField("pricingRuleId", e.target.value)}>
              <option value="">Keine</option>
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </select>
          </div>

          <button onClick={createDrink}>Create Drink</button>
        </div>
      </section>

      <section className="panel">
        <h2>Pricing Rules ({rules.length})</h2>
        {ruleStatus ? <p>{ruleStatus}</p> : null}

        <div className="taskList">
          {rules.map((rule) => {
            const editor = ruleEditors[rule.id] ?? toPricingRuleEditorState(rule);
            return (
              <div key={rule.id} className="taskCard">
                <div className="taskRow">
                  <label>Name</label>
                  <input value={editor.name} onChange={(e) => updateRuleField(rule.id, "name", e.target.value)} />
                </div>

                <div className="taskRow">
                  <label>Config JSON</label>
                  <textarea rows={8} value={editor.configText} onChange={(e) => updateRuleField(rule.id, "configText", e.target.value)} />
                </div>

                <div className="taskRow taskCheckboxRow">
                  <label>Active</label>
                  <input type="checkbox" checked={editor.active} onChange={(e) => updateRuleField(rule.id, "active", e.target.checked)} />
                </div>

                <div className="buttons">
                  <button onClick={() => saveRule(rule.id)}>Save</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="taskCreateBlock">
          <h3>Neue Pricing Rule anlegen</h3>
          <div className="taskRow">
            <label>Name</label>
            <input value={newRule.name} onChange={(e) => updateNewRuleField("name", e.target.value)} />
          </div>
          <div className="taskRow">
            <label>Config JSON</label>
            <textarea rows={8} value={newRule.configText} onChange={(e) => updateNewRuleField("configText", e.target.value)} />
          </div>
          <div className="taskRow taskCheckboxRow">
            <label>Active</label>
            <input type="checkbox" checked={newRule.active} onChange={(e) => updateNewRuleField("active", e.target.checked)} />
          </div>
          <button onClick={createRule}>Create Pricing Rule</button>
        </div>
      </section>
    </div>
  );
}

function OperatorTasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskEditors, setTaskEditors] = useState<Record<string, TaskEditorState>>({});
  const [newTask, setNewTask] = useState<TaskEditorState>({
    name: "",
    category: "",
    instructionInner: "",
    evaluationPrompt: "",
    active: true,
    difficulty: 1,
    version: 1
  });
  const [taskStatus, setTaskStatus] = useState<string>("");

  const load = async () => {
    const response = await api.operator.tasks();
    const activeTasks = (response.data as any[]).filter((task) => task.active !== false);
    setTasks(activeTasks);
    setTaskEditors(Object.fromEntries(activeTasks.map((task) => [task.id, toTaskEditorState(task)])));
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const updateTaskField = <K extends keyof TaskEditorState>(taskId: string, field: K, value: TaskEditorState[K]) => {
    setTaskEditors((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [field]: value
      }
    }));
  };

  const updateNewTaskField = <K extends keyof TaskEditorState>(field: K, value: TaskEditorState[K]) => {
    setNewTask((prev) => ({ ...prev, [field]: value }));
  };

  const saveTask = async (taskId: string) => {
    const draft = taskEditors[taskId];
    if (!draft) return;
    if (!draft.name.trim() || !draft.category.trim() || !draft.instructionInner.trim() || !draft.evaluationPrompt.trim()) {
      setTaskStatus("Bitte alle Pflichtfelder ausfuellen (Name, Kategorie, Instruction, Evaluation Prompt).");
      return;
    }

    await api.operator.updateTask(taskId, {
      name: draft.name,
      category: draft.category,
      instructionInner: draft.instructionInner,
      evaluationPrompt: draft.evaluationPrompt,
      active: draft.active,
      difficulty: draft.difficulty,
      version: draft.version
    });
    setTaskStatus(`Task ${taskId} gespeichert.`);
    await load();
  };

  const deleteTask = async (taskId: string) => {
    await api.operator.deleteTask(taskId);
    setTaskStatus(`Task ${taskId} gelöscht.`);
    await load();
  };

  const createTask = async () => {
    if (!newTask.name.trim() || !newTask.category.trim() || !newTask.instructionInner.trim() || !newTask.evaluationPrompt.trim()) {
      setTaskStatus("Neue Task: Bitte alle Pflichtfelder ausfuellen.");
      return;
    }

    await api.operator.createTask({
      name: newTask.name,
      category: newTask.category,
      instructionInner: newTask.instructionInner,
      evaluationPrompt: newTask.evaluationPrompt,
      active: newTask.active,
      difficulty: newTask.difficulty,
      version: newTask.version
    });

    setNewTask({
      name: "",
      category: "",
      instructionInner: "",
      evaluationPrompt: "",
      active: true,
      difficulty: 1,
      version: 1
    });
    setTaskStatus("Neue Task angelegt.");
    await load();
  };

  return (
    <div className="screen operator">
      <h1>Task Management</h1>
      <OperatorNav />
      {taskStatus ? <div className="panel">{taskStatus}</div> : null}

      <section className="panel">
        <h2>Existing Tasks ({tasks.length})</h2>
        <div className="taskList">
          {tasks.map((task) => {
            const editor = taskEditors[task.id] ?? toTaskEditorState(task);
            return (
              <div key={task.id} className="taskCard">
                <div className="taskRow">
                  <label>Name</label>
                  <input value={editor.name} onChange={(e) => updateTaskField(task.id, "name", e.target.value)} />
                </div>

                <div className="taskRow">
                  <label>Kategorie</label>
                  <input value={editor.category} onChange={(e) => updateTaskField(task.id, "category", e.target.value)} />
                </div>

                <div className="taskRow">
                  <label>Instruction Inner</label>
                  <textarea rows={3} value={editor.instructionInner} onChange={(e) => updateTaskField(task.id, "instructionInner", e.target.value)} />
                </div>

                <div className="taskRow">
                  <label>Evaluation Prompt</label>
                  <textarea rows={4} value={editor.evaluationPrompt} onChange={(e) => updateTaskField(task.id, "evaluationPrompt", e.target.value)} />
                </div>

                <div className="taskRowSplit">
                  <div className="taskRow">
                    <label>Difficulty</label>
                    <input type="number" min={1} value={editor.difficulty} onChange={(e) => updateTaskField(task.id, "difficulty", Number(e.target.value || 1))} />
                  </div>
                  <div className="taskRow">
                    <label>Version</label>
                    <input type="number" min={1} value={editor.version} onChange={(e) => updateTaskField(task.id, "version", Number(e.target.value || 1))} />
                  </div>
                  <div className="taskRow taskCheckboxRow">
                    <label>Active</label>
                    <input type="checkbox" checked={editor.active} onChange={(e) => updateTaskField(task.id, "active", e.target.checked)} />
                  </div>
                </div>

                <div className="buttons">
                  <button onClick={() => saveTask(task.id)}>Save</button>
                  <button onClick={() => deleteTask(task.id)}>Löschen</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Neue Task anlegen</h2>
        <div className="taskRow">
          <label>Name</label>
          <input value={newTask.name} onChange={(e) => updateNewTaskField("name", e.target.value)} />
        </div>
        <div className="taskRow">
          <label>Kategorie</label>
          <input value={newTask.category} onChange={(e) => updateNewTaskField("category", e.target.value)} />
        </div>
        <div className="taskRow">
          <label>Instruction Inner</label>
          <textarea rows={3} value={newTask.instructionInner} onChange={(e) => updateNewTaskField("instructionInner", e.target.value)} />
        </div>
        <div className="taskRow">
          <label>Evaluation Prompt</label>
          <textarea rows={4} value={newTask.evaluationPrompt} onChange={(e) => updateNewTaskField("evaluationPrompt", e.target.value)} />
        </div>

        <div className="taskRowSplit">
          <div className="taskRow">
            <label>Difficulty</label>
            <input type="number" min={1} value={newTask.difficulty} onChange={(e) => updateNewTaskField("difficulty", Number(e.target.value || 1))} />
          </div>
          <div className="taskRow">
            <label>Version</label>
            <input type="number" min={1} value={newTask.version} onChange={(e) => updateNewTaskField("version", Number(e.target.value || 1))} />
          </div>
          <div className="taskRow taskCheckboxRow">
            <label>Active</label>
            <input type="checkbox" checked={newTask.active} onChange={(e) => updateNewTaskField("active", e.target.checked)} />
          </div>
        </div>

        <button onClick={createTask}>Create Task</button>
      </section>
    </div>
  );
}

function Home() {
  return (
    <div className="screen">
      <h1>Inner Circle MVP</h1>
      <div className="panel nav">
        <Link to="/access">/access</Link>
        <Link to="/inner-display">/inner-display</Link>
        <Link to="/traffic-light">/traffic-light</Link>
        <Link to="/operator">/operator</Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/access" element={<AccessPage />} />
      <Route path="/inner-display" element={<InnerDisplayPage />} />
      <Route path="/traffic-light" element={<TrafficLightPage />} />
      <Route path="/operator" element={<OperatorPage />} />
      <Route path="/operator/tasks" element={<OperatorTasksPage />} />
      <Route path="/operator/drinks" element={<OperatorDrinksPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
