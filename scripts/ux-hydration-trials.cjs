#!/usr/bin/env node
// Hydration trials (UX-4, React #418): opens one URL in N fresh agent-browser sessions on a LOCAL production build and
// reports each session's page errors (React's recoverable errors land there) and console errors.
//
//   LARIA_AGENT_BROWSER_BIN=<agent-browser> node scripts/ux-hydration-trials.cjs <url> [sessions=10] [--login] [--block <glob>]
//
// --login signs in as the local Particular from .ux-accounts.local.json first (scripts/ux-local-accounts.cjs).
// --block aborts requests matching a glob (e.g. "**/api/account-navigation") to test a cause.
// 9 Oct 2026, before the fix (0dda0ec): 9 of 10 sessions on a fresh listing logged #418; after it, 0 of 10.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);
const url = args[0];
const sessions = Number(args[1] && !args[1].startsWith("--") ? args[1] : 10);
const login = args.includes("--login");
const block = args.includes("--block") ? args[args.indexOf("--block") + 1] : null;
if (!url) throw new Error("Usage: node scripts/ux-hydration-trials.cjs <url> [sessions] [--login] [--block <glob>]");
const target = new URL(url);
if (!["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Local builds only.");
const binary = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";

function command(session, ...rest) {
  const result = spawnSync(binary, ["--session", session, "--json", ...rest], { encoding: "utf8", timeout: 60000, maxBuffer: 8e6 });
  try {
    return JSON.parse(result.stdout).data;
  } catch {
    return null;
  }
}

let failed = 0;
for (let index = 0; index < sessions; index += 1) {
  const session = `hydration-${process.pid}-${index}`;
  if (login) {
    const account = require(path.resolve(".ux-accounts.local.json")).particular;
    command(session, "open", `${target.origin}/login`);
    command(session, "find", "label", "Correo", "fill", account.email);
    command(session, "find", "label", "Contraseña", "fill", account.password);
    command(session, "find", "role", "button", "click", "--name", "Ingresar");
    command(session, "wait", "--url", "**/mi-cuenta");
  }
  if (block) {
    command(session, "open", "about:blank");
    command(session, "network", "route", block, "--abort");
  }
  command(session, "open", url);
  command(session, "wait", "3000");
  const errors = (command(session, "errors")?.errors ?? []).map((error) => String(error.message ?? error.text ?? JSON.stringify(error)).split("\n")[0].slice(0, 200));
  const consoleErrors = (command(session, "console")?.messages ?? []).filter((message) => /error/i.test(message.type ?? "")).map((message) => String(message.text).slice(0, 200));
  if (errors.length || consoleErrors.length) failed += 1;
  console.log(index, JSON.stringify({ errors, consoleErrors }));
  command(session, "close");
}
console.log(`sessions with errors: ${failed} of ${sessions}`);
process.exitCode = failed ? 1 : 0;
