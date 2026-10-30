"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const ids = fs.readFileSync(path.join(root, "acceptance/cases.tsv"), "utf8").split("\n").filter((line) => line.startsWith("EASE-")).map((line) => line.split("\t")[0]);
const seen = new Set();
const groups = {};
for (const group of "abcdef") {
  const cases = require(`./checks-${group}.cjs`);
  groups[group] = cases.length;
  for (const entry of cases) {
    if (!ids.includes(entry.id) || seen.has(entry.id)) throw new Error(`Unknown or duplicate case ${entry.id}`);
    seen.add(entry.id);
  }
}
const missing = ids.filter((id) => !seen.has(id));
console.log(JSON.stringify({ registered: ids.length, implemented: seen.size, groups, missing }, null, 2));
if (process.argv.includes("--strict") && missing.length) process.exitCode = 1;
