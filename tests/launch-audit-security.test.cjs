// Launch audit security fixes in the application: A11 headers, A22 same-origin guard, A24 image allowlist, A09 store
// identity rule (the database side is tests/launch-audit-security.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { contentSecurityPolicy, securityHeaders } = require("@/lib/security-headers");
const { isRefusedCrossSiteApiWrite, isSameOriginRequest } = require("@/lib/same-origin");
const { storeIdentityChanged } = require("@/lib/store-profile");

const SUPABASE = "https://hswkjandadscduodejig.supabase.co";
const directive = (policy, name) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

test("A11: production CSP keeps scripts and data on Laria and its Supabase project", () => {
  const policy = contentSecurityPolicy({ supabaseUrl: SUPABASE, vercelEnv: "production", nodeEnv: "production" });
  assert.equal(directive(policy, "default-src"), "default-src 'self'");
  // 'unsafe-eval' only for libheif in heic2any (lib/security-headers.ts).
  assert.equal(directive(policy, "script-src"), "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  assert.equal(directive(policy, "connect-src"), `connect-src 'self' ${SUPABASE} wss://hswkjandadscduodejig.supabase.co`);
  assert.match(directive(policy, "img-src"), new RegExp(`'self' data: blob: ${SUPABASE}$`));
  assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive(policy, "object-src"), "object-src 'none'");
  assert.equal(directive(policy, "form-action"), "form-action 'self'");
  assert.doesNotMatch(policy, /placehold\.co|vercel\.live|unsplash/);
  // A malformed or missing Supabase URL never produces a broken source list.
  assert.doesNotMatch(contentSecurityPolicy({ supabaseUrl: "not a url", vercelEnv: "production" }), /null|undefined/);
});

test("A11: development and previews add only what their tooling needs", () => {
  const dev = contentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321", nodeEnv: "development" });
  assert.match(directive(dev, "connect-src"), /http:\/\/127\.0\.0\.1:54321 ws:\/\/127\.0\.0\.1:54321 ws:/);
  assert.match(directive(dev, "img-src"), /https:\/\/placehold\.co/);
  const preview = contentSecurityPolicy({ supabaseUrl: SUPABASE, vercelEnv: "preview", nodeEnv: "production" });
  assert.match(directive(preview, "script-src"), /https:\/\/vercel\.live/);
  assert.equal(directive(preview, "frame-src"), "frame-src https://vercel.live");
  assert.doesNotMatch(directive(preview, "connect-src"), /ws:(?!\/\/)/);
});

