// UX-8, the cloud part of the coherence sweep (docs/ux-redesign/ux-8-coherence.md): buttons on the Q17 scale in Admin
// (C2), one ellipsis character in loading labels (C3), and no browser confirm boxes left (UX-6).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    return entry.isDirectory() ? files(relative) : entry.name.endsWith(".tsx") ? [relative] : [];
  });
}
const sources = [...files("app"), ...files("components")].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]);

test("no 40 px hand-rolled buttons: controls use the 36/44/52 scale", () => {
  for (const [file, text] of sources) assert.doesNotMatch(text, /\bmin-h-10\b/, file);
});

test("loading and progress labels end with one ellipsis character, not three dots", () => {
  for (const [file, text] of sources) assert.doesNotMatch(text, /(Guardando|Procesando|Creando cuenta|Enviando|Revisando sesión|Publicando|Cargando|Subiendo)[^"`<]*\.\.\.["`<]/, file);
});

test("no window.confirm anywhere in the interface", () => {
  for (const [file, text] of sources) {
    if (file.endsWith("confirm-dialog.tsx")) continue;
    assert.doesNotMatch(text, /window\.confirm\(/, file);
  }
});
