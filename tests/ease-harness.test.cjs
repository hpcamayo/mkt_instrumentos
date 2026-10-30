const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readOnlyFetch, assertScopedSql } = require("../scripts/acceptance/ease/live-safety.cjs");
const { LocalOnly } = require("../scripts/acceptance/ease/errors.cjs");

test("live API requests refuse writes before invoking the network, including Playwright Request inputs", async () => {
  let sent = 0;
  const fetch = readOnlyFetch(async () => { sent += 1; }, "test");
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    await assert.rejects(fetch("https://laria.audio/api/favorites", { method }), LocalOnly);
  }
  await assert.rejects(fetch({ method: () => "POST" }), LocalOnly);
  await assert.rejects(fetch(new Request("https://laria.audio/api/favorites", { method: "POST" })), LocalOnly);
  assert.equal(sent, 0);
});

test("live API reads preserve the receiver and options", async () => {
  const request = { marker: true };
  request.fetch = readOnlyFetch(async function (url, options) { return { receiver: this, url, options }; }, "test");
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const options = { method, headers: { accept: "application/json" } };
    const result = await request.fetch("https://laria.audio/listados", options);
    assert.equal(result.receiver, request);
    assert.equal(result.options, options);
  }
});

test("live SQL refuses jobs that could process another account's work", () => {
  for (const query of ["select laria_private.run_listing_reservations()", "select public.run_my_listings_reminders()",
    "SELECT public.prepare_daily_digest()", "select public.claim_push_deliveries('x', 10)"]) {
    assert.throws(() => assertScopedSql(query), LocalOnly);
  }
  assert.doesNotThrow(() => assertScopedSql("select public.set_listing_reservation('fixture', 2)"));
});


test("only same-origin read actions bypass the browser write guard", () => {
  const { isFavoriteRead } = require("../scripts/acceptance/ease/live-safety.cjs");
  const request = (action, url = "https://laria.audio/api/favorites", method = "POST") => ({
    url: () => url, method: () => method, postData: () => JSON.stringify({ action, ids: [] }),
  });
  assert.equal(isFavoriteRead(request("cards"), "https://laria.audio"), true);
  assert.equal(isFavoriteRead(request("states"), "https://laria.audio"), true);
  for (const action of ["set", "merge", "note", undefined]) assert.equal(isFavoriteRead(request(action), "https://laria.audio"), false);
  assert.equal(isFavoriteRead(request("cards", "https://other.example/api/favorites"), "https://laria.audio"), false);
  assert.equal(isFavoriteRead(request("cards", "https://laria.audio/api/submissions"), "https://laria.audio"), false);
  assert.equal(isFavoriteRead(request("cards", undefined, "PUT"), "https://laria.audio"), false);
});


test("upload setup actions are permitted without allowing publication", () => {
  const { isUploadSetup } = require("../scripts/acceptance/ease/live-safety.cjs");
  const request = (body, origin = "https://laria.audio", method = "POST") => ({
    method: () => method, url: () => `${origin}/api/submissions`, postData: () => JSON.stringify(body),
  });
  assert.equal(isUploadSetup(request({ action: "start", kind: "listing" }), "https://laria.audio"), true);
  assert.equal(isUploadSetup(request({ action: "resume", draft_id: "11111111-1111-4111-8111-111111111111" }), "https://laria.audio"), true);
  for (const action of ["renew", "cleanup"]) assert.equal(isUploadSetup(request({ action, token: "owned-token" }), "https://laria.audio"), true);
  for (const action of ["complete", "publish", "unknown"]) assert.equal(isUploadSetup(request({ action, kind: "listing" }), "https://laria.audio"), false);
  assert.equal(isUploadSetup(request({ action: "start", kind: "listing" }, "https://other.example"), "https://laria.audio"), false);
});

test("fixture helpers propagate safety stop exceptions", () => {
  const h = require("../scripts/acceptance/ease/harness.cjs");
  const c = require("../scripts/acceptance/ease/c-helpers.cjs");
  const e = require("../scripts/acceptance/ease/e-local.cjs");
  const original = h.sqlAs;
  try {
    for (const Type of [h.LocalOnly, h.LiveUnsafe]) {
      h.sqlAs = () => { throw new Type("safety stop"); };
      assert.throws(() => c.attempt("fixture", "select 1"), Type);
      assert.throws(() => e.attempt("fixture", "select 1"), Type);
    }
  } finally { h.sqlAs = original; }
});


test("SQL row results that are dates are not mistaken for CLI envelopes", () => {
  const { parseRows } = require("../scripts/acceptance/ease/live.cjs");
  const value = [{ result: "2026-10-31T05:44:37+00:00" }];
  assert.deepEqual(parseRows(JSON.stringify(value)), value);
  assert.deepEqual(parseRows(JSON.stringify({ result: JSON.stringify([{ id: 1 }]) })), [{ id: 1 }]);
});

test("structured CLI SQL errors preserve the business message without SQLSTATE or context", () => {
  const { structuredSqlError } = require("../scripts/acceptance/ease/live-safety.cjs");
  const message = "Failed to run sql query: ERROR:  P0001: RESERVATION_NOT_OWNED: No puedes administrar esta publicación.\nCONTEXT: PL/pgSQL function";
  assert.equal(structuredSqlError({ stderr: "unexpected status 400: " + JSON.stringify({ message }) + "\nTry rerunning" }),
    "RESERVATION_NOT_OWNED: No puedes administrar esta publicación.");
  assert.equal(structuredSqlError({ stderr: "network timeout" }), null);
});


// Preview authentication must preserve the write guard and never send its token through a redirect or offline replay.
const { continueWithPreviewAccess } = require("../scripts/acceptance/ease/live-safety.cjs");
function previewRoute(url, fails = false) {
  const calls = [];
  return { calls, request: () => ({ url: () => url, headers: () => ({ accept: "text/html" }) }),
    continue: async () => calls.push(["continue"]), abort: async code => calls.push(["abort", code]),
    fetch: async options => { calls.push(["fetch", options]); if (fails) throw new Error("secret in upstream log"); return { status: () => 302 }; },
    fulfill: async options => calls.push(["fulfill", options]),
  };
}
test("preview OIDC transport authenticates one origin without following redirects", async () => {
  const route = previewRoute("https://branch.vercel.app/login");
  await continueWithPreviewAccess(route, { origin: "https://branch.vercel.app", token: "test-oidc", offline: false });
  assert.equal(route.calls[0][0], "fetch");
  assert.equal(route.calls[0][1].maxRedirects, 0);
  assert.equal(route.calls[0][1].headers["x-vercel-trusted-oidc-idp-token"], "test-oidc");
  assert.equal(route.calls[1][0], "fulfill");
  const outside = previewRoute("https://other.example/redirect");
  await continueWithPreviewAccess(outside, { origin: "https://branch.vercel.app", token: "test-oidc", offline: false });
  assert.deepEqual(outside.calls, [["continue"]]);
});
test("preview transport cannot send an offline sale or leak fetch error headers", async () => {
  const route = previewRoute("https://branch.vercel.app/api/store/inventory");
  await continueWithPreviewAccess(route, { origin: "https://branch.vercel.app", token: "test-oidc", offline: true });
  assert.deepEqual(route.calls, [["abort", "internetdisconnected"]]);
  const failed = previewRoute("https://branch.vercel.app/login", true);
  await continueWithPreviewAccess(failed, { origin: "https://branch.vercel.app", token: "test-oidc", offline: false });
  assert.deepEqual(failed.calls.at(-1), ["abort", "failed"]);
});
