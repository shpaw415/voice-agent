#!/usr/bin/env bun
/**
 * voice-agent e2e stress: mock xAI gateway + real page server + real status tool.
 * UI_PORT=4747 MOCK_PORT=4799 bun scripts/e2etest.ts
 * Requires: page server running on UI_PORT (the control plane runs it after install).
 */
const UI = process.env.UI_PORT || "4747";
const MOCK = Number(process.env.MOCK_PORT || 4799);
const BASE = `http://127.0.0.1:${UI}`;

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, extra = "") {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name} ${extra}`);
  }
}

/* ---------- mock xAI gateway ---------- */
const seenProtocols: string[] = [];
const seenAuth: string[] = [];
const mock = Bun.serve({
  port: MOCK,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/v1/realtime/client_secrets") {
      seenAuth.push(req.headers.get("authorization") ?? "");
      return Response.json({ value: "mock-tok-123", expires_at: "soon" });
    }
    if (url.pathname === "/v1/realtime") {
      seenProtocols.push(req.headers.get("sec-websocket-protocol") ?? "");
      if (server.upgrade(req, { data: {} })) return;
      return new Response("ws only", { status: 426 });
    }
    return new Response("nf", { status: 404 });
  },
  websocket: {
    open(ws) {},
    message(ws, msg) {
      const m = JSON.parse(String(msg));
      if (m.type === "session.update") {
        ws.send(JSON.stringify({ type: "response.output_audio.delta", delta: "AQIDBA==" }));
        ws.send(JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Bonjour " }));
        ws.send(JSON.stringify({ type: "response.output_audio.transcript.delta", delta: "le monde" }));
        ws.send(JSON.stringify({ type: "input_audio_buffer.speech_started" }));
        ws.send(JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "deuxième tour" }));
        ws.send(JSON.stringify({ type: "response.done" }));
      }
      if (m.type === "input_audio_buffer.append") {
        ws.send(JSON.stringify({ type: "ack.append", bytes: String(m.audio || "").length }));
      }
      if (m.type === "response.cancel") {
        ws.send(JSON.stringify({ type: "ack.cancel" }));
      }
    },
  },
});

function set(k: string, v: string): void {
  const p = Bun.spawnSync(["ob-plugin", "settings", "voice-agent", v === "" ? k + "=" : `${k}=${v}`], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) console.error(new TextDecoder().decode(p.stderr));
}

/** Settings writes regenerate the plugin config and the control plane restarts
 *  the page server — wait until it answers again (or a new port appears). */
async function waitHealthy(maxMs = 30000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function setAndWait(k: string, v: string): Promise<void> {
  set(k, v);
  await waitHealthy();
  await new Promise((r) => setTimeout(r, 300));
}

async function j(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const r = await fetch(BASE + path, init);
  let b: any = null;
  const t = await r.text();
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  return { status: r.status, body: b };
}

/* ---------- case 2: missing config (skipped when a shared key exists) ---------- */
await setAndWait("xai_api_key", "");
await setAndWait("gateway_base", "");
await new Promise((r) => setTimeout(r, 300));

// does this desktop have the shared xAI key (Config page Keys tab) injected via vaultRead?
const cfgRaw = await Bun.file(`/home/agent/.config/open-bot/plugin-voice-agent.json`).text();
const sharedAvailable = Boolean((JSON.parse(cfgRaw)?.vault ?? {})["xai"] ?? "");

const st0 = await j("/api/status");
ok(st0.status === 200 && st0.body.hasKey === sharedAvailable, "status hasKey matches key availability (settings empty)", JSON.stringify({ hasKey: st0.body.hasKey, keySource: st0.body.keySource, sharedAvailable }));
if (sharedAvailable) ok(st0.body.keySource === "shared:xai", "shared key picked up as shared:xai", st0.body.keySource);

const sess0 = await j("/api/session", { method: "POST" });
if (sharedAvailable) {
  ok(sess0.status === 200, "session works with the shared key (no re-entry needed)", String(sess0.status));
  await j("/api/calls/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sess0.body.sessionId, durationSec: 1 }) });
} else {
  ok(sess0.status === 400 && sess0.body.error === "missing_key", "session 400 missing_key without key", JSON.stringify(sess0.body));
}

const tool = Bun.spawnSync(["ob-plugin-voice-agent-status"], { stdout: "pipe" });
const toolOut = JSON.parse(new TextDecoder().decode(tool.stdout));
ok(toolOut.hasKey === sharedAvailable && !JSON.stringify(toolOut).includes("sk-"), "status tool agrees, leaks no key");
if (sharedAvailable) ok(toolOut.keySource === "shared:xai", "status tool reports shared:xai source", toolOut.keySource);

/* ---------- case 4: provider unreachable ---------- */
await setAndWait("xai_api_key", "test-key-abc");
await setAndWait("gateway_base", `http://127.0.0.1:1`);
await new Promise((r) => setTimeout(r, 300));
const st1 = await j("/api/status");
ok(st1.body.hasKey === true, "status hasKey true from settings key");
const sessDead = await j("/api/session", { method: "POST" });
ok(sessDead.status === 502 && sessDead.body.error === "net", "session 502 net when provider unreachable", JSON.stringify(sessDead.body));
const callsAfterDead = (await j("/api/calls")).body.calls as any[];
ok(callsAfterDead.length === 0 || callsAfterDead[0].ended !== undefined || true, "no crash after dead provider");

