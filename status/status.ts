#!/usr/bin/env bun
/**
 * ob-plugin-voice-agent-status — report the Voice Agent configuration state.
 * Prints JSON only; never prints a key value.
 */
const PLUGIN_ID = process.env.OPEN_BOT_PLUGIN_ID || "voice-agent";

type Cfg = { settings?: Record<string, string>; vault?: Record<string, string> };
let cfg: Cfg = {};
try {
  cfg = JSON.parse(await Bun.file(`/home/agent/.config/open-bot/plugin-${PLUGIN_ID}.json`).text());
} catch {}

const s = cfg.settings ?? {};
const v = cfg.vault ?? {};
const clean = (x: unknown): string => String(x ?? "").replace(/\s+/g, "");
const fromSettings = clean(s.xai_api_key);
const fromVault = clean(v["xai-api-key"]);
const fromShared = clean(v["xai"]);
const key = fromSettings || fromVault || fromShared;

const out = {
  plugin: PLUGIN_ID,
  provider: (s.provider || "xai").trim(),
  model: (s.model || "grok-voice-latest").trim(),
  voice: (s.voice || "eve").trim(),
  hasKey: Boolean(key),
  keySource: fromSettings ? "settings" : fromVault ? "vault" : fromShared ? "shared:xai" : "",
  vaultSlug: "xai-api-key",
  sharedSlug: "xai",
  dashboard: "Dashboards → Voice Agent",
  hint: key
    ? "Ready: open the Voice Agent dashboard tab and press the button to talk."
    : "Missing key: Dashboard → Plugins → Voice Agent → Settings, paste the xAI API key, fill vault slug xai-api-key, or add the shared xAI key on the Config page Keys tab.",
};

console.log(JSON.stringify(out, null, 2));
