#!/usr/bin/env bun
/**
 * voice-agent UI stress: drives the real page HTML in happy-dom with stubbed
 * mic/WebSocket/AudioContext. UI_PORT=4745 bun scripts/uitest.ts
 * (run from a directory with happy-dom installed; see README in this folder).
 */
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";

const UI = process.env.UI_PORT || "4747";
const BASE = `http://127.0.0.1:${UI}`;

// The page app lives in server/app.ts since the 2026-10-16 UI split; the page
// server serves it bundled. The harness runs the same source transpiled.
const APP_SRC = new Bun.Transpiler({ loader: "ts" }).transformSync(
  readFileSync(new URL("../server/app.ts", import.meta.url), "utf8"),
);

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
const tick = () => new Promise((r) => setTimeout(r, 15));

const S: any = { ends: [], sessionCalls: [] };

function boot(lang: string) {
  const win = new Window({ url: BASE + "/" });
  const doc = win.document;

  Object.defineProperty(win.navigator, "language", { get: () => lang, configurable: true });
  (win.navigator as any).mediaDevices = {
    getUserMedia: async () => {
      if (S.micReject) {
        const e: any = new Error("mic");
        e.name = S.micReject;
        throw e;
      }
      return { getTracks: () => [] };
    },
  };

  class FakeAC {
    static started: any[] = [];
    static lastSP: any = null;
    sampleRate = 24000;
    currentTime = 0;
    destination = {};
    audioWorklet = {
      addModule: async () => {
        if (S.workletFail) throw new Error("no worklet");
      },
    };
    constructor(_opts?: any) {
      this.sampleRate = S.ctxRate || 24000;
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    createScriptProcessor(_n: number, _i: number, _o: number) {
      const sp = { onaudioprocess: null as any, connect() {} };
      FakeAC.lastSP = sp;
      return sp;
    }
    createGain() {
      return { gain: { value: 1 }, connect() {} };
    }
    createBuffer(_c: number, len: number, rate: number) {
      return { copyToChannel() {}, duration: len / rate };
    }
    createBufferSource() {
      const src: any = {
        buffer: null,
        connect() {},
        start() {
          FakeAC.started.push(src);
          if (src.onended) setTimeout(() => src.onended(), 0);
        },
      };
      return src;
    }
    close = async () => {};
  }
  class FakeWorklet {
    static last: any = null;
    port = { onmessage: null as any, postMessage() {} };
    constructor(_ctx: any, _o: any) {
      FakeWorklet.last = this;
    }
  }
  class FakeWS {
    static instances: any[] = [];
    url: string;
    protocols: string[];
    readyState = 0;
    sent: string[] = [];
    onopen: any = null;
    onmessage: any = null;
    onclose: any = null;
    onerror: any = null;
    constructor(url: string, protocols: string[]) {
      this.url = url;
      this.protocols = protocols;
      FakeWS.instances.push(this);
    }
    send(d: string) {
      this.sent.push(d);
    }
    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose({});
    }
    serverOpen() {
      this.readyState = 1;
      if (this.onopen) this.onopen({});
    }
    serverMsg(m: any) {
      if (this.onmessage) this.onmessage({ data: typeof m === "string" ? m : JSON.stringify(m) });
    }
  }

  win.fetch = ((input: any, init?: any) => {
    const url = String(input);
    const resp = (o: any, status = 200) =>
      Promise.resolve({ ok: status < 400, status, json: async () => o });
    if (url === "api/status") return resp(S.status);
    if (url === "api/calls") return resp({ calls: S.sessionCalls });
    if (url === "api/session") {
      S.sessionFetches = (S.sessionFetches || 0) + 1;
      return resp(S.session, S.sessionStatus ?? 200);
    }
    if (url === "api/calls/end") {
      S.ends.push(JSON.parse(init.body));
      return resp({ ok: true });
    }
    if (url === "api/delegate" && init && init.method === "POST") {
      S.delegates.push(JSON.parse(init.body));
      return resp({ id: "del-" + S.delegates.length }, 202);
    }
    if (url.indexOf("api/delegate?id=") === 0) {
      S.delegatePolls = (S.delegatePolls || 0) + 1;
      return resp(S.delegatePolls >= 2 ? { done: true, result: "PONG" } : { done: false });
    }
    return resp({}, 404);
  }) as any;

  (win as any).AudioContext = FakeAC;
  (win as any).AudioWorkletNode = FakeWorklet;
  (win as any).WebSocket = FakeWS;
  (win as any).URL = { createObjectURL: () => "blob:fake" };

  return { win, doc, FakeAC, FakeWorklet, FakeWS };
}

