const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, mocks = {}, transform = (value) => value) {
  const filename = path.resolve(file);
  const compiled = ts.transpileModule(transform(fs.readFileSync(filename, "utf8")), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(compiled, filename);
  return mod.exports;
}

function logoutSession() {
  const state = { authenticated: true, clientCalls: 0, signOutCalls: 0, clearedCookies: [] };
  const route = load("app/logout/route.ts", {
    "@/lib/supabase/server-client": {
      async getSupabaseServerClient() {
        state.clientCalls++;
        return { auth: { async signOut() {
          state.signOutCalls++;
          state.authenticated = false;
          state.clearedCookies.push("sb-session");
          return { error: null };
        } } };
      },
    },
  });
  return { route, state };
}

test("passive GET, Next prefetch and crawler requests preserve the session; explicit POST signs out", async () => {
  const { route, state } = logoutSession();
  for (const headers of [
    {},
    { "next-router-prefetch": "1", rsc: "1" },
    { purpose: "prefetch", "sec-purpose": "prefetch" },
    { "user-agent": "crawler" },
  ]) {
    const response = await route.GET(new Request("https://laria.audio/logout", { headers }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(state.authenticated, true);
    assert.equal(state.clientCalls, 0);
    assert.equal(state.signOutCalls, 0);
    assert.deepEqual(state.clearedCookies, []);
  }

  const response = await route.POST(new Request("https://laria.audio/logout", {
    method: "POST",
    headers: { origin: "https://laria.audio", "sec-fetch-site": "same-origin" },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://laria.audio/login");
  assert.equal(state.clientCalls, 1);
  assert.equal(state.signOutCalls, 1);
  assert.equal(state.authenticated, false);
  assert.deepEqual(state.clearedCookies, ["sb-session"]);
});

test("logout rejects foreign, missing, null and misleading Origins before accessing Supabase", async () => {
  const { route, state } = logoutSession();
  for (const headers of [
    {},
    { origin: "null" },
    { origin: "https://evil.example" },
    { origin: "https://laria.audio.evil.example" },
    { origin: "http://laria.audio" },
    { origin: "https://laria.audio:444" },
    { origin: "https://laria.audio", "sec-fetch-site": "cross-site" },
  ]) {
    const response = await route.POST(new Request("https://laria.audio/logout", { method: "POST", headers }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(state.authenticated, true);
  assert.equal(state.clientCalls, 0);
  assert.equal(state.signOutCalls, 0);
});

test("logout preserves the login redirect without a configured Supabase client", async () => {
  const route = load("app/logout/route.ts", {
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => null },
  });
  const response = await route.POST(new Request("http://localhost:3000/logout", {
    method: "POST", headers: { origin: "http://localhost:3000" },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost:3000/login");
});

test("explicit logout retains Supabase SSR cookie cleanup and global session revocation", async () => {
  const { createServerClient } = require("@supabase/ssr");
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "fixture", exp: expiresAt })}.fixture`,
    refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600,
    token_type: "bearer", user: { id: "fixture" },
  };
  const cookieName = "sb-hotfix-auth-token";
  const cookieValues = new Map([[cookieName, `base64-${encode(session)}`]]);
  const writes = [];
  const requests = [];
  const serverClient = load("lib/supabase/server-client.ts", {
    "next/headers": { cookies: async () => ({
      getAll: () => [...cookieValues].map(([name, value]) => ({ name, value })),
      set(name, value, options) { writes.push({ name, value, options }); cookieValues.set(name, value); },
    }) },
    "@supabase/ssr": { createServerClient: (url, key, options) => createServerClient(url, key, {
      ...options,
      global: { fetch: async (url, options) => {
        requests.push({ url: String(url), method: options.method });
        return new Response(null, { status: 204 });
      } },
    }) },
  });
  const route = load("app/logout/route.ts", { "@/lib/supabase/server-client": serverClient });
  try {
    // The transport above is stubbed: no hosted auth or database is contacted.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hotfix.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
    await route.GET(new Request("https://laria.audio/logout", { headers: { "next-router-prefetch": "1" } }));
    assert.deepEqual(writes, []);
    assert.deepEqual(requests, []);
    assert.ok(cookieValues.get(cookieName));

    const response = await route.POST(new Request("https://laria.audio/logout", {
      method: "POST", headers: { origin: "https://laria.audio" },
    }));
    assert.equal(response.status, 303);
    assert.deepEqual(requests, [{ url: "https://hotfix.supabase.co/auth/v1/logout?scope=global", method: "POST" }]);
    assert.equal(cookieValues.get(cookieName), "");
    assert.ok(writes.some(({ name, value, options }) => name === cookieName && value === "" && options.maxAge === 0));
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});

function navigationMocks(pathname) {
  return {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { usePathname: () => pathname, useRouter: () => ({}) },
    "@/components/logout-button": load("components/logout-button.tsx"),
    "@/lib/account-navigation": load("lib/account-navigation.ts"),
    "@/lib/site": load("lib/site.ts"),
  };
}

function assertLogoutForms(html, count) {
  assert.equal((html.match(/<form action="\/logout" method="post">/g) ?? []).length, count);
  assert.equal((html.match(/<button type="submit"/g) ?? []).length, count);
  assert.doesNotMatch(html, /<a[^>]*href="\/logout"/);
}

test("desktop/mobile Admin and both account roles render explicit logout submit controls", () => {
  const { AdminNavigation } = load("components/admin-navigation.tsx", navigationMocks("/admin/transacciones"));
  const adminHtml = renderToStaticMarkup(React.createElement(AdminNavigation, { counts: null, userName: "Admin" }));
  assertLogoutForms(adminHtml, 2);
  assert.equal((adminHtml.match(/href="\/admin\/transacciones" aria-current="page"/g) ?? []).length, 2);
  const { AccountNavigation } = load("components/account-navigation.tsx", navigationMocks("/mi-cuenta"));
  for (const accountType of ["seller", "store_owner"]) {
    assertLogoutForms(renderToStaticMarkup(React.createElement(AccountNavigation, {
      accountType, hasStore: accountType === "store_owner", unreadNotifications: 0, pendingBuyerConfirmations: 0,
    })), 2);
  }
});

test("store registration's account gate uses the same explicit logout form", async () => {
  const { default: RegisterStorePage } = load("app/registrar-tienda/page.tsx", {
    ...navigationMocks("/registrar-tienda"),
    "@/components/page-container": { PageContainer: ({ children }) => React.createElement("section", null, children) },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "seller" } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: "seller" } }) }) }) }),
    }) },
  });
  assertLogoutForms(renderToStaticMarkup(await RegisterStorePage()), 1);
});

function renderAdminFixtures(legacyFormatter = false) {
  const common = {
    ...navigationMocks("/admin/transacciones"),
    "next/image": ({ unoptimized, ...props }) => React.createElement("img", { ...props, "data-unoptimized": String(unoptimized) }),
    "@/lib/admin": load("lib/admin.ts"),
    "@/lib/instrument-filters": load("lib/instrument-filters.ts"),
    "@/lib/supabase/browser-client": { getSupabaseBrowserClient: () => null },
  };
  const workbench = load("components/admin-workbench.tsx", common,
    (value) => legacyFormatter ? value.replace('  timeZone: "America/Lima",\n', "") : value);
  const { AdminDomainView } = load("components/admin-domain-view.tsx", {
    ...common,
    "@/components/admin-workbench": workbench,
    "@/components/admin-invite-user": {},
    "@/components/admin-record-editors": {},
  });
  const counts = { publicaciones: 1, revisiones: 0, tiendas: 0, verificacion: 0, reportes: 0, resenas: 0 };
  const item = { id: "fixture", created_at: "2026-09-26T02:30:00Z", title: "Guitarra QA", price_pen: 1234.5, status: "pending" };
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  return {
    date: workbench.adminDate(item.created_at),
    missingDate: workbench.adminDate(""),
    navigation: render(load("components/admin-navigation.tsx", common).AdminNavigation, { counts, userName: "Admin" }),
    workbench: render(workbench.AdminWorkbench, {
      selectedQueue: "publicaciones", payload: { counts, items: [item], total: 1, page: 1, page_size: 20 },
      fallbackCounts: counts, loadError: null,
    }),
    transactions: render(AdminDomainView, {
      domain: "transacciones", payload: { items: [item], total: 1, page: 1, page_size: 24 },
      search: "", status: "", ownerType: "", targetType: "", reason: "", userSearch: "", userPage: 1, loadError: null,
    }),
  };
}

function renderInTimeZone(timeZone, legacyFormatter = false) {
  const script = `
    const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
    const ts = require("typescript"), React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    ${load.toString()}
    ${navigationMocks.toString()}
    ${renderAdminFixtures.toString()}
    process.stdout.write(JSON.stringify(renderAdminFixtures(${legacyFormatter})));
  `;
  const result = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: timeZone }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("Admin first-render fixtures reproduce the original timezone mismatch and stay identical after the fix", () => {
  const oldUtc = renderInTimeZone("UTC", true);
  const oldLima = renderInTimeZone("America/Lima", true);
  assert.notEqual(oldUtc.date, oldLima.date);
  assert.notEqual(oldUtc.workbench, oldLima.workbench);
  assert.notEqual(oldUtc.transactions, oldLima.transactions);

  const serverRender = renderInTimeZone("UTC");
  for (const clientTimeZone of ["America/Lima", "Asia/Tokyo"]) {
    assert.deepEqual(renderInTimeZone(clientTimeZone), serverRender);
  }
  assert.match(serverRender.date, /25.*2026.*9:30/);
  assert.equal(serverRender.missingDate, "Sin fecha");
});
