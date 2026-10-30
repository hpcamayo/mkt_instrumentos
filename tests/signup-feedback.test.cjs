const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const profile = require("../lib/auth/profile.ts");

function load(filename, overrides = {}, fetch = () => {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve(filename), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "FormData", "window", "fetch", compiled)(
    (name) => overrides[name] ?? require(name), mod, mod.exports,
    class {
      constructor(values) { this.values = values; }
      get(name) { return this.values[name]; }
    },
    { location: { origin: "https://laria.audio" } }, fetch,
  );
  return mod.exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

async function harness(kind, options = {}) {
  const state = [];
  const calls = { checks: [], signups: [], profiles: [], destinations: [], refreshes: 0 };
  let index = 0;
  let mounted = false;
  const effects = [];
  const router = {
    push: (destination) => calls.destinations.push(destination),
    replace: (destination) => calls.destinations.push(destination),
    refresh: () => { calls.refreshes++; },
  };
  const exported = load(`components/${kind === "seller" ? "seller" : "store-owner"}-signup-form.tsx`, {
    react: {
      useState(initial) {
        const slot = index++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], (value) => { state[slot] = value; }];
      },
      useRef(initial) {
        const slot = index++;
        return state[slot] ??= { current: initial };
      },
      useEffect(effect) { if (!mounted) effects.push(effect); },
    },
    "next/navigation": { useRouter: () => router, useSearchParams: () => new URLSearchParams(options.next ? { next: options.next } : {}) },
    "@/components/use-form-errors": { useFormErrors: () => [{ validate: () => true, setFieldError() {}, errorFor: () => undefined, formRef: {}, onChange() {} }, null] },
    "@/lib/auth/email-check": load("lib/auth/email-check.ts", {}, async (url, init) => {
      calls.checks.push({ url, ...JSON.parse(init.body) });
      if (options.check) return options.check();
      return { ok: true, json: async () => ({ ok: true, available: true }) };
    }),
    "@/lib/auth/profile": {
      ...profile,
      async upsertBasicSellerProfile(...args) { calls.profiles.push(args); return { ok: true }; },
      async upsertStoreOwnerProfile(...args) { calls.profiles.push(args); return { ok: true }; },
    },
    "@/lib/supabase/browser-client": {
      getSupabaseBrowserClient: () => ({ auth: {
        getUser: async () => ({ data: { user: null } }),
        signUp: async (input) => {
          calls.signups.push(input);
          if (options.signUp) return options.signUp(input);
          return {
            data: { user: { id: "new-user", identities: [{ id: "email" }] }, session: null },
            error: null,
          };
        },
      } }),
    },
  }, async (url, init) => {
    calls.checks.push({ url, ...JSON.parse(init.body) });
    if (options.check) return options.check();
    return { ok: true, json: async () => ({ ok: true, available: true }) };
  });
  const Component = exported[kind === "seller" ? "SellerSignupForm" : "StoreOwnerSignupForm"];
  function render() { index = 0; return Component(); }
  render();
  mounted = true;
  for (const effect of effects) effect();
  await Promise.resolve();
  const values = {
    fullName: "Músico de prueba", email: "  MUSIC@Example.com  ", password: "test-password",
    phone: "+51 999 999 999", city: "Lima", region: "Lima", acceptedRules: "on",
  };
  return {
    calls, render,
    submit: (handler = render().props.onSubmit) => handler({ preventDefault() {}, currentTarget: values }),
    notice: () => {
      const notice = nodes(render()).find((node) => node.type?.name === "Notice");
      const body = [notice?.props.children].flat()[0];
      return { kind: notice?.props.tone, message: typeof body === "string" ? body : body?.props?.children };
    },
  };
}