async function runPage(doc: Document, win: Window) {
  let html = await (await fetch(BASE + "/")).text();
  // Since the directive 2026-10-16 split, the served page references external
  // assets (Bun dev chunks on the local import branch, inline in the frozen UI
  // bundle). happy-dom has no module loader and chokes on external refs while
  // the harness overrides window.URL — drop them and run the app from source.
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, "");
  html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*<\/script>/g, "");
  // drop Bun --hot dev-server bootstraps injected into served HTML (they probe
  // for the dev script element and crash happy-dom's evaluation)
  html = html.replace(/<script>(?:(?!<\/script>)[\s\S])*?<\/script>/g, (m) =>
    /bun:loadData|data-bun-dev-server-script|document\.visibilityState/.test(m) ? "" : m,
  );
  doc.write(html);
  // head scripts from the served page: the theme bootstrap (?theme= handling)
  for (const s of Array.from(doc.querySelectorAll("head script"))) {
    const code = s.textContent ?? "";
    if (code.trim()) new Function("window", "with(window){" + code + "\n}")(win);
  }
  // the app itself: the server bundles server/app.ts verbatim (dev chunk or
  // frozen bundle) — run the same source through Bun's transpiler, last, as on the page.
  new Function("window", "with(window){" + APP_SRC + "\n}")(win);
  await tick();
}

const FR = { ready: "Prêt", setup: "Configuration requise", live: "En ligne", idle: "Appuie pour parler", speak: "L'agent parle", auto: "Auto — mains libres", mic: "Micro refusé", micNone: "Aucun micro détecté" };
const EN = { ready: "Ready", setup: "Setup needed", live: "Live", idle: "Press to start", auto: "Auto — hands-free" };

function resetState() {
  S.ends = [];
  S.sessionFetches = 0;
  S.micReject = null;
  S.workletFail = null;
  S.ctxRate = null;
  S.delegates = [];
  S.delegateResult = null;
  S.sessionCalls = [
    { id: "c1", ts: new Date().toISOString(), durationSec: 61, userTurns: 2, agentTurns: 2, ended: true },
    { id: "c2", ts: new Date().toISOString(), durationSec: 12, userTurns: 1, agentTurns: 1, ended: true },
  ];
  S.status = { plugin: "voice-agent", hasKey: true, provider: "xai", model: "grok-voice-latest", voice: "eve" };
  S.session = {
    sessionId: "sid-1",
    token: "tok",
    wsUrl: "ws://mock/v1/realtime?model=grok-voice-latest",
    voice: "eve",
    instructions: "test prompt",
    tools: [{ type: "function", name: "delegate_openbot", description: "Delegate a task", parameters: { type: "object", properties: { task: { type: "string" } }, required: ["task"] } }],
  };
  S.sessionStatus = 200;
}

/* ---------- case: FR labels + no key ---------- */
resetState();
S.status = { ...S.status, hasKey: false };
{
  const { win, doc } = boot("fr-CA");
  await runPage(doc, win);
  const sub = doc.getElementById("t-sub")!.textContent!;
  ok(sub.includes("Agent vocal temps réel"), "fr labels applied from navigator.language", sub);
  const banner = doc.getElementById("banner")!;
  ok(banner.className.includes("setup") && banner.textContent!.includes(FR.setup), "setup banner when key missing", banner.textContent!);
  ok((doc.getElementById("mic") as HTMLButtonElement).disabled === true, "mic disabled without key");
}