test("A11: every response gets the framing, sniffing, referrer and permissions headers", () => {
  const headers = Object.fromEntries(securityHeaders({ supabaseUrl: SUPABASE, vercelEnv: "production" }).map(({ key, value }) => [key, value]));
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin");
  // The inventory counter scans barcodes and sound clips are recorded on Laria's own pages.
  assert.match(headers["Permissions-Policy"], /camera=\(self\), microphone=\(self\), geolocation=\(\)/);
  const config = fs.readFileSync("next.config.ts", "utf8");
  assert.match(config, /source: "\/:path\*",\n\s+headers: securityHeaders\(/);
  assert.ok(fs.existsSync("app/api/csp-report/route.ts"), "CSP reports have somewhere to go");
});

test("A24: the image optimizer only resizes Laria's own public photos", () => {
  const config = fs.readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(config, /unsplash/);
  assert.match(config, /process\.env\.VERCEL_ENV === "production"\n\s+\? \[\]\n\s+: \[\{ protocol: "https" as const, hostname: "placehold\.co"/);
  assert.match(config, /\["listing-photos", "store-assets"\]\.map/);
  assert.match(config, /pathname: `\/storage\/v1\/object\/public\/\$\{bucket\}\/\*\*`/);
  assert.doesNotMatch(config, /pathname: "\/storage\/v1\/object\/public\/\*\*"/);
});

test("A22: middleware refuses cross-site writes to every API route but the secret- or token-authenticated ones", () => {
  const post = (path, headers = {}) => new Request(`https://laria.audio${path}`, { method: "POST", headers });
  const evil = { Origin: "https://evil.example" };
  for (const path of ["/api/listings/1/manage", "/api/listings/1/photo-cleanup", "/api/store/inventory", "/api/submissions", "/api/admin/invite-user", "/api/auth/login"]) {
    assert.equal(isRefusedCrossSiteApiWrite(post(path, evil), path), true, path);
    assert.equal(isRefusedCrossSiteApiWrite(post(path, { "Sec-Fetch-Site": "cross-site" }), path), true, path);
    assert.equal(isRefusedCrossSiteApiWrite(post(path, { Origin: "https://laria.audio", "Sec-Fetch-Site": "same-origin" }), path), false, path);
    // Server-to-server calls without browser headers aren't a CSRF vector; the route's own auth decides.
    assert.equal(isRefusedCrossSiteApiWrite(post(path), path), false, path);
  }
  for (const path of ["/api/internal/email/process", "/api/email/unsubscribe", "/api/csp-report"]) {
    assert.equal(isRefusedCrossSiteApiWrite(post(path, evil), path), false, path);
  }
  // Prefixes don't leak: only the exact unsubscribe route is exempt.
  assert.equal(isRefusedCrossSiteApiWrite(post("/api/email/unsubscribe-all", evil), "/api/email/unsubscribe-all"), true);
  assert.equal(isRefusedCrossSiteApiWrite(new Request("https://laria.audio/api/catalog/page", { headers: evil }), "/api/catalog/page"), false);
  assert.equal(isRefusedCrossSiteApiWrite(post("/listados", evil), "/listados"), false);
  assert.equal(isSameOriginRequest(new Request("https://laria.audio/api/events", { headers: { Origin: "https://www.laria.audio" } })), false);

  const middleware = fs.readFileSync("middleware.ts", "utf8");
  assert.match(middleware, /"\/api\/\(\(\?!catalog\/\|listing-images\/\)\.\*\)"/);
  assert.match(middleware, /if \(isRefusedCrossSiteApiWrite\(request, pathname\)\)/);
});

test("A09: the store form and the database agree on what changes a verified identity", () => {
  const before = { name: "Casa Musical Grau", ruc: "20100047218", razon_social: "CASA MUSICAL GRAU SAC" };
  assert.equal(storeIdentityChanged(before, { name: "  casa  musical GRAU ", ruc: "20100047218", razon_social: "Casa Musical Grau SAC" }), false);
  assert.equal(storeIdentityChanged(before, { ...before, name: "Yamaha Oficial Peru" }), true);
  assert.equal(storeIdentityChanged(before, { ...before, ruc: "20999999991" }), true);
  assert.equal(storeIdentityChanged(before, { ...before, razon_social: "OTRA EMPRESA SAC" }), true);
  const form = fs.readFileSync("components/store-registration-form.tsx", "utf8");
  assert.match(form, /verifiedAtStake = Boolean\(store\?\.is_verified && storeIdentityChanged\(store, fields\)\)/);
  assert.match(form, /name="name" error=\{validation\.errorFor\("name"\)\} defaultValue=\{defaults\.name\} onInput=\{watchBusiness\}/);
  const workbench = fs.readFileSync("components/admin-workbench.tsx", "utf8");
  assert.match(workbench, /mutation=\{\{ kind: "verification", id, verified: false \}\}\n\s+label="Dejar sin verificar"/);
});

// Runs a route with its server-only modules mocked (as tests/sprint-7.test.cjs does).
function loadRoute(filename, mocks) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = require("node:path").resolve(filename);
  const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

test("A35: a draft kept on a device renews its token for the same submission, and only its owner can", async () => {
  const crypto = require("node:crypto");
  const tokens = require("@/lib/submission-token");
  const owner = crypto.randomUUID();
  const service = "service-role-key-for-tests";
  let signedIn = owner;
  const server = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: signedIn } : null }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "QA", phone: "51999999999", city: "Lima", region: "Lima", account_type: "seller" }, error: null }) }) }) }),
  };
  const route = loadRoute("app/api/submissions/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } }) } },
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => ({}) },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => server },
    "@/lib/marketplace-events-server": { getMarketplaceSession: async () => null, recordMarketplaceEvent: async () => undefined },
  });
  const post = async (body) => {
    const response = await route.POST(new Request("https://laria.audio/api/submissions", { method: "POST", body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const signed = (value, key) => {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${payload}.${crypto.createHmac("sha256", key).update(`marketplace-submission:${payload}`).digest("base64url")}`;
  };
  const saved = { own: process.env.SUBMISSION_TOKEN_SECRET, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    delete process.env.SUBMISSION_TOKEN_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = service;
    const secret = tokens.submissionTokenSecret();
    // Saved on a phone before tokens expired: no exp, signed with the service role key itself.
    const id = crypto.randomUUID();
    const legacy = signed({ id, kind: "listing", ownerUserId: owner }, service);
    const refused = await post({ action: "complete", token: legacy, fields: {} });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.renew, true);
    assert.equal(refused.body.rejected, true);
    const renewed = await post({ action: "renew", token: legacy });
    assert.equal(renewed.status, 200, renewed.body.message);
    assert.equal(renewed.body.id, id);
    assert.equal(renewed.body.folder, `${owner}/${id}`);
    assert.deepEqual(tokens.readSubmissionToken(renewed.body.token, secret), { id, kind: "listing", ownerUserId: owner });
    assert.equal(tokens.readSubmissionToken(renewed.body.token, secret, Date.now() + 8 * 86400e3), null, "the new token expires too");
    // A current token that outlived its week renews the same way.
    const old = tokens.createSubmissionToken("listing", secret, owner, undefined, Date.now() - 30 * 86400e3);
    assert.equal((await post({ action: "renew", token: old.token })).body.id, old.id);
    // Setting SUBMISSION_TOKEN_SECRET later doesn't strand drafts signed with the derived key.
    process.env.SUBMISSION_TOKEN_SECRET = "x".repeat(32);
    const moved = await post({ action: "renew", token: old.token });
    assert.equal(moved.status, 200);
    assert.equal(tokens.readSubmissionToken(moved.body.token, "x".repeat(32))?.id, old.id);
    delete process.env.SUBMISSION_TOKEN_SECRET;
    // Only the owner, signed in, gets a fresh token; an unverifiable or ownerless token can't be renewed at all.
    signedIn = crypto.randomUUID();
    assert.equal((await post({ action: "renew", token: legacy })).status, 403);
    signedIn = null;
    assert.equal((await post({ action: "renew", token: legacy })).status, 401);
    signedIn = owner;
    for (const token of [signed({ id, kind: "listing", ownerUserId: owner }, "another-key"), signed({ id, kind: "listing" }, service), `${legacy}x`]) {
      const lost = await post({ action: "renew", token });
      assert.equal(lost.status, 403);
      assert.equal(lost.body.restart, true);
    }
    // Renewal never makes the stricter reader accept an old token.
    assert.equal(tokens.readSubmissionToken(legacy, secret), null);
    assert.equal(tokens.readSubmissionToken(legacy, service), null);
    assert.deepEqual(tokens.submissionRenewalKeys(), [secret, service]);
  } finally {
    if (saved.own === undefined) delete process.env.SUBMISSION_TOKEN_SECRET; else process.env.SUBMISSION_TOKEN_SECRET = saved.own;
    if (saved.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
  }
});

test("A35: the selling form renews a restored draft's token, and retries a publish refused for an expired one", () => {
  const form = fs.readFileSync("components/sell-listing-form.tsx", "utf8");
  assert.match(form, /apply\(restore\);\n[\s\S]*?void renew\(restore\.submission\)/);
  assert.match(form, /if \(!\(error instanceof SubmissionExpired\)\) throw error;\n\s+return send\(\(await renew\(capability\)\)\.token\);/);
  const helper = fs.readFileSync("lib/public-submission.ts", "utf8");
  assert.match(helper, /submissionRequest\(\{ action: "renew", token: current\.token \}\)/);
});

test("A11: CSP reports are logged compactly, and a body past 16 KB is refused without reading the rest", async () => {
  const route = loadRoute("app/api/csp-report/route.ts", { "next/server": { NextResponse: class extends Response {} } });
  const logged = [];
  const warn = console.warn;
  console.warn = (...args) => logged.push(args);
  try {
    const report = { "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?token=secret", "document-uri": "https://laria.audio/vender?draft=1" } };
    const ok = await route.POST(new Request("https://laria.audio/api/csp-report", { method: "POST", body: JSON.stringify(report) }));
    assert.equal(ok.status, 204);
    assert.deepEqual(JSON.parse(logged[0][1]), { directive: "script-src-elem", blocked: "https://evil.example/x.js", page: "https://laria.audio/vender" });
    assert.equal((await route.POST(new Request("https://laria.audio/api/csp-report", { method: "POST", body: "x".repeat(20_000), headers: { "content-length": "20000" } }))).status, 413);
    // No Content-Length (chunked) and no end: the route stops after the limit and cancels the stream.
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(4096)); }, cancel() { cancelled = true; } });
    const response = await route.POST(new Request("https://laria.audio/api/csp-report", { method: "POST", body: endless, duplex: "half" }));
    assert.equal(response.status, 413);
    assert.ok(cancelled, "the oversized body is cancelled");
    assert.ok(pulled <= 6, `read ${pulled} chunks`);
    assert.equal(logged.length, 1);
  } finally {
    console.warn = warn;
  }
});
