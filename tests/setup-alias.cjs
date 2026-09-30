// Test-only module loading (loaded with --require by `npm test`): "@/..." imports that a test does not mock
// resolve to the project files, and .ts/.tsx/.svg files load the way Next compiles them. Tests keep mocking
// whatever they want to isolate; this only lets shared UI primitives (components/ui) load for real.
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveProjectAlias(request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const base = path.join(root, request.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return resolveFilename.call(this, request, parent, ...rest);
};

for (const extension of [".ts", ".tsx"]) {
  Module._extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    module._compile(outputText, filename);
  };
}

// Static image imports become Next's { src, width, height } object.
Module._extensions[".svg"] = (module, filename) => {
  module.exports = { __esModule: true, default: { src: `/${path.basename(filename)}`, width: 112, height: 78 } };
};