/* ---------- case: EN fallback ---------- */
resetState();
{
  const { win, doc } = boot("en-US");
  await runPage(doc, win);
  ok(doc.getElementById("banner")!.textContent!.includes(EN.ready), "en labels + ready banner with key", doc.getElementById("banner")!.textContent!);
  ok((doc.getElementById("mic") as HTMLButtonElement).disabled === false, "mic enabled with key");
  ok(doc.querySelectorAll("#calls tr").length === 2, "call log rows rendered", String(doc.querySelectorAll("#calls tr").length));
}

/* ---------- case: full call ---------- */
resetState();
{
  const { win, doc, FakeAC, FakeWorklet, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  const mic = doc.getElementById("mic") as HTMLButtonElement;
  const pill = () => doc.getElementById("pill")!.textContent!;

  mic.click();
  await tick();
  ok(FakeWS.instances.length === 1, "connect opens one WebSocket");
  const ws = FakeWS.instances[0];
  ok(ws.url === S.session.wsUrl && ws.protocols[0] === "xai-client-secret.tok", "ws url + ephemeral-token subprotocol", ws.url + " | " + ws.protocols.join(","));

  ws.serverOpen();
  await tick();
  const upd = ws.sent.map((m) => JSON.parse(m)).find((m) => m.type === "session.update");
  ok(upd && upd.session.voice === "eve" && upd.session.instructions === "test prompt" && upd.session.turn_detection.type === "server_vad", "session.update carries voice+instructions+server_vad", JSON.stringify(upd));
  ok(Array.isArray(upd.session.tools) && upd.session.tools[0].name === "delegate_openbot", "session.update carries the delegation tool", JSON.stringify(upd.session.tools));
  ok(pill().includes(FR.live), "live pill after open", pill());

  ws.serverMsg({ type: "response.output_audio_transcript.delta", delta: "Bonjour " });
  ws.serverMsg({ type: "response.output_audio.transcript.delta", delta: "le monde" });
  await tick();
  let agents = doc.querySelectorAll(".msg.agent");
  ok(agents.length === 1 && agents[0].textContent!.includes("Bonjour le monde"), "transcript deltas join one agent bubble", agents[0]?.textContent ?? "none");

  ws.serverMsg({ type: "response.output_audio.delta", delta: "AQIDBA==" });
  await tick();
  ok(FakeAC.started.length >= 1, "audio delta scheduled for playback");

  ws.serverMsg({ type: "input_audio_buffer.speech_started" });
  await tick();
  ok(ws.sent.map((m) => JSON.parse(m)).some((m) => m.type === "response.cancel"), "interruption sends response.cancel");

  ws.serverMsg({ type: "response.done" });
  ws.serverMsg({ type: "response.output_audio_transcript.delta", delta: "Deuxième tour" });
  await tick();
  agents = doc.querySelectorAll(".msg.agent");
  ok(agents.length === 2 && agents[1].textContent!.includes("Deuxième tour"), "post-done delta starts a new bubble", String(agents.length));

  ws.serverMsg({ type: "conversation.item.input_audio_transcription.completed", transcript: "Salut, ça va?" });
  await tick();
  const users = doc.querySelectorAll(".msg.user");
  ok(users.length === 1 && users[0].textContent!.includes("Salut, ça va?"), "user transcript bubble", users[0]?.textContent ?? "none");

  ws.serverMsg({ type: "error", error: { message: "boom" } });
  await tick();
  ok(doc.getElementById("banner")!.className.includes("err"), "provider error shown in banner");

  FakeWorklet.last.port.onmessage({ data: new Float32Array(2048) });
  await tick();
  const appends = ws.sent.map((m) => JSON.parse(m)).filter((m) => m.type === "input_audio_buffer.append");
  ok(appends.length === 1 && appends[0].audio.length > 4000, "mic chunks sent as base64 pcm16", String(appends[0]?.audio?.length));

  mic.click();
  await tick();
  ok(S.ends.length === 1 && S.ends[0].id === "sid-1" && typeof S.ends[0].durationSec === "number" && S.ends[0].userTurns === 1, "hangup posts call-end with turns", JSON.stringify(S.ends));
  ok(pill().includes(FR.idle), "idle pill after hangup", pill());
  ok(doc.querySelectorAll("#calls tr").length === 2, "call log refreshed after hangup");

  // repeat run
  S.session = { ...S.session, sessionId: "sid-2" };
  mic.click();
  await tick();
  const ws2 = FakeWS.instances[1];
  ws2.serverOpen();
  await tick();
  mic.click();
  await tick();
  ok(FakeWS.instances.length === 2 && S.ends.length === 2 && S.ends[1].id === "sid-2", "second call works, log consistent", JSON.stringify(S.ends.map((e) => e.id)));
}

/* ---------- case: session failure path ---------- */
resetState();
S.sessionStatus = 400;
S.session = { error: "missing_key" };
{
  const { win, doc, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  const mic = doc.getElementById("mic") as HTMLButtonElement;
  mic.click();
  await tick();
  ok(FakeWS.instances.length === 0, "failed session opens no WebSocket");
  ok(doc.getElementById("banner")!.textContent!.includes(FR.setup), "missing-key error maps to setup banner", doc.getElementById("banner")!.textContent!);
  ok(mic.disabled === false, "mic re-enabled after failure");
}

/* ---------- case: hands-free button (start, reconnect, stop) ---------- */
resetState();
{
  const { win, doc, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  const mic = doc.getElementById("mic") as HTMLButtonElement;
  const btnAuto = doc.getElementById("btn-auto") as HTMLButtonElement;
  ok(btnAuto.textContent === "Mains libres", "hands-free button labeled", btnAuto.textContent!);
  ok(mic.style.display !== "none", "mic visible when hands-free off");

  btnAuto.click();
  await tick();
  ok((S.sessionFetches || 0) === 1 && FakeWS.instances.length === 1, "hands-free click connects", String(S.sessionFetches) + "/" + String(FakeWS.instances.length));
  ok(btnAuto.textContent!.includes("Arrêter"), "button becomes stop", btnAuto.textContent!);
  const ws = FakeWS.instances[0];
  ws.serverOpen();
  await tick();
  ok(doc.getElementById("pill")!.textContent!.includes(FR.live), "live pill in hands-free");

  // provider-side drop -> silent reconnect
  S.session = { ...S.session, sessionId: "sid-hf2" };
  ws.close();
  await new Promise((r) => setTimeout(r, 1900));
  ok((S.sessionFetches || 0) === 2 && FakeWS.instances.length === 2, "hands-free reconnects after drop", String(S.sessionFetches) + "/" + String(FakeWS.instances.length));
  const ws2 = FakeWS.instances[1];
  ws2.serverOpen();
  await tick();

  // stop by button -> no reconnect, mic back
  btnAuto.click();
  await tick();
  ws2.close();
  await new Promise((r) => setTimeout(r, 1900));
  ok((S.sessionFetches || 0) === 2 && FakeWS.instances.length === 2, "stop button suppresses reconnect", String(S.sessionFetches) + "/" + String(FakeWS.instances.length));
  ok(S.ends.map((e: any) => e.id).join(",") === "sid-1,sid-hf2", "both sessions closed in the log", JSON.stringify(S.ends.map((e: any) => e.id)));
  ok(btnAuto.textContent === "Mains libres" && mic.style.display !== "none", "UI back to idle state", btnAuto.textContent!);
}

/* ---------- case: no auto-connect on load ---------- */
resetState();
{
  const { win, doc, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  await new Promise((r) => setTimeout(r, 1100));
  ok((S.sessionFetches || 0) === 0 && FakeWS.instances.length === 0, "no auto-connect on load", String(S.sessionFetches) + "/" + String(FakeWS.instances.length));
  ok(doc.getElementById("banner")!.textContent!.includes(FR.ready), "ready banner on load", doc.getElementById("banner")!.textContent!);
}

/* ---------- case: mic errors are told apart ---------- */
resetState();
S.micReject = "NotFoundError";
{
  const { win, doc, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  (doc.getElementById("mic") as HTMLButtonElement).click();
  await tick();
  ok(FakeWS.instances.length === 0 && doc.getElementById("banner")!.textContent!.includes(FR.micNone), "no mic device -> dedicated message", doc.getElementById("banner")!.textContent!);
  ok((doc.getElementById("mic") as HTMLButtonElement).disabled === false, "mic re-enabled after device error");
}
resetState();
S.micReject = "NotAllowedError";
{
  const { win, doc, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  (doc.getElementById("mic") as HTMLButtonElement).click();
  await tick();
  ok(FakeWS.instances.length === 0 && doc.getElementById("banner")!.textContent!.includes(FR.mic), "denied mic -> permission message", doc.getElementById("banner")!.textContent!);
}

/* ---------- case: mobile path — worklet fails, ScriptProcessor fallback ---------- */
resetState();
S.workletFail = true;
{
  const { win, doc, FakeAC, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  (doc.getElementById("mic") as HTMLButtonElement).click();
  await tick();
  ok(FakeWS.instances.length === 1, "worklet failure falls back to ScriptProcessor and still connects", String(FakeWS.instances.length));
  ok(!doc.getElementById("banner")!.className.includes("err"), "no mic-blame banner on audio-pipeline failure", doc.getElementById("banner")!.textContent!);
  const ws = FakeWS.instances[0];
  ws.serverOpen();
  await tick();
  ok(doc.getElementById("pill")!.textContent!.includes(FR.live), "live pill on fallback path");
  FakeAC.lastSP.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096) } });
  await tick();
  const appends = ws.sent.map((m) => JSON.parse(m)).filter((m) => m.type === "input_audio_buffer.append");
  ok(appends.length === 1 && appends[0].audio.length > 4000, "ScriptProcessor mic frames reach the WebSocket", String(appends[0]?.audio?.length));
}

/* ---------- case: 48 kHz context is resampled to 24 kHz ---------- */
resetState();
S.ctxRate = 48000;
{
  const { win, doc, FakeWorklet, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  (doc.getElementById("mic") as HTMLButtonElement).click();
  await tick();
  const ws = FakeWS.instances[0];
  ws.serverOpen();
  await tick();
  FakeWorklet.last.port.onmessage({ data: new Float32Array(2048) });
  await tick();
  const appends = ws.sent.map((m) => JSON.parse(m)).filter((m) => m.type === "input_audio_buffer.append");
  ok(appends.length === 1 && appends[0].audio.length > 1000 && appends[0].audio.length < 4000, "48 kHz frames resampled down to 24 kHz before send", String(appends[0]?.audio?.length));
}

/* ---------- case: delegation loop (function call -> open-bot -> spoken result) ---------- */
resetState();
{
  const { win, doc, FakeWS } = boot("fr-CA");
  await runPage(doc, win);
  (doc.getElementById("mic") as HTMLButtonElement).click();
  await tick();
  const ws = FakeWS.instances[0];
  ws.serverOpen();
  await tick();

  ws.serverMsg({ type: "response.output_item.done", item: { type: "function_call", call_id: "call_1", name: "delegate_openbot", arguments: JSON.stringify({ task: "Quel temps demain à Montréal?" }) } });
  await new Promise((r) => setTimeout(r, 3400));
  ok(S.delegates.length === 1 && S.delegates[0].task === "Quel temps demain à Montréal?", "function call posts api/delegate with the task", JSON.stringify(S.delegates));
  const sys = doc.querySelectorAll(".msg.sys");
  ok(sys.length === 1 && sys[0].textContent!.includes("Délégation à l'agent du bureau"), "delegation noted in transcript", sys[0]?.textContent ?? "none");
  const sent = ws.sent.map((m) => JSON.parse(m));
  const out = sent.find((m) => m.type === "conversation.item.create");
  ok(out && out.item.type === "function_call_output" && out.item.call_id === "call_1" && out.item.output === "PONG", "tool output sent back with the result", JSON.stringify(out));
  ok(sent.some((m) => m.type === "response.create"), "response.create triggered so the agent speaks the result");

  ws.serverMsg({ type: "response.output_item.done", item: { type: "function_call", call_id: "call_2", name: "delegate_openbot", arguments: "{}" } });
  await tick();
  const outs = ws.sent.map((m) => JSON.parse(m)).filter((m) => m.type === "conversation.item.create");  const out2 = outs[outs.length - 1];
  ok(out2 && out2.item.call_id === "call_2" && /No task/i.test(out2.item.output), "empty task answered with an explicit tool output", JSON.stringify(out2));
}

console.log(`\nuitest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
