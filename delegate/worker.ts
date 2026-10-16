#!/usr/bin/env bun
/**
 * voice-agent delegation worker — detached from the page server on purpose.
 * Runs one opencode task and writes the result to a file. Survives page-server
 * restarts, isolates heavy memory use from the dashboard process.
 * Usage: delegate-worker <id>  (task file: delegate-task-<id>.json)
 */
const id = process.argv[2] || "";
const DIR = `/home/agent/.open-bot/pages-data/voice-agent`;

type Cfg = { settings?: Record<string, string> };
let s: Record<string, string> = {};
try {
  s = (JSON.parse(await Bun.file(`/home/agent/.config/open-bot/plugin-voice-agent.json`).text()) as Cfg).settings ?? {};
} catch {}
const agent = (s.delegate_agent || "").trim();
const to = Math.min(600, Math.max(30, Number(s.delegate_timeout ?? 240) || 240));

const taskFile = `${DIR}/delegate-task-${id}.json`;
let task = "";
try {
  task = String(JSON.parse(await Bun.file(taskFile).text()).task ?? "");
} catch {}
const done = (result: string) =>
  Bun.write(`${DIR}/delegate-result-${id}.json`, JSON.stringify({ result: String(result).slice(0, 4000) }));

if (!task) {
  await done("No task was provided.");
  process.exit(0);
}

try {
  const proc = Bun.spawn(["opencode", "run", ...(agent ? ["--agent", agent] : []), task], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    cwd: "/home/agent/workspace",
  });
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    try {
      proc.kill();
    } catch {}
  }, to * 1000);
  const parts = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  await proc.exited;
  clearTimeout(timer);
  let result = parts[0].trim();
  if (!result) result = killed ? "The task did not finish in time." : "(empty response)";
  await done(result);
} catch (e) {
  await done("Delegation failed: " + String(e).slice(0, 120));
}
try {
  require("node:fs").unlinkSync(taskFile);
} catch {}
