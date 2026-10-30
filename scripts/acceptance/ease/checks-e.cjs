// Group E of the Effortless Laria acceptance run: EASE-750 to EASE-766 (integration), EASE-800 to EASE-829 (Reservado
// and Hacer una oferta), EASE-830 to EASE-859 (Descubrir), EASE-860 to EASE-878 (AI helpers) and EASE-880 to EASE-882.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const parts = ["e-integration.cjs", "e-reservado.cjs", "e-descubrir.cjs", "e-ai.cjs"];
module.exports = parts.filter((file) => fs.existsSync(path.join(__dirname, file))).flatMap((file) => require(`./${file}`));
