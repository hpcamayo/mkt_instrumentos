"use strict";
const { LocalOnly } = require("./errors.cjs");

// Browser routing does not intercept Playwright's APIRequestContext or Node fetch.
// Keep those channels read-only; browser writes still pass live.cjs's ownership guard.
function readOnlyFetch(fetch, label) {
  return async function (input, options = {}) {
    const method = String(options.method || (typeof input?.method === "function" ? input.method() : input?.method) || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      throw new LocalOnly(`${label}: ${method} must use the guarded browser channel`);
    }
    return fetch.call(this, input, options);
  };
}

function assertScopedSql(statement) {
  // These jobs operate across accounts even when called from a fixture's SQL session.
  if (/\b(?:run_listing_reservations|run_my_listings_reminders|prepare_[a-z_]+|process_[a-z_]+|prune_[a-z_]+|claim_(?:marketplace_email|push)_deliveries)\s*\(/i.test(statement)) {
    throw new LocalOnly("a global background job is only exercised on the local stack");
  }
}
// These two POST actions are reads in app/api/favorites/route.ts; neither can mutate favorites.
function isFavoriteRead(request, origin) {
  if (request.method() !== "POST") return false;
  const url = new URL(request.url());
  if (url.origin !== origin || url.pathname !== "/api/favorites") return false;
  try { return ["cards", "states"].includes(JSON.parse(request.postData() || "null")?.action); } catch { return false; }
}
// These authenticated actions only issue/renew a folder token or clean an uncompleted owned folder.
// The complete action, which can publish, remains refused by live.cjs.
function isUploadSetup(request, origin) {
  if (request.method() !== "POST") return false;
  const url = new URL(request.url());
  if (url.origin !== origin || url.pathname !== "/api/submissions") return false;
  try {
    const body = JSON.parse(request.postData() || "null");
    if (body?.action === "start") return ["listing", "store_listing", "store"].includes(body.kind);
    if (body?.action === "resume") return typeof body.draft_id === "string" && /^[0-9a-f-]{36}$/i.test(body.draft_id);
    return ["renew", "cleanup"].includes(body?.action) && typeof body.token === "string" && body.token.length > 0;
  } catch { return false; }
}
module.exports = { readOnlyFetch, assertScopedSql, isFavoriteRead, isUploadSetup };
