// Launch audit trust fixes in the application (the database side is tests/launch-audit-trust.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

function loadModule(filename, mocks) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = require("node:path").resolve(filename);
  const compiled = ts.transpileModule(read(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }) } };

test("A15: the code step and the setup share the two-step addresses, and the code is read as the app shows it", () => {
  const { twoStepPath } = require("@/lib/auth/two-step");
  const { readTwoStepCode, twoStepErrorMessage } = require("@/lib/auth/two-step-input");
  assert.equal(twoStepPath("codigo", "/admin/publicaciones?buscar=x"), "/mi-cuenta/seguridad?paso=codigo&next=%2Fadmin%2Fpublicaciones%3Fbuscar%3Dx");
  assert.equal(twoStepPath("activar", "/admin", "admin"), "/mi-cuenta/seguridad?paso=activar&next=%2Fadmin&motivo=admin");
  // Only addresses on this site come back.
  assert.equal(twoStepPath("codigo", "//evil.example"), "/mi-cuenta/seguridad?paso=codigo&next=%2Fmi-cuenta");
  assert.equal(readTwoStepCode("123 456"), "123456");
  assert.equal(readTwoStepCode(" 654321 "), "654321");
  for (const code of ["12345", "1234567", "abcdef", 123456, null]) assert.equal(readTwoStepCode(code), null, String(code));
  assert.match(twoStepErrorMessage({ status: 429 }), /muchos intentos/);
  assert.match(twoStepErrorMessage({ code: "mfa_verification_failed", status: 422 }), /no es correcto/);
  assert.match(twoStepErrorMessage({ code: "mfa_challenge_expired" }), /no es correcto/);
  assert.match(twoStepErrorMessage({ code: "unexpected_failure" }), /No pudimos completar/);
});

test("A15: requireAdmin lets in only an Admin session with the code, and sends an Admin without it to enter it", async () => {
  let user = null;
  let isAdmin = false;
  let needsCode = false;
  const redirect = (destination) => { throw new Error(`redirect:${destination}`); };
  const supabase = {
    rpc: async (name) => { assert.equal(name, "is_admin"); return { data: isAdmin, error: null }; },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Henri" } }) }) }) }),
  };
  const { twoStepPath } = require("@/lib/auth/two-step");
  const load = () => loadModule("lib/admin-server.ts", {
    react: { cache: (fn) => fn },
    "next/navigation": { redirect },
    "@/lib/auth/session": { getCurrentUser: async () => user },
    "@/lib/auth/mfa": { getAssurance: async (client) => { assert.equal(client, supabase); return { needsCode }; }, twoStepPath },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => supabase },
  });
  const { requireAdmin } = load();
  await assert.rejects(requireAdmin("/admin/tiendas"), /redirect:\/login\?next=%2Fadmin%2Ftiendas/);
  user = { id: "u1", app_metadata: {} };
  await assert.rejects(requireAdmin("/admin"), /redirect:\/mi-cuenta\?admin=denied/);
  // An Admin without an authenticator app sets it up; with one, enters its code. Both come back to the same page.
  user = { id: "u1", app_metadata: { role: "admin" } };
  await assert.rejects(requireAdmin("/admin/tiendas"), /redirect:\/mi-cuenta\/seguridad\?paso=activar&next=%2Fadmin%2Ftiendas&motivo=admin$/);
  needsCode = true;
  await assert.rejects(requireAdmin("/admin/tiendas"), /redirect:\/mi-cuenta\/seguridad\?paso=codigo&next=%2Fadmin%2Ftiendas&motivo=admin$/);
  isAdmin = true;
  const result = await requireAdmin("/admin");
  assert.equal(result.user, user);
  assert.equal(result.profile.full_name, "Henri");
});

test("A15: the header keeps the Admin link before the code, and private photos open for Admin only after it", async () => {
  const route = loadModule("app/api/account-navigation/route.ts", {
    "next/server": nextServer,
    "@/lib/payment-methods": { assistedCommerceEnabled: () => false },
    "@/lib/supabase/server-client": {
      getSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1", app_metadata: { role: "admin" } } } }) },
        from: (table) => {
          const result = table === "profiles" ? { data: { account_type: "seller", full_name: "Henri" }, error: null } : { data: null, error: null, count: 0 };
          const builder = { select: () => builder, eq: () => builder, is: () => Promise.resolve(result), maybeSingle: async () => result };
          return builder;
        },
        rpc: async (name) => ({ data: name === "is_admin" ? false : 0, error: null }),
      }),
    },
  });
  const body = await (await route.GET()).json();
  assert.equal(body.admin, true);

  const images = read("app/api/listing-images/[...path]/route.ts");
  assert.match(images, /const isAdmin = data\.user\.app_metadata\?\.role === "admin" && \(await supabase!\.rpc\("is_admin"\)\)\.data === true;/);
  assert.doesNotMatch(images, /const isAdmin = data\.user\.app_metadata\.role === "admin";/);
});