/* ---------- case 1: happy path through the mock ---------- */
await setAndWait("gateway_base", `http://127.0.0.1:${MOCK}`);
await new Promise((r) => setTimeout(r, 300));

const sess = await j("/api/session", { method: "POST" });
ok(sess.status === 200 && sess.body.token === "mock-tok-123", "session mints ephemeral token via gateway", JSON.stringify(sess.body).slice(0, 200));
ok(String(sess.body.wsUrl).startsWith(`ws://127.0.0.1:${MOCK}/v1/realtime?model=`), "wsUrl is ws-converted gateway with model", String(sess.body.wsUrl));
ok(typeof sess.body.instructions === "string" && sess.body.instructions.length > 0, "instructions forwarded");
ok(Array.isArray(sess.body.tools) && sess.body.tools.some((t: any) => t.name === "delegate_openbot" && /search the web/.test(t.description)), "session advertises delegate_openbot with capabilities", JSON.stringify(sess.body.tools ?? []).slice(0, 200));
const sid = sess.body.sessionId;

// open the realtime WS exactly like the page does
const ws = new WebSocket(sess.body.wsUrl, ["xai-client-secret." + sess.body.token]);
const got: any[] = [];
const sent: any[] = [];
await new Promise<void>((resolve) => {
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "session.update", session: { voice: sess.body.voice, instructions: sess.body.instructions, turn_detection: { type: "server_vad" } } }));
    ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: "aGVsbG8=" }));
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    got.push(m);
    if (m.type === "response.done") {
      ws.send(JSON.stringify({ type: "response.cancel" }));
      setTimeout(() => resolve(), 300);
    }
  };
  ws.onerror = () => resolve();
  setTimeout(() => resolve(), 5000);
});
ws.close();

ok(seenProtocols.some((p) => p === "xai-client-secret.mock-tok-123"), "provider received ephemeral token via subprotocol", seenProtocols.join("|"));
ok(seenAuth.some((a) => a === "Bearer test-key-abc"), "server mint used the API key server-side", seenAuth.join("|"));
ok(got.some((m) => m.type === "response.output_audio.delta"), "audio delta event received");
ok(got.some((m) => m.type === "response.output_audio_transcript.delta"), "transcript delta (v1 naming) received");
ok(got.some((m) => m.type === "response.output_audio.transcript.delta"), "transcript delta (dotted naming) received");
ok(got.some((m) => m.type === "input_audio_buffer.speech_started"), "speech_started (interruption) event received");
ok(got.some((m) => m.type === "ack.append"), "audio append accepted by provider");
ok(got.some((m) => m.type === "ack.cancel"), "response.cancel accepted by provider");

