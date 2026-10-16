#!/usr/bin/env bun
/**
 * voice-agent contrast audit — extracts the :root (light) and html[data-theme=dark]
 * variable blocks from server/styles.css and checks WCAG ratios of the text pairs
 * used by the page. Min 4.5:1 for text, 3.0:1 for the large mic glyph.
 * bun scripts/contrast-check.ts
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../server/styles.css", import.meta.url), "utf8");

function varsOf(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z]+):(#[0-9a-fA-F]{3,8})/g)) out[m[1]] = m[2];
  return out;
}

const lightBlock = src.match(/:root\{([^}]+)\}/)?.[1] ?? "";
const darkBlock = src.match(/html\[data-theme="dark"\]\{([^}]+)\}/)?.[1] ?? "";
const light = varsOf(lightBlock);
const dark = varsOf(darkBlock);

if (!light.bg || !dark.bg) {
  console.error("Could not find theme variable blocks in server/styles.css");
  process.exit(2);
}

function lum(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground, background, min ratio, label]
const pairs: [string, string, number, string][] = [
  ["tx", "bg", 4.5, "texte principal / fond"],
  ["tx", "card", 4.5, "texte principal / carte"],
  ["dim", "bg", 4.5, "texte secondaire / fond"],
  ["dim", "card", 4.5, "texte secondaire / carte (pill, who, timer)"],
  ["acc", "card", 4.5, "accents texte (who agent, hover) / carte"],
  ["ok", "card", 4.5, "accents ok (who user, bannière ok) / carte"],
  ["warn", "card", 4.5, "bannière setup / carte"],
  ["err", "card", 4.5, "bannières erreur / carte"],
  ["acc", "bg", 4.5, "accents / fond"],
];

let fail = 0;
for (const [themeName, v] of [["light", light], ["dark", dark]] as [string, Record<string, string>][]) {
  console.log(`— thème ${themeName} —`);
  for (const [fg, bg, min, label] of pairs) {
    if (!v[fg] || !v[bg]) {
      fail++;
      console.log(`FAIL ${fg}/${bg} manquant`);
      continue;
    }
    const r = ratio(v[fg], v[bg]);
    const okR = r >= min;
    if (!okR) fail++;
    console.log(`${okR ? "PASS" : "FAIL"} ${fg}/${bg} = ${r.toFixed(2)}:1 (min ${min}) — ${label}`);
  }
  const mic = ratio("#ffffff", v.acc);
  const okMic = mic >= 3;
  if (!okMic) fail++;
  console.log(`${okMic ? "PASS" : "FAIL"} #ffffff/acc = ${mic.toFixed(2)}:1 (min 3.0, glyphe large) — bouton micro`);
}

console.log(fail ? `\n${fail} échec(s)` : "\nContraste conforme dans les deux thèmes");
process.exit(fail ? 1 : 0);