for (const kind of ["seller", "store_owner"]) {
  test(`${kind}: confirmation replaces the form and names the email after signup`, async () => {
    const form = await harness(kind);
    await form.submit();
    const result = form.render();
    assert.equal(result.type.name, "SignupConfirmation");
    assert.equal(result.props.email, "music@example.com");
    assert.equal(nodes(result).some((node) => node.type === "form"), false);
    assert.equal(form.calls.signups.length, 1);
    assert.equal(form.calls.signups[0].options.data.account_type, kind);
    assert.equal(form.calls.signups[0].options.emailRedirectTo,
      "https://laria.audio/auth/callback?next=%2Fmi-cuenta%3Fconfirmed%3D1");
    assert.deepEqual(form.calls.profiles, []);
    assert.deepEqual(form.calls.destinations, []);
  });

  test(`${kind}: rapid repeated submit sends only one signup request`, async () => {
    let release;
    const check = new Promise((resolve) => { release = resolve; });
    const form = await harness(kind, { check: () => check });
    const handler = form.render().props.onSubmit;
    const pending = form.submit(handler);
    await form.submit(handler);
    assert.equal(form.calls.checks.length, 1);
    const button = nodes(form.render()).find((node) => node.props?.type === "submit");
    assert.equal(button.props.loading, true);
    release({ ok: true, json: async () => ({ ok: true, available: true }) });
    await pending;
    assert.equal(form.calls.signups.length, 1);
    assert.equal(form.render().type.name, "SignupConfirmation");
  });

  test(`${kind}: a failed request shows a retryable error instead of silent loading`, async () => {
    let failed = true;
    const form = await harness(kind, { signUp: async () => {
      if (failed) throw new TypeError("Failed to fetch: private diagnostics");
      return { data: { user: { id: "new-user", identities: [{ id: "email" }] }, session: null }, error: null };
    } });
    await form.submit();
    assert.equal(form.render().type, "form");
    assert.equal(form.notice().kind, "warning");
    assert.match(form.notice().message, /Revisa tu conexión/);
    assert.doesNotMatch(form.notice().message, /private diagnostics/);
    failed = false;
    await form.submit();
    assert.equal(form.render().type.name, "SignupConfirmation");
  });

  test(`${kind}: existing emails keep the form and never show a false success`, async () => {
    const form = await harness(kind, { check: async () => ({
      ok: true, json: async () => ({ ok: true, available: false }),
    }) });
    await form.submit();
    assert.equal(form.render().type, "form");
    assert.match(form.notice().message, /correo ya está registrado/);
    assert.equal(form.calls.signups.length, 0);
  });

  test(`${kind}: provider errors keep an error result without confirmation`, async () => {
    const form = await harness(kind, { signUp: async () => ({
      data: { user: null, session: null }, error: { message: "private diagnostics" },
    }) });
    await form.submit();
    assert.equal(form.render().type, "form");
    assert.equal(form.notice().kind, "warning");
    assert.doesNotMatch(form.notice().message, /private diagnostics/);
  });

  test(`${kind}: immediate sessions retain profile save and account navigation`, async () => {
    const form = await harness(kind, { signUp: async () => ({
      data: { user: { id: "new-user", identities: [{ id: "email" }] }, session: { access_token: "test" } },
      error: null,
    }) });
    await form.submit();
    assert.equal(form.calls.profiles.length, 1);
    assert.deepEqual(form.calls.destinations, [kind === "seller" ? "/mi-cuenta?welcome=1" : "/mi-cuenta"]);
    assert.equal(form.calls.refreshes, 1);
    assert.notEqual(form.render().type.name, "SignupConfirmation");
    await form.submit();
    assert.equal(form.calls.signups.length, 1, "navigation pending must not reopen signup");
  });
}

test("shared signup confirmation exposes next steps and uses the focused page notice", () => {
  const { SignupConfirmation } = require("../components/signup-confirmation.tsx");
  const tree = SignupConfirmation({ email: "music@example.com", message: "Cuenta creada. Revisa tu correo para confirmarla." });
  const notice = nodes(tree).find((node) => node.type?.name === "PageNotice");
  assert.equal(notice.props.kind, "success");
  assert.equal(notice.props.message, "Cuenta creada. Revisa tu correo para confirmarla.");
  const html = renderToStaticMarkup(tree);
  assert.match(html, /music@example.com/);
  assert.match(html, /spam o correo no deseado/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /<form|type="submit"/);
});

test("Particular confirmation preserves the safe return destination and resend control", async () => {
  const form = await harness("seller", { next: "/vender" });
  await form.submit();
  const result = form.render();
  assert.equal(result.props.loginHref, "/login?next=%2Fvender");
  assert.match(result.props.message, /te traerá de vuelta/);
  assert.equal(result.props.children.type.name, "ResendConfirmation");
  assert.equal(result.props.children.props.email, "music@example.com");
  assert.equal(result.props.children.props.next, "/vender");
  assert.equal(form.calls.signups[0].options.emailRedirectTo, "https://laria.audio/auth/callback?next=%2Fvender");
});
