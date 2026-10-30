const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, mocks) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "fetch", output)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports, mocks.fetch ?? fetch,
  );
  return mod.exports;
}

test("confirmation page never claims success without a confirmed session and retains the destination", async () => {
  for (const user of [null, { id: "pending" }, { id: "confirmed", email_confirmed_at: "2026-10-30" }]) {
    const { default: Page } = load("app/confirmacion-correo/page.tsx", {
      "@/lib/auth/session": { getCurrentUser: async () => user },
      "@/components/auth/confirmation-recovery": { ConfirmationRecovery: ({ next }) => require("react").createElement("div", { "data-recovery": next }) },
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ next: "/vender" }) }));
    if (user?.email_confirmed_at) {
      assert.match(html, /Tu correo ha sido confirmado/);
      assert.doesNotMatch(html, /data-recovery/);
    } else {
      assert.doesNotMatch(html, /Tu correo ha sido confirmado/);
      assert.match(html, /El enlace de confirmación ya no es válido/);
      assert.match(html, /data-recovery="\/vender"/);
      assert.match(html, /correo más reciente/);
    }
  }
});

test("resend blocks concurrent calls and the cooldown, and gives latest-email guidance", async () => {
  const state = [];
  let index = 0;
  let resolve;
  let requests = 0;
  const request = new Promise((done) => { resolve = done; });
  const ref = { current: false };
  const { ResendConfirmation } = load("components/auth/resend-confirmation.tsx", {
    react: {
      useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = value; }]; },
      useEffect() {},
      useRef: () => ref,
    },
    fetch: async () => { requests++; return request; },
  });
  const render = () => { index = 0; return ResendConfirmation({ email: "test@example.com", next: "/vender" }); };
  const click = () => render().props.children[0].props.onClick();
  const first = click();
  await click();
  assert.equal(requests, 1);
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await first;
  assert.match(render().props.children[1].props.children, /correo más reciente/);
  assert.match(render().props.children[1].props.children, /Si tu cuenta está pendiente/);
  await click();
  assert.equal(requests, 1);
});