test("A15: any account that owes its code sees only the code step; Admin accounts always get the section, first for the setup", () => {
  const page = read("app/mi-cuenta/seguridad/page.tsx");
  assert.match(page, /const admin = user\?\.app_metadata\?\.role === "admin";/);
  // Every signed-in account's level is read, so one that stopped being Admin with its app still set can finish signing in.
  assert.match(page, /const supabase = user \? await getSupabaseServerClient\(\) : null;\n\s+const assurance = supabase \? await getAssurance\(supabase\) : null;/);
  assert.match(page, /if \(assurance\?\.needsCode\) \{[\s\S]*?<TwoStepVerification next=\{next\} framed=\{false\} \/>/);
  assert.match(page, /const twoStep = admin \|\| assurance\?\.hasFactor \? <TwoStepVerification next=\{next\} \/> : null;/);
  assert.match(page, /const setupFirst = admin && params\.paso === "activar";/);
  // Only addresses on this site come back.
  assert.match(page, /const next = params\.next \? getSafeAuthRedirect\(params\.next, ""\) \|\| null : null;/);
  const section = read("components/auth/two-step-verification.tsx");
  // A setup left halfway is replaced, so the QR code always matches the factor being verified.
  assert.match(section, /if \(factor\.factor_type === "totp" && factor\.status !== "verified"\) await supabase\.auth\.mfa\.unenroll\(\{ factorId: factor\.id \}\);/);
  assert.match(section, /supabase\.auth\.mfa\.challengeAndVerify\(\{ factorId, code \}\)/);
  assert.match(section, /level\.data\.currentLevel === "aal2"/);
  // A full load afterwards, so the page that asked for the code reads the new session.
  assert.match(section, /if \(next\) \{\n[^\n]*\n\s*window\.location\.assign\(next\);/);
  // Signing in with the password goes to the code step when the account has an app.
  assert.match(read("components/login-form.tsx"), /level\?\.currentLevel === "aal1" && level\.nextLevel === "aal2" \? twoStepPath\("codigo", nextPath\) : nextPath/);
});

test("A15: with an authenticator app, a recovery link asks for the code before the new password", () => {
  const form = read("components/password-form.tsx");
  // Supabase changes the password of an account with an app only in a session that passed its code, and a recovery
  // link opens one without it: the form asks for the code first, then loads the same page again.
  assert.match(form, /supabase\.auth\.mfa\.getAuthenticatorAssuranceLevel\(\)\.then\(\(\{ data \}\) => \{\n\s+if \(active && data\?\.currentLevel === "aal1" && data\.nextLevel === "aal2"\) setCodeNext\(currentAddress\(\)\);/);
  assert.match(form, /if \(error\.code === "insufficient_aal"\) return setCodeNext\(currentAddress\(\)\);/);
  assert.match(form, /if \(codeNext\) \{[\s\S]*?<TwoStepVerification next=\{codeNext\} framed=\{false\} \/>/);
  assert.match(form, /function currentAddress\(\) \{\n\s+return window\.location\.pathname \+ window\.location\.search;/);
  // The recovery link lands on the form that does this.
  assert.match(read("app/restablecer-contrasena/page.tsx"), /<PasswordUpdateForm mode="reset" \/>/);
  assert.match(read("components/password-form.tsx"), /redirectTo = window\.location\.origin \+ "\/auth\/callback\?next=\/restablecer-contrasena"/);
});

const AUTH_ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-tests" };

async function withEnv(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

async function captureWarnings(run) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await run(warnings);
  } finally {
    console.warn = original;
  }
}

// A stand-in for @supabase/ssr that records every client the route makes.
function fakeSsr(behaviour) {
  const created = [];
  return {
    created,
    module: {
      createServerClient: (url, key, options) => {
        const client = { key, options, calls: [] };
        client.auth = {
          verifyOtp: async (args) => {
            client.calls.push(["verifyOtp", args]);
            if (!behaviour.error) options.cookies.setAll([{ name: "sb-example-auth-token", value: "new-session", options: {} }]);
            return { error: behaviour.error ?? null };
          },
          exchangeCodeForSession: async (code) => { client.calls.push(["exchangeCodeForSession", code]); return { error: behaviour.error ?? null }; },
          getUser: async () => { client.calls.push(["getUser"]); return { data: { user: { id: "u1", user_metadata: {} } } }; },
          resend: async (args) => { client.calls.push(["resend", args]); return { error: behaviour.error ?? null }; },
          signInWithPassword: async (args) => { client.calls.push(["signInWithPassword", args]); return { error: behaviour.error ?? null }; },
        };
        created.push(client);
        return client;
      },
    },
  };
}

function withCookies(response) {
  response.cookies = { set: (name, value) => { response.cookieJar = { ...response.cookieJar, [name]: value }; } };
  return response;
}

const nextServerWithRedirects = {
  NextResponse: {
    json: (body, init = {}) => withCookies(nextServer.NextResponse.json(body, init)),
    redirect: (url) => withCookies(new Response(null, { status: 307, headers: { location: String(url) } })),
  },
};

function fakeNextRequest(url, { headers = {}, body } = {}) {
  const jar = new Map();
  return {
    nextUrl: new URL(url),
    headers: new Headers(headers),
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), set: (name, value) => jar.set(name, value) },
    json: async () => body,
  };
}

const forwardedKey = { key: "sb_secret_for_tests", headers: { "Sb-Forwarded-For": "203.0.113.7" } };

test("A16, A28: each visitor is counted under an HMAC of their address; a count that can't be kept is reported", async () => {
  const { createHash, createHmac } = require("node:crypto");
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests" }, () => captureWarnings(async (warnings) => {
    const calls = [];
    let reply = { data: true, error: null };
    const { clientAddress, allowRequest, checkRequest, RATE_LIMITS } = loadModule("lib/rate-limit.ts", {
      "server-only": {},
      "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return reply; } }) },
    });
    const request = (headers) => new Request("https://laria.audio/api/auth/check-email", { method: "POST", headers });
    assert.equal(clientAddress(request({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "203.0.113.7");
    assert.equal(clientAddress(request({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
    assert.equal(clientAddress(request({})), "unknown");

    assert.equal(await allowRequest(RATE_LIMITS.checkEmail, request({ "x-real-ip": "203.0.113.7" })), true);
    await allowRequest(RATE_LIMITS.checkEmail, request({ "x-real-ip": "203.0.113.7" }));
    await allowRequest(RATE_LIMITS.checkEmail, request({ "x-real-ip": "203.0.113.8" }));
    const expectedKey = createHmac("sha256", createHash("sha256").update("laria-rate-limit:service-role-key-for-tests").digest())
      .update("203.0.113.7").digest("hex");
    assert.deepEqual(calls[0], { name: "consume_rate_limit", args: { p_bucket: "auth.check_email", p_key: expectedKey, p_limit: 20, p_window_seconds: 600 } });
    assert.equal(calls[1].args.p_key, expectedKey);
    assert.notEqual(calls[2].args.p_key, expectedKey);

    const visitor = request({ "x-real-ip": "203.0.113.7" });
    assert.equal(await checkRequest(RATE_LIMITS.checkEmail, visitor), "allowed");
    reply = { data: false, error: null };
    assert.equal(await checkRequest(RATE_LIMITS.login, visitor), "limited");
    assert.equal(await allowRequest(RATE_LIMITS.login, visitor), false);
    // Before the migration the function doesn't exist yet: the e-mail check can't count, so it is told so (Codex's
    // second review); a sign-in still goes on, as before A16.
    reply = { data: null, error: { code: "PGRST202", message: "function not found" } };
    assert.equal(await checkRequest(RATE_LIMITS.checkEmail, visitor), "unavailable");
    assert.deepEqual(warnings.at(-1), ["rate-limit-unavailable", "auth.check_email", "PGRST202"]);
    assert.equal(await allowRequest(RATE_LIMITS.login, visitor), true);
    assert.deepEqual(warnings.at(-1), ["rate-limit-unavailable", "auth.login", "PGRST202"]);
    // Any other failure (a timeout, a lost grant, an odd answer) is reported and logged; the Auth routes still go on.
    const logged = warnings.length;
    for (const failing of [{ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
      { data: null, error: { code: "42501", message: "permission denied" } }, { data: null, error: null }]) {
      reply = failing;
      assert.equal(await checkRequest(RATE_LIMITS.checkEmail, visitor), "unavailable", JSON.stringify(failing));
      assert.equal(await allowRequest(RATE_LIMITS.callback, visitor), true);
    }
    assert.deepEqual(warnings.slice(logged), ["57014", "42501", "unexpected answer"].flatMap((reason) => [
      ["rate-limit-unavailable", "auth.check_email", reason], ["rate-limit-unavailable", "auth.callback", reason],
    ]));
  }));
  // Without the service role there is nothing to count with: reported, and nobody is refused a sign-in.
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }, async () => {
    const { allowRequest, checkRequest, RATE_LIMITS } = loadModule("lib/rate-limit.ts", {
      "server-only": {},
      "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    });
    assert.equal(await allowRequest(RATE_LIMITS.login, new Request("https://laria.audio/")), true);
    assert.equal(await checkRequest(RATE_LIMITS.checkEmail, new Request("https://laria.audio/")), "unavailable");
  });
});

test("A16: Auth calls from the server name the visitor's address only with a secret key", async () => {
  const { visitorAuthKey } = loadModule("lib/supabase/visitor-auth.ts", {
    "server-only": {},
    "@/lib/rate-limit": { clientAddress: (request) => request.headers.get("x-real-ip") || "unknown" },
  });
  const visitor = new Request("https://laria.audio/auth/callback", { headers: { "x-real-ip": "203.0.113.7" } });
  await withEnv({ SUPABASE_SECRET_KEY: undefined }, () => assert.equal(visitorAuthKey(visitor), null));
  // A legacy service_role JWT can't forward addresses, so it is never sent for this.
  await withEnv({ SUPABASE_SECRET_KEY: "eyJhbGciOiJIUzI1NiJ9.legacy" }, () => assert.equal(visitorAuthKey(visitor), null));
  await withEnv({ SUPABASE_SECRET_KEY: "sb_secret_for_tests" }, () => {
    assert.deepEqual(visitorAuthKey(visitor), forwardedKey);
    assert.equal(visitorAuthKey(new Request("https://laria.audio/auth/callback")), null);
  });
  // Production needs the key (docs/owner-manual.md): its absence is logged once per instance.
  await captureWarnings(async (warnings) => {
    await withEnv({ SUPABASE_SECRET_KEY: undefined, VERCEL_ENV: "preview" }, () => assert.equal(visitorAuthKey(visitor), null));
    assert.deepEqual(warnings, []);
    await withEnv({ SUPABASE_SECRET_KEY: undefined, VERCEL_ENV: "production" }, () => {
      assert.equal(visitorAuthKey(visitor), null);
      assert.equal(visitorAuthKey(visitor), null);
    });
    assert.deepEqual(warnings, [["auth-forwarding-off"]]);
  });
});

test("A16: the e-mail link callback limits each visitor, checks links under their address and says when to retry", async () => {
  const { TOO_MANY_LINK_OPENS } = require("@/lib/auth/limits");
  const run = async ({ allowed = true, forwarded = null, error = null, query = "token_hash=abc123&type=signup&next=%2Fvender" } = {}) => {
    const ssr = fakeSsr({ error });
    const route = loadModule("app/auth/callback/route.ts", {
      "@supabase/ssr": ssr.module,
      "next/server": nextServerWithRedirects,
      "@/lib/rate-limit": { RATE_LIMITS: { callback: { bucket: "auth.callback", limit: 10, windowSeconds: 600 } }, allowRequest: async () => allowed },
      "@/lib/supabase/visitor-auth": { visitorAuthKey: () => forwarded },
    });
    const response = await withEnv(AUTH_ENV, () => route.GET(fakeNextRequest(`https://laria.audio/auth/callback?${query}`)));
    const location = new URL(response.headers.get("location"));
    return { ssr, response, location, error: location.searchParams.get("error") };
  };

  const refused = await run({ allowed: false });
  assert.equal(refused.location.pathname, "/login");
  assert.equal(refused.error, TOO_MANY_LINK_OPENS);
  assert.equal(refused.ssr.created.length, 0, "a refused visitor never reaches Supabase");

  await captureWarnings(async (warnings) => {
    const limited = await run({ error: { status: 429, code: "over_request_rate_limit" } });
    assert.equal(limited.error, TOO_MANY_LINK_OPENS);
    assert.deepEqual(warnings, [["auth-callback-rate-limited", "over_request_rate_limit"]]);
  });
  for (const type of ["email", "signup"]) {
    const expired = await run({ error: { status: 403, code: "otp_expired" }, query: `token_hash=abc123&type=${type}&next=%2Fvender` });
    assert.equal(expired.location.pathname, "/confirmacion-correo");
    assert.equal(expired.location.searchParams.get("next"), "/vender");
    assert.equal(expired.response.headers.get("set-cookie"), null);
    assert.deepEqual(expired.ssr.created[0].calls.map(([name]) => name), ["verifyOtp"]);
  }
  const unsafe = await run({ error: { status: 403, code: "otp_expired" }, query: "token_hash=abc123&type=email&next=https://evil.example" });
  assert.equal(unsafe.location.searchParams.get("next"), "/mi-cuenta");
  assert.equal((await run({ error: { status: 403, code: "otp_expired" }, query: "token_hash=abc123&type=magiclink" })).error, "No se pudo confirmar la sesión.");
  assert.equal((await run({ error: { status: 403, code: "otp_expired" }, query: "token_hash=abc123&type=recovery" })).error,
    "El enlace de recuperación no es válido o ya venció.");

  // Without a secret key: one client with the anon key, as before.
  const plain = await run();
  assert.equal(plain.location.pathname + plain.location.search, "/vender");
  assert.equal(plain.ssr.created.length, 1);
  assert.equal(plain.ssr.created[0].key, "anon-key-for-tests");
  assert.equal(plain.ssr.created[0].options.global, undefined);
  assert.deepEqual(plain.ssr.created[0].calls.map(([name]) => name), ["verifyOtp", "getUser"]);
  assert.equal(plain.response.cookieJar["sb-example-auth-token"], "new-session");

  // With one: the link is checked with the secret key and the visitor's address; the profile work keeps the anon key.
  const forwarded = await run({ forwarded: forwardedKey });
  assert.equal(forwarded.location.pathname + forwarded.location.search, "/vender");
  const [verifier, reader] = forwarded.ssr.created;
  assert.equal(verifier.key, "sb_secret_for_tests");
  assert.deepEqual(verifier.options.global, { headers: { "Sb-Forwarded-For": "203.0.113.7" } });
  assert.deepEqual(verifier.calls, [["verifyOtp", { token_hash: "abc123", type: "signup" }]]);
  assert.equal(reader.key, "anon-key-for-tests");
  assert.equal(reader.options.global, undefined);
  assert.deepEqual(reader.calls.map(([name]) => name), ["getUser"]);
  assert.equal(forwarded.response.cookieJar["sb-example-auth-token"], "new-session", "the session lands in the visitor's cookies");
});

test("A16, A28: the e-mail check, the resend and the sign-in route answer 429 with an honest message", async () => {
  const { TOO_MANY_ATTEMPTS, TOO_MANY_EMAILS } = require("@/lib/auth/limits");
  const rateLimit = (allowed, verdict = allowed ? "allowed" : "limited") => ({
    RATE_LIMITS: { login: {}, checkEmail: {}, resendConfirmation: {} },
    allowRequest: async () => allowed,
    checkRequest: async () => verdict,
  });

  let rpcCalls = 0;
  const checkEmail = (verdict) => loadModule("app/api/auth/check-email/route.ts", {
    "next/server": nextServer,
    "@/lib/rate-limit": rateLimit(verdict !== "limited", verdict),
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({ rpc: async () => { rpcCalls += 1; return { data: false, error: null }; } }) },
  });
  const ask = (route) => route.POST(new Request("https://laria.audio/api/auth/check-email", { method: "POST", body: JSON.stringify({ email: "ana@example.com" }) }));
  const refusedCheck = await ask(checkEmail("limited"));
  assert.equal(refusedCheck.status, 429);
  assert.deepEqual(await refusedCheck.json(), { ok: false, available: false, message: TOO_MANY_ATTEMPTS });
  // When the count can't be kept, the route says nothing about the address.
  const uncounted = await ask(checkEmail("unavailable"));
  assert.equal(uncounted.status, 503);
  assert.deepEqual(await uncounted.json(), { ok: false, available: false, message: "No se pudo verificar el correo en este momento." });
  assert.equal(rpcCalls, 0);
  assert.deepEqual(await (await ask(checkEmail("allowed"))).json(), { ok: true, available: true });
  assert.equal(rpcCalls, 1);

  const resend = async ({ allowed = true, forwarded = null, error = null } = {}) => {
    const ssr = fakeSsr({ error });
    const route = loadModule("app/api/auth/resend-confirmation/route.ts", {
      "@supabase/ssr": ssr.module,
      "next/server": nextServerWithRedirects,
      "@/lib/rate-limit": rateLimit(allowed),
      "@/lib/supabase/visitor-auth": { visitorAuthKey: () => forwarded },
    });
    const request = fakeNextRequest("https://laria.audio/api/auth/resend-confirmation", { body: { email: "ana@example.com", next: "/vender" } });
    const response = await withEnv(AUTH_ENV, () => route.POST(request));
    return { ssr, status: response.status, body: await response.json() };
  };
  const refusedResend = await resend({ allowed: false });
  assert.deepEqual([refusedResend.status, refusedResend.body.message, refusedResend.ssr.created.length], [429, TOO_MANY_EMAILS, 0]);
  const limitedResend = await resend({ error: { status: 429, code: "over_email_send_rate_limit" } });
  assert.deepEqual([limitedResend.status, limitedResend.body.message], [429, TOO_MANY_EMAILS]);
  const forwardedResend = await resend({ forwarded: forwardedKey });
  assert.equal(forwardedResend.status, 200);
  assert.equal(forwardedResend.ssr.created[0].key, "sb_secret_for_tests");
  assert.deepEqual(forwardedResend.ssr.created[0].options.global, { headers: { "Sb-Forwarded-For": "203.0.113.7" } });
  assert.equal(forwardedResend.ssr.created[0].calls[0][1].options.emailRedirectTo, "https://laria.audio/auth/callback?next=%2Fvender");

  const login = async ({ allowed = true, error = null } = {}) => {
    const ssr = fakeSsr({ error });
    const route = loadModule("app/api/auth/login/route.ts", {
      "@supabase/ssr": ssr.module,
      "next/server": nextServerWithRedirects,
      "@/lib/rate-limit": rateLimit(allowed),
      "@/lib/supabase/visitor-auth": { visitorAuthKey: () => null },
    });
    const request = fakeNextRequest("https://laria.audio/api/auth/login", { body: { email: "ana@example.com", password: "una-clave-larga" } });
    const response = await withEnv(AUTH_ENV, () => route.POST(request));
    return { ssr, status: response.status, body: await response.json() };
  };
  const refusedLogin = await login({ allowed: false });
  assert.deepEqual([refusedLogin.status, refusedLogin.body.message, refusedLogin.ssr.created.length], [429, TOO_MANY_ATTEMPTS, 0]);
  const limitedLogin = await login({ error: { status: 429, code: "over_request_rate_limit" } });
  assert.deepEqual([limitedLogin.status, limitedLogin.body.message], [429, TOO_MANY_ATTEMPTS]);
  const wrongPassword = await login({ error: { status: 400, code: "invalid_credentials" } });
  assert.deepEqual([wrongPassword.status, wrongPassword.body.message], [401, "No se pudo iniciar sesión. Revisa tu correo y contraseña."]);
});

test("A15, A16: the migration caps its lock waits, and the counter's sweep is bounded and indexed", () => {
  const migration = read("supabase/migrations/20261113120000_launch_audit_trust.sql");
  assert.match(migration, /\nset lock_timeout = '10s';\n/);
  assert.ok(migration.indexOf("set lock_timeout") < migration.indexOf("drop policy"), "set before the first lock");
  assert.match(migration, /\nreset lock_timeout;\n$/);
  assert.match(migration, /create index if not exists rate_limit_hits_window_start_idx on laria_private\.rate_limit_hits \(window_start\);/);
  const sweep = migration.indexOf("if random() < 0.02 then");
  assert.ok(sweep > 0 && sweep < migration.indexOf("insert into laria_private.rate_limit_hits as h"), "the sweep runs before the count");
  assert.match(migration, /where window_start < now\(\) - interval '1 day'\n\s+limit 500\n\s+for update skip locked/);
});

test("A16: the forms sign in from the browser and say when a limit was reached", () => {
  const login = read("components/login-form.tsx");
  assert.match(login, /getSupabaseBrowserClient\(\)[\s\S]*auth\.signInWithPassword\(\{ email, password \}\)/);
  assert.doesNotMatch(login, /fetch\("\/api\/auth\/login"/);
  assert.match(login, /isAuthRateLimited\(error\)[\s\S]{0,80}TOO_MANY_ATTEMPTS/);

  const seller = read("components/seller-signup-form.tsx");
  assert.match(seller, /setMessage\(isAuthRateLimited\(error\) \? SIGN_UP_PAUSED :/);
  const store = read("components/store-owner-signup-form.tsx");
  assert.match(store, /if \(isAuthRateLimited\(error\)\) \{\s*setState\("error"\);\s*setMessage\(SIGN_UP_PAUSED\);/);

  assert.match(read("components/password-form.tsx"), /isAuthRateLimited\(error\)\s*\? TOO_MANY_EMAILS/);
});

// The answers the e-mail check gives, for a mocked fetch.
function mockCheckEmail() {
  const asked = [];
  const mock = { asked, answer: { status: 200, body: { ok: true, available: true } } };
  mock.fetch = async (url, init) => {
    asked.push([url, init.method, JSON.parse(init.body)]);
    if (mock.answer instanceof Error) throw mock.answer;
    const body = typeof mock.answer.body === "string" ? mock.answer.body : JSON.stringify(mock.answer.body);
    return new Response(body, { status: mock.answer.status, headers: { "Content-Type": "application/json" } });
  };
  return mock;
}

test("A28: the sign-up check says whether an address has an account, or that it can't say", async () => {
  const { checkEmailAvailability } = require("@/lib/auth/email-check");
  const check = mockCheckEmail();
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = check.fetch;
  try {
    const cases = [
      [{ status: 200, body: { ok: true, available: true } }, "available"],
      [{ status: 200, body: { ok: true, available: false } }, "exists"],
      [{ status: 429, body: { ok: false, available: false } }, "limited"],
      [{ status: 503, body: { ok: false, available: false, message: "No se pudo verificar el correo en este momento." } }, "unknown"],
      [{ status: 500, body: { ok: false, available: false } }, "unknown"],
      [{ status: 200, body: "<html>" }, "unknown"],
      [{ status: 200, body: { ok: true } }, "unknown"],
      [new TypeError("fetch failed"), "unknown"],
    ];
    for (const [answer, expected] of cases) {
      check.answer = answer;
      assert.equal(await checkEmailAvailability("ana@example.com"), expected, answer instanceof Error ? answer.message : JSON.stringify(answer));
    }
    assert.deepEqual(check.asked[0], ["/api/auth/check-email", "POST", { email: "ana@example.com" }]);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test("A28: Supabase's sign-up answer is read as the account asked for only when it is a new or pending one of that type", () => {
  const { signUpFoundExistingAccount } = require("@/lib/auth/email-check");
  const cases = [
    [null, false],
    [{ identities: [], user_metadata: {} }, true],
    [{ identities: [], user_metadata: { account_type: "seller" } }, true],
    [{ identities: [{ id: "i" }], user_metadata: { account_type: "seller" } }, false],
    [{ identities: [{ id: "i" }], user_metadata: { account_type: "store_owner" } }, true],
    [{ identities: [{ id: "i" }], user_metadata: {} }, true],
    [{ identities: [{ id: "i" }] }, false],
  ];
  for (const [user, expected] of cases) assert.equal(signUpFoundExistingAccount(user, "seller"), expected, JSON.stringify(user));
});

test("A14 (AUTH-002): with Auth's autoconfirm on, Supabase's user_already_exists error is read as an existing account, and no other error is", () => {
  const { signUpErrorFoundExistingAccount } = require("@/lib/auth/email-check");
  const cases = [
    [null, false],
    [undefined, false],
    [{ code: "user_already_exists", status: 422, message: "User already registered" }, true],
    [{ code: "email_exists", status: 422 }, false],
    [{ code: "over_email_send_rate_limit", status: 429 }, false],
    [{ status: 500, message: "User already registered" }, false],
  ];
  for (const [error, expected] of cases) assert.equal(signUpErrorFoundExistingAccount(error), expected, JSON.stringify(error));
});

// A sign-up form, rendered with its hooks recorded, submitted with the given address.
function signupHarness(file, name) {
  const state = [];
  let hookIndex = 0;
  let mounted = false;
  const effects = [];
  const calls = { signUps: [], fieldErrors: {} };
  // By default Supabase's answer for a new address: the account just made, with the data the form sent.
  let signUpAnswer = (input) => ({ data: { user: { id: "u-1", identities: [{ id: "i-1" }], user_metadata: { ...input.options.data, email: input.email } }, session: null }, error: null });
  const Notice = function Notice() { return null; };
  const component = loadModule(file, {
    react: {
      useState(initial) {
        const index = hookIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useRef(initial) {
        const index = hookIndex++;
        return state[index] ??= { current: initial };
      },
      useEffect(effect) { if (!mounted) effects.push(effect); },
    },
    "next/link": { __esModule: true, default: () => null },
    "next/navigation": { useRouter: () => ({ push() {}, replace() {}, refresh() {} }), useSearchParams: () => new URLSearchParams("") },
    "@/components/use-form-errors": {
      useFormErrors: () => [{ validate: () => true, setFieldError: (field, message) => { calls.fieldErrors[field] = message; }, formRef: {}, onChange() {}, errorFor: () => undefined }, null],
    },
    "@/lib/supabase/browser-client": {
      getSupabaseBrowserClient: () => ({ auth: {
        getUser: async () => ({ data: { user: null } }),
        signUp: async (input) => { calls.signUps.push(input.email); return typeof signUpAnswer === "function" ? signUpAnswer(input) : signUpAnswer; },
      } }),
    },
    "@/lib/auth/profile": {
      INDIVIDUAL_SELLER_ACCOUNT_TYPE: "seller", STORE_OWNER_ACCOUNT_TYPE: "store_owner",
      upsertBasicSellerProfile: async () => ({ ok: true }), upsertStoreOwnerProfile: async () => ({ ok: true }),
      validateSellerProfileInput: (profile) => ({ ok: true, profile }),
    },
    "@/components/ui/button": { Button: () => null },
    "@/components/ui/field": { Field: () => null, Input: () => null },
    "@/components/ui/notice": { Notice },
    "@/components/ui/password-input": { PasswordInput: () => null },
    "@/components/ui/phone-input": { PhoneInput: () => null },
    "@/components/location-fields": { LocationFields: () => null },
    "@/components/auth/resend-confirmation": { ResendConfirmation: () => null },
  })[name];
  const render = () => {
    hookIndex = 0;
    const tree = component();
    if (!mounted) {
      mounted = true;
      for (const effect of effects) effect();
    }
    return tree;
  };
  const find = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const child of node) { const found = find(child); if (found) return found; } return null; }
    return node.type === Notice ? node : find(node.props?.children);
  };
  return {
    calls,
    signUpAnswers(answer) { signUpAnswer = answer; },
    async submit(email) {
      const fields = { fullName: "Ana Pérez", email, password: "clave-segura-2026", acceptedRules: "on", phone: "987654321", city: "Lima", region: "Lima" };
      render();
      await Promise.resolve();
      await render().props.onSubmit({ preventDefault() {}, currentTarget: { fields } });
    },
    // The confirmation replaces the form; errors still use its notice.
    message() {
      const tree = render();
      if (tree.type?.name === "SignupConfirmation") return tree.props.message;
      const notice = find(tree);
      const first = notice ? [notice.props.children].flat()[0] : null;
      return typeof first === "string" ? first : first?.props?.children ?? null;
    },
  };
}

test("A28: a sign-up goes on to Supabase when the e-mail check can't answer, and stops when it's limited or the address has an account", async () => {
  const { TOO_MANY_ATTEMPTS } = require("@/lib/auth/limits");
  const check = mockCheckEmail();
  const before = { fetch: globalThis.fetch, FormData: globalThis.FormData, window: globalThis.window };
  globalThis.fetch = check.fetch;
  globalThis.FormData = class { constructor(form) { this.fields = form.fields; } get(field) { return field in this.fields ? this.fields[field] : null; } };
  globalThis.window = { location: { origin: "https://laria.audio" } };
  const forms = [
    { file: "components/seller-signup-form.tsx", name: "SellerSignupForm", type: "seller", other: "store_owner", sent: /^Cuenta creada\. Revisa tu correo para confirmar tu cuenta\./,
      exists: "Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo." },
    { file: "components/store-owner-signup-form.tsx", name: "StoreOwnerSignupForm", type: "store_owner", other: "seller", sent: /^Cuenta creada\. Revisa tu correo para confirmar la cuenta de Tienda\./,
      exists: "Ese correo ya está registrado. Usa un correo exclusivo para la Tienda." },
  ];
  try {
    for (const form of forms) {
      // Codex's third review of #55: while the check can't count it answers 503, and the sign-up still goes on.
      for (const answer of [{ status: 503, body: { ok: false, available: false, message: "No se pudo verificar el correo en este momento." } }, { status: 500, body: { ok: false } }, new TypeError("fetch failed")]) {
        const signup = signupHarness(form.file, form.name);
        check.answer = answer;
        await signup.submit("nueva@example.com");
        assert.deepEqual(signup.calls.signUps, ["nueva@example.com"], `${form.name} ${answer.status ?? answer.message}`);
        assert.match(signup.message(), form.sent, form.name);
      }
      // Supabase's sign-up still finds an address that has an account: a confirmed one comes back without identities.
      check.answer = { status: 503, body: { ok: false, available: false } };
      const duplicate = signupHarness(form.file, form.name);
      duplicate.signUpAnswers({ data: { user: { id: "u-2", identities: [], user_metadata: {} }, session: null }, error: null });
      await duplicate.submit("ana@example.com");
      assert.deepEqual(duplicate.calls.signUps, ["ana@example.com"]);
      assert.equal(duplicate.message(), form.exists, form.name);
      assert.equal(duplicate.calls.fieldErrors.email, form.exists, form.name);
      // A14 (AUTH-002): with Auth's autoconfirm on, Supabase answers the error user_already_exists instead. Same message.
      const autoconfirmed = signupHarness(form.file, form.name);
      autoconfirmed.signUpAnswers({ data: { user: null, session: null }, error: { code: "user_already_exists", status: 422, message: "User already registered" } });
      await autoconfirmed.submit("ana@example.com");
      assert.equal(autoconfirmed.message(), form.exists, form.name);
      assert.equal(autoconfirmed.calls.fieldErrors.email, form.exists, form.name);
      // Any other error is a failed sign-up, not an account.
      const failed = signupHarness(form.file, form.name);
      failed.signUpAnswers({ data: { user: null, session: null }, error: { code: "unexpected_failure", status: 500, message: "Database error saving new user" } });
      await failed.submit("ana@example.com");
      assert.match(failed.message(), /^No se pudo crear la cuenta\./, form.name);
      assert.equal(failed.calls.fieldErrors.email, undefined, form.name);
      // Codex's fourth review of #55: an account of the other type still waiting for its confirmation comes back as it
      // was registered, with its identity (Supabase sent its confirmation again). It is not the account asked for.
      for (const metadata of [{ account_type: form.other, full_name: "Ana Pérez" }, { full_name: "Ana Pérez" }]) {
        const pending = signupHarness(form.file, form.name);
        pending.signUpAnswers({ data: { user: { id: "u-3", identities: [{ id: "i-3" }], user_metadata: metadata }, session: null }, error: null });
        await pending.submit("pendiente@example.com");
        assert.deepEqual(pending.calls.signUps, ["pendiente@example.com"], form.name);
        assert.equal(pending.message(), form.exists, `${form.name} ${JSON.stringify(metadata)}`);
        assert.equal(pending.calls.fieldErrors.email, form.exists, form.name);
      }
      // One of the same type still waiting is the account asked for: its confirmation went out again.
      const sameType = signupHarness(form.file, form.name);
      sameType.signUpAnswers({ data: { user: { id: "u-4", identities: [{ id: "i-4" }], user_metadata: { account_type: form.type, full_name: "Ana" } }, session: null }, error: null });
      await sameType.submit("pendiente@example.com");
      assert.match(sameType.message(), form.sent, form.name);
      // Over the visitor's limit, or an address with an account: no sign-up.
      const limited = signupHarness(form.file, form.name);
      check.answer = { status: 429, body: { ok: false, available: false } };
      await limited.submit("otra@example.com");
      assert.deepEqual(limited.calls.signUps, [], form.name);
      assert.equal(limited.message(), TOO_MANY_ATTEMPTS, form.name);
      const exists = signupHarness(form.file, form.name);
      check.answer = { status: 200, body: { ok: true, available: false } };
      await exists.submit("ana@example.com");
      assert.deepEqual(exists.calls.signUps, [], form.name);
      assert.equal(exists.message(), form.exists, form.name);
      assert.equal(exists.calls.fieldErrors.email, form.exists, form.name);
      // A free address signs up.
      const free = signupHarness(form.file, form.name);
      check.answer = { status: 200, body: { ok: true, available: true } };
      await free.submit("libre@example.com");
      assert.deepEqual(free.calls.signUps, ["libre@example.com"], form.name);
    }
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
