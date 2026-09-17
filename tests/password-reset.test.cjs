const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(filename, overrides = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "FormData", "window", compiled)(
    (name) => overrides[name] ?? require(name),
    mod,
    mod.exports,
    class {
      constructor(values) { this.values = values; }
      get(name) { return this.values[name]; }
    },
    { location: { origin: "https://laria.audio" } },
  );
  return mod.exports;
}

const password = loadTypeScript(path.resolve("lib/auth/password.ts"));
const redirects = loadTypeScript(path.resolve("lib/auth/redirects.ts"));
const genericError = "No se pudo actualizar la contraseña. Solicita un nuevo enlace o intenta nuevamente.";
const samePasswordError = "La nueva contraseña debe ser diferente de tu contraseña actual.";

function formHarness({ mode = "reset", error = null, session = { user: { id: "qa" } } } = {}) {
  const state = [];
  const calls = { updates: [], destinations: [], sessions: 0, refreshes: 0 };
  let hookIndex = 0;
  const { PasswordUpdateForm } = loadTypeScript(path.resolve("components/password-form.tsx"), {
    react: {
      useState(initial) {
        const index = hookIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
    },
    "next/link": { __esModule: true, default: () => null },
    "next/navigation": {
      useRouter: () => ({
        push: (destination) => calls.destinations.push(destination),
        refresh: () => { calls.refreshes++; },
      }),
      useSearchParams: () => new URLSearchParams("next=https://unsafe.example"),
    },
    "@/lib/auth/password": password,
    "@/lib/auth/redirects": redirects,
    "@/components/page-notice": { PageNotice: () => null },
    "@/lib/supabase/browser-client": {
      getSupabaseBrowserClient: () => ({ auth: {
        getSession: async () => { calls.sessions++; return { data: { session } }; },
        updateUser: async (fields) => { calls.updates.push(fields); return { error }; },
      } }),
    },
  });
  function render() {
    hookIndex = 0;
    return PasswordUpdateForm({ mode });
  }
  return {
    calls,
    async submit(value = "new-password", confirmation = value) {
      await render().props.onSubmit({
        preventDefault() {},
        currentTarget: { password: value, confirmation },
      });
    },
    message() {
      return render().props.children.find((child) => child.type?.name === "Status").props.message;
    },
  };
}

test("password errors use only the documented same_password provider code", () => {
  assert.equal(password.getPasswordUpdateErrorMessage({ code: "same_password" }), samePasswordError);
  for (const error of [
    null,
    undefined,
    {},
    { code: "unknown", message: "Private provider diagnostics" },
    { message: "New password should be different from the old password." },
    { code: "SAME_PASSWORD" },
    { code: "session_not_found" },
  ]) {
    assert.equal(password.getPasswordUpdateErrorMessage(error), genericError);
  }
});

for (const mode of ["reset", "change"]) {
  test(`${mode} form shows same-password guidance without redirecting or comparing stored passwords`, async () => {
    const form = formHarness({ mode, error: { code: "same_password", message: "Raw provider copy" } });
    await form.submit("current-password");
    assert.equal(form.message(), samePasswordError);
    assert.deepEqual(form.calls.updates, [{ password: "current-password" }]);
    assert.deepEqual(form.calls.destinations, []);
    assert.equal(form.calls.refreshes, 0);
    assert.equal(form.calls.sessions, mode === "reset" ? 1 : 0);
  });
}

test("unknown reset failures keep generic copy and never expose provider details", async () => {
  const form = formHarness({ error: { code: "unexpected", message: "Internal server details" } });
  await form.submit();
  assert.equal(form.message(), genericError);
  assert.deepEqual(form.calls.destinations, []);
});

test("reset without a recovery session still fails safely before updateUser", async () => {
  const form = formHarness({ session: null });
  await form.submit();
  assert.equal(form.message(), "El enlace venció o no es válido. Solicita uno nuevo.");
  assert.deepEqual(form.calls.updates, []);
  assert.deepEqual(form.calls.destinations, []);
});

test("valid reset retains safe account redirect and success feedback", async () => {
  const form = formHarness();
  await form.submit();
  assert.equal(form.message(), "");
  assert.deepEqual(form.calls.updates, [{ password: "new-password" }]);
  assert.deepEqual(form.calls.destinations, ["/mi-cuenta?password=updated"]);
  assert.equal(form.calls.refreshes, 1);
});

test("password confirmation validation remains before any provider request", async () => {
  const form = formHarness();
  await form.submit("short");
  assert.equal(form.message(), "Usa al menos 8 caracteres.");
  await form.submit("new-password", "other-password");
  assert.equal(form.message(), "Las contraseñas no coinciden.");
  assert.deepEqual(form.calls.updates, []);
});
