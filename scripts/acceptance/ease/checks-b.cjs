// Effortless Laria acceptance, group B: listing media and questions (EASE-160..179), accounts and saving
// (EASE-200..228), speed, accessibility, the installable app and push (EASE-700..727). The checks live in the b-*.cjs
// parts; helpers in b-util.cjs.
//   node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/checks-b.cjs [--only=EASE-160,...] [--results=...]
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const parts = ["b-media.cjs", "b-questions.cjs", "b-accounts.cjs", "b-speed.cjs"].filter((file) => fs.existsSync(path.join(__dirname, file)));
module.exports = parts.flatMap((file) => require(`./${file}`));
