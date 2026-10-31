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
    (name) => {
      if (name in overrides) return overrides[name];
      if (name.startsWith("@/")) {
        const file = path.resolve(name.slice(2));
        const resolved = [file, file + ".ts", file + ".tsx"].find((value) => fs.existsSync(value));
        return loadTypeScript(resolved, overrides);
      }
      return require(name);
    },
    mod,
    mod.exports,
    class {
      constructor(values) { this.values = values; }
      get(name) { return this.values[name]; }
    },
    { location: { origin: "https://laria.audio", pathname: "/restablecer-contrasena", search: "?paso=nueva" } },
  );
  return mod.exports;
}

const password = loadTypeScript(path.resolve("lib/auth/password.ts"));
const redirects = loadTypeScript(path.resolve("lib/auth/redirects.ts"));
const genericError = "No se pudo actualizar la contraseña. Solicita un nuevo enlace o intenta nuevamente.";
const samePasswordError = "La nueva contraseña debe ser diferente de tu contraseña actual.";

function formHarness({ mode = "reset", error = null, session = { user: { id: "qa" } }, level = { currentLevel: "aal1", nextLevel: "aal1" } } = {}) {
  const state = [];
  const effects = [];
  const calls = { updates: [], destinations: [], sessions: 0, refreshes: 0 };
  let hookIndex = 0;
  const { PasswordUpdateForm } = loadTypeScript(path.resolve("components/password-form.tsx"), {
    react: {
      useRef(initial) {
        const index = hookIndex++;
        if (!(index in state)) state[index] = { current: initial };
        return state[index];
      },
      useState(initial) {
        const index = hookIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      // Recorded, not run: a test runs them when it needs the page's first load.
      useEffect(effect) {
        effects.push(effect);
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
    "@/components/auth/two-step-setup": { TwoStepCode: function TwoStepCode() { return null; } },
    "@/lib/supabase/browser-client": {
      getSupabaseBrowserClient: () => ({ auth: {
        getSession: async () => { calls.sessions++; return { data: { session } }; },
        updateUser: async (fields) => { calls.updates.push(fields); return { error }; },
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: level, error: null }) },
      } }),
    },
  });
  function render() {
    hookIndex = 0;
    return PasswordUpdateForm({ mode });
  }
  return {
    calls,
    // The page's first load: runs the effects of the first render, then lets their requests answer.
    async load({ leaveFirst = false } = {}) {
      render();
      const cleanups = effects.splice(0).map((effect) => effect());
      if (leaveFirst) cleanups.forEach((cleanup) => cleanup?.());
      await new Promise((resolve) => setImmediate(resolve));
    },
    // The code step's TwoStepCode props, or null while the form shows.
    codeStep() {
      const view = render();
      if (view.type === "form") return null;
      const step = [view.props.children].flat().find((child) => child?.type?.name === "TwoStepCode");
      return step ? step.props : "missing";
    },
    async submit(value = "new-password", confirmation = value) {
      await render().props.onSubmit({
        preventDefault() {},
        currentTarget: {
          password: value, confirmation,
          elements: [["password", value], ["confirmation", confirmation]].map(([name, input]) => ({
            tagName: "INPUT", name, id: "clave-" + name, value: input, type: "password", required: true,
            minLength: 8, dataset: {}, validity: {}, matches: () => false, closest: () => null,
            labels: [{ textContent: name === "password" ? "Nueva contraseña" : "Confirmar contraseña" }],
          })),
        },
      });
    },
    fieldError(name) {
      const summary = render().props.children.find((child) => child.type?.name === "ErrorSummary");
      return summary.props.errors.find((error) => error.id === "clave-" + name)?.message;
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
    assert.ok(form.fieldError("password").endsWith(samePasswordError));
    assert.equal(form.message(), "");
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
  assert.ok(form.fieldError("password").endsWith("Usa al menos 8 caracteres."));
  await form.submit("new-password", "other-password");
  assert.ok(form.fieldError("confirmation").endsWith("Las contraseñas no coinciden."));
  assert.deepEqual(form.calls.updates, []);
});

// Launch audit A15: Supabase changes the password of an account with an authenticator app only in a session that
// passed the app's code, and a recovery link opens one without it.
test("with an authenticator app, the reset page asks for the code before the new password", async () => {
  const form = formHarness({ level: { currentLevel: "aal1", nextLevel: "aal2" } });
  assert.equal(form.codeStep(), null);
  await form.load();
  assert.deepEqual(form.codeStep(), { next: "/restablecer-contrasena?paso=nueva" });
  assert.deepEqual(form.calls.updates, []);
});

test("without an app, or with the code already given, the reset page shows the form", async () => {
  for (const level of [{ currentLevel: "aal1", nextLevel: "aal1" }, { currentLevel: "aal2", nextLevel: "aal2" }, null]) {
    const form = formHarness({ level });
    await form.load();
    assert.equal(form.codeStep(), null, JSON.stringify(level));
  }
  // A page left before the answer arrives changes nothing.
  const left = formHarness({ level: { currentLevel: "aal1", nextLevel: "aal2" } });
  await left.load({ leaveFirst: true });
  assert.equal(left.codeStep(), null);
});

for (const mode of ["reset", "change"]) {
  test(`${mode} form refused for a missing code goes to the code step, then back to the same page`, async () => {
    const form = formHarness({ mode, error: { code: "insufficient_aal", message: "AAL2 session is required to update email or password when MFA is enabled." } });
    await form.submit();
    assert.deepEqual(form.calls.updates, [{ password: "new-password" }]);
    assert.deepEqual(form.codeStep(), { next: "/restablecer-contrasena?paso=nueva" });
    assert.deepEqual(form.calls.destinations, []);
    assert.equal(form.calls.refreshes, 0);
  });
}