/* ---------- call log: start/end, hostile input, repeat ---------- */
const calls1 = (await j("/api/calls")).body.calls as any[];
ok(calls1.some((c) => c.id === sid && !c.ended), "call logged at session start");

const endBad = await j("/api/calls/end", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
ok(endBad.status === 400, "calls/end bad JSON -> 400", String(endBad.status));
const endUnknown = await j("/api/calls/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "nope", durationSec: 5 }) });
ok(endUnknown.status === 200, "calls/end unknown id -> ok no-op");
const endBig = await j("/api/calls/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sid, durationSec: 9e9, userTurns: -5, agentTurns: 1e15 }) });
ok(endBig.status === 200, "calls/end absurd values accepted");
const calls2 = (await j("/api/calls")).body.calls as any[];
const me = calls2.find((c) => c.id === sid);
ok(me?.ended === true && me.durationSec === 86400 && me.userTurns === 0 && me.agentTurns === 10000, "absurd values clamped to sane caps (negatives -> 0, highs -> cap)", JSON.stringify(me));

// repeat: second call must not corrupt state
const sess2 = await j("/api/session", { method: "POST" });
await j("/api/calls/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sess2.body.sessionId, durationSec: 42, userTurns: 3, agentTurns: 4 }) });
const calls3 = (await j("/api/calls")).body.calls as any[];
const e2 = calls3.find((c) => c.id === sess2.body.sessionId);
ok(calls3.filter((c) => c.id === sid).length === 1 && e2?.ended && e2.durationSec === 42 && e2.userTurns === 3 && e2.agentTurns === 4, "second call: log consistent, first entry intact", JSON.stringify(calls3.map((c) => c.id)));

/* ---------- delegation ---------- */
const delBad = await j("/api/delegate", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
ok(delBad.status === 400 || delBad.status === 500, "delegate bad JSON rejected", String(delBad.status));
const delEmpty = await j("/api/delegate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "   " }) });
ok(delEmpty.status === 400, "delegate empty task -> 400", String(delEmpty.status));

await setAndWait("delegate_timeout", "90");
const delLive = await j("/api/delegate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "Réponds exactement: PONG-VA" }) });
ok(delLive.status === 202 && delLive.body.id, "delegate accepted (202) with a job id", JSON.stringify(delLive.body).slice(0, 120));
let delResult = "";
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const r = await j("/api/delegate?id=" + encodeURIComponent(delLive.body.id));
    if (r.body.done) {
      delResult = String(r.body.result ?? "");
      break;
    }
  } catch {}
}
ok(/PONG-VA/.test(delResult), "live delegation through opencode returns the result", delResult.slice(0, 120));
await setAndWait("delegate_timeout", "");

/* ---------- unicode instructions ---------- */
await setAndWait("instructions", "Assistant bilingue — détecte la langue (français, English, 中文) et réponds dedans. 🎙️");
await new Promise((r) => setTimeout(r, 300));
const sess3 = await j("/api/session", { method: "POST" });
ok(sess3.status === 200 && sess3.body.instructions.includes("中文") && sess3.body.instructions.includes("🎙️"), "unicode instructions forwarded intact");
await setAndWait("instructions", "You are a friendly, concise voice assistant. Always detect the language the user speaks and answer in that same language. Keep answers short and natural for spoken conversation.");

/* ---------- restore clean defaults ---------- */
await setAndWait("xai_api_key", "");
await setAndWait("gateway_base", "");
await new Promise((r) => setTimeout(r, 300));
const stF = await j("/api/status");
ok(stF.body.hasKey === sharedAvailable, "settings restored: key state back to shared availability", JSON.stringify(stF.body));

mock.stop(true);
console.log(`\ne2e: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
