#!/usr/bin/env node
// Client-transition trials for the catalog (UX-3 brief § The catalog transition stall, § Appendix: stall
// measurements). Each trial runs in a fresh agent-browser session: open the start page, wait 2 s, call
// window.next.router.push(target), wait 6 s, then read location and the App Router's own state. A trial completes
// when location shows the target; a stall is a trial whose location is still elsewhere.
//
//   node scripts/ux-transition-trials.cjs --base http://localhost:3200 --label ux3-trials-before [--trials 10] [--moves criterion|f11|all] [--width 1280]
//
// Run it on a production build (next build + next start) of a scratch copy whose LISTINGS_PAGE_SIZE is 2, so that
// ?page=2 exists with the local listings. Local builds only. Browser: agent-browser on PATH or LARIA_AGENT_BROWSER_BIN.
// Output: .ux-snapshots/<label>/transitions.json (every trial) and a summary on stdout.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option("base", "http://localhost:3200").replace(/\/$/, "");
const label = option("label", "transition-trials");
const trials = Number(option("trials", "10"));
const width = option("width");
const set = option("moves", "criterion");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("Local builds only.");
if (!Number.isInteger(trials) || trials < 1) throw new Error("--trials must be a positive integer.");
const browser = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
const outDir = path.join(".ux-snapshots", label);
fs.mkdirSync(outDir, { recursive: true });

// Acceptance criterion 2 of 3a: the four moves from /listados, their reverse, a landing to its filtered catalog and
// a filtered catalog to another filter. "f11" adds the multi-value moves (two conditions, two locations).
const CRITERION = [
  ["/listados", "/listados?seller_type=verified_store"],
  ["/listados", "/listados?category=guitars"],
  ["/listados", "/listados?condition=Nuevo"],
  ["/listados", "/listados?page=2"],
  ["/listados?seller_type=verified_store", "/listados"],
  ["/listados?category=guitars", "/listados"],
  ["/listados?condition=Nuevo", "/listados"],
  ["/listados?page=2", "/listados"],
  ["/instrumentos/guitarras", "/listados?category=guitars&condition=Nuevo"],
  ["/listados?category=guitars", "/listados?category=guitars&condition=Nuevo"],
];
const F11 = [
  ["/listados?condition=Nuevo", "/listados?condition=Nuevo&condition=Usado+-+buen+estado"],
  ["/listados?location=Lima", "/listados?location=Lima&location=Arequipa"],
];
const moves = set === "f11" ? F11 : set === "all" ? [...CRITERION, ...F11] : CRITERION;

function run(session, ...command) {
  const result = spawnSync(browser, ["--session", session, "--json", ...command], { encoding: "utf8", timeout: 90000, maxBuffer: 64 << 20 });
  if (result.status !== 0) throw new Error(`agent-browser ${command[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  if (!parsed.success) throw new Error(parsed.error ?? `agent-browser ${command[0]} failed`);
  return parsed.data;
}
const evaluate = (session, js) => run(session, "eval", js).result;
const close = (session) => { try { run(session, "close"); } catch { /* already closed */ } };

// The router's own state, read through webpack's module registry: the module whose factory names
// getCurrentAppRouterState (Next's app-router instance, already loaded by the page, so requiring it returns its
// cached exports) gives the URL the router believes it is on.
const READ_STATE = `(() => {
  let router = null;
  try {
    self.webpackChunk_N_E.push([[Symbol()], {}, (require) => {
      for (const id of Object.keys(require.m)) {
        if (!String(require.m[id]).includes("getCurrentAppRouterState")) continue;
        const read = require(id)?.getCurrentAppRouterState;
        if (typeof read === "function") { router = read()?.canonicalUrl ?? null; break; }
      }
    }]);
  } catch (error) { router = "error: " + error.message; }
  return JSON.stringify({ location: location.pathname + location.search, router, title: document.title, h1: document.querySelector("h1")?.textContent?.trim() ?? null });
})()`;

const report = { base, date: new Date().toISOString(), trialsPerMove: trials, waitBeforeMs: 2000, waitAfterMs: 6000, moves: [] };
let count = 0;
for (const [from, to] of moves) {
  const results = [];
  for (let trial = 1; trial <= trials; trial += 1) {
    const session = `trial${process.pid}-${(count += 1)}`;
    try {
      if (width) run(session, "set", "viewport", width, "900");
      run(session, "open", `${base}${from}`);
      run(session, "wait", "2000");
      evaluate(session, `(() => { window.next.router.push(${JSON.stringify(to)}); return "pushed"; })()`);
      run(session, "wait", "6000");
      const state = JSON.parse(evaluate(session, READ_STATE));
      results.push({ trial, completed: state.location === to, ...state });
    } catch (error) {
      results.push({ trial, completed: false, error: error.message });
    } finally {
      close(session);
    }
  }
  const stalls = results.filter((result) => !result.completed).length;
  report.moves.push({ from, to, stalls, trials: results.length, results });
  console.log(`${from} → ${to}: ${stalls} of ${results.length} stalled`);
  fs.writeFileSync(path.join(outDir, "transitions.json"), `${JSON.stringify(report, null, 2)}\n`);
}
const total = report.moves.reduce((sum, move) => sum + move.stalls, 0);
console.log(`Total: ${total} stalls in ${count} trials. Report: ${path.join(outDir, "transitions.json")}`);
