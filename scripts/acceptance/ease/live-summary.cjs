// The live run's results in the form the acceptance list takes (id, status, evidence), small enough to send back:
//   node scripts/acceptance/ease/live-summary.cjs <visitor.jsonl> <accounts.jsonl>
// The last line of a case wins; a case in both passes keeps the stricter result (Fail over Pass over Not Run).
"use strict";
const fs = require("node:fs");

const rank = { Fail: 3, Blocked: 2, Pass: 1, "Not Run": 0 };
const cases = new Map();
for (const file of process.argv.slice(2)) {
  if (!fs.existsSync(file)) continue;
  const pass = /accounts/.test(file) ? "throwaway accounts" : "signed out, read-only";
  const last = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    last.set(record.id, record);
  }
  for (const record of last.values()) {
    if (!/^EASE-/.test(record.id)) continue;
    const day = (record.at || "").slice(0, 10);
    const failed = (record.checks || []).filter((check) => !check.ok).map((check) => check.message);
    let evidence;
    if (record.status === "Pass") {
      evidence = `Live on laria.audio PASS — ${day} (${pass}; ${(record.checks || []).length} checks)`;
    } else if (record.status === "Fail") {
      evidence = `Live on laria.audio FAIL — ${day} (${pass}): ${[record.error, ...failed].filter(Boolean).join("; ")}`;
    } else {
      evidence = `Live on laria.audio not run — ${day} (${pass}): ${(record.notes || []).filter((note) => /^live:/.test(note)).join("; ") || record.status}`;
    }
    const entry = { id: record.id, status: record.status, evidence: evidence.replace(/[\t\n]+/g, " ").slice(0, 600) };
    if (record.touched) entry.touched = record.touched;
    const before = cases.get(record.id);
    if (!before || rank[entry.status] > rank[before.status]) cases.set(record.id, entry);
  }
}
const list = [...cases.values()].sort((a, b) => a.id.localeCompare(b.id));
const counts = list.reduce((all, entry) => ({ ...all, [entry.status]: (all[entry.status] || 0) + 1 }), {});
console.log(JSON.stringify({ counts, cases: list }));
