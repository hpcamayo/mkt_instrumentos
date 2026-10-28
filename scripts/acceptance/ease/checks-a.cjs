// Effortless Laria acceptance, group A: find (EASE-001..028), the listing page and WhatsApp (EASE-100..119). The checks
// live in the a-*.cjs parts; helpers in a-helpers.cjs. Cases marked live read public pages signed out.
//   node scripts/acceptance/ease/run.cjs scripts/acceptance/ease/checks-a.cjs [--only=EASE-001,...] [--results=...]
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const parts = ["a-find1.cjs", "a-find2.cjs", "a-listing.cjs"].filter((file) => fs.existsSync(path.join(__dirname, file)));
module.exports = parts.flatMap((file) => require(`./${file}`));
