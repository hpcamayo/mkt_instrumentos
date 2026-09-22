// Local-only saved-search API/RLS/queue integration. Always removes fixtures.
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

loadEnvFile(".env.local");
const base = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local app only");
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local Supabase only");

const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const users = [];
const listings = [];
const suffix = crypto.randomUUID();

async function ok(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}

async function account(label, admin = false) {
  const email = `s7-${label}-${suffix}@example.invalid`;
  const password = `Qa-${crypto.randomUUID()}`;
  const created = await ok(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "seller", full_name: label, phone: "51999997777", city: "Lima", region: "Lima" },
    app_metadata: admin ? { role: "admin" } : {},
  }));
  users.push(created.user.id);
  let cookies = [];
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookies,
      setAll: (values) => { cookies = values.map(({ name, value }) => ({ name, value })); },
    },
  });
  await ok(await client.auth.signInWithPassword({ email, password }));
  return { id: created.user.id, email, client, cookie: () => cookies.map(({ name, value }) => `${name}=${value}`).join("; ") };
}

async function alertApi(actor, body, expected = 200, origin = base) {
  const response = await fetch(`${base}/api/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...(actor ? { Cookie: actor.cookie() } : {}) },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, result.message);
  return result;
}

async function publish(owner, admin, label) {
  const id = crypto.randomUUID();
  listings.push(id);
  await ok(await service.from("listings").insert({
    id,
    slug: `s7-alert-${label}-${id}`,
    title: `Fender Sprint 7 ${label}`,
    seller_type: "individual",
    status: "pending",
    category: "guitars",
    instrument_type: "electric_guitar",
    attributes: { body_type: "solid_body" },
    brand: "Fender",
    model: label,
    condition: "Usado - buen estado",
    price_pen: 1800,
    city: "Lima",
    region: "Lima",
    contact_name: "QA",
    whatsapp_phone: "51999997777",
    description: "Descripción suficientemente extensa para la integración local de alertas Sprint 7.",
    owner_user_id: owner.id,
    created_by_source: "admin",
    marketplace_rules_accepted_at: new Date().toISOString(),
  }));
  await ok(await service.from("listing_photos").insert([
    { listing_id: id, image_url: `https://example.invalid/${id}-0.jpg`, sort_order: 0 },
    { listing_id: id, image_url: `https://example.invalid/${id}-1.jpg`, sort_order: 1 },
  ]));
  await ok(await admin.client.rpc("review_listing", { p_listing_id: id, p_decision: "approve" }));
  return id;
}

async function claim(worker) {
  return await ok(await service.rpc("claim_marketplace_email_deliveries", { p_worker_id: worker, p_limit: 10 }));
}

async function settleNonAlert(rows, worker) {
  for (const row of rows.filter((item) => item.event_type !== "search_alert_immediate" && item.event_type !== "search_alert_daily")) {
    await ok(await service.rpc("complete_marketplace_email_delivery", {
      p_delivery_id: row.delivery_id,
      p_worker_id: worker,
      p_provider_message_id: `local-${row.delivery_id}`,
    }));
  }
  return rows.filter((item) => item.event_type === "search_alert_immediate" || item.event_type === "search_alert_daily");
}

(async () => {
  try {
    const owner = await account("owner");
    const buyer = await account("buyer");
    const other = await account("other");
    const admin = await account("admin", true);
    const filters = { category: "guitars", instrument_type: "electric_guitar", brand: "Fender", location: "Lima", max_price: 2000, advanced: { body_type: "solid_body" } };

    await alertApi(null, { action: "create", filters, frequency: "immediate" }, 401);
    await alertApi(buyer, { action: "create", filters, frequency: "immediate" }, 403, "https://evil.example.invalid");
    const created = await alertApi(buyer, { action: "create", filters, frequency: "immediate", user_id: other.id, recipient: other.email });
    const alertId = created.alert.id;
    assert.equal(created.alert.user_id, buyer.id, "API/RPC must bind alert to the session");
    await alertApi(buyer, { action: "create", filters: { ...filters, brand: "fender" }, frequency: "daily" }, 409);
    assert.equal((await ok(await other.client.from("saved_search_alerts").select("id"))).length, 0);
    await alertApi(other, { action: "status", id: alertId, active: false }, 404);

    const firstListing = await publish(owner, admin, "primera");
    const firstWorker = crypto.randomUUID();
    const firstClaim = await settleNonAlert(await claim(firstWorker), firstWorker);
    assert.equal(firstClaim.length, 1);
    assert.equal(firstClaim[0].recipient_email, buyer.email);
    assert.equal(firstClaim[0].listing.slug.includes(firstListing), true);
    assert.equal(firstClaim[0].search_alert.id, alertId);
    const deliveryId = firstClaim[0].delivery_id;
    assert.equal(await ok(await service.rpc("fail_marketplace_email_delivery", {
      p_delivery_id: deliveryId,
      p_worker_id: firstWorker,
      p_retryable: true,
      p_failure_category: "transport",
      p_failure_code: "local_sandbox_timeout",
    })), "retry");

    await alertApi(buyer, { action: "status", id: alertId, active: false });
    const pausedWorker = crypto.randomUUID();
    assert.deepEqual(await settleNonAlert(await claim(pausedWorker), pausedWorker), [], "paused retry must not be claimable");
    await publish(owner, admin, "pausada");
    await alertApi(buyer, { action: "status", id: alertId, active: true });
    const resumeWorker = crypto.randomUUID();
    assert.deepEqual(await settleNonAlert(await claim(resumeWorker), resumeWorker), [], "resume must not backfill pause-period inventory");

    const futureListing = await publish(owner, admin, "reactivada");
    const secondWorker = crypto.randomUUID();
    const secondClaim = await settleNonAlert(await claim(secondWorker), secondWorker);
    assert.equal(secondClaim.length, 1);
    assert.equal(secondClaim[0].listing.slug.includes(futureListing), true);
    await ok(await service.rpc("complete_marketplace_email_delivery", {
      p_delivery_id: secondClaim[0].delivery_id,
      p_worker_id: secondWorker,
      p_provider_message_id: "local-provider-message",
    }));

    // Unfavorite and the authoritative price update may serialize in either
    // order. The transition may therefore have zero or one eligible delivery,
    // but it must never duplicate or target anyone except the then-current
    // favorite owner.
    await ok(await buyer.client.rpc("set_listing_favorite", { p_listing_id: firstListing, p_saved: true }));
    const [unfavoriteResult, priceDropResult] = await Promise.all([
      buyer.client.rpc("set_listing_favorite", { p_listing_id: firstListing, p_saved: false }),
      owner.client.rpc("update_owned_listing", { p_listing_id: firstListing, p_immediate: { price_pen: 1600 } }),
    ]);
    await ok(unfavoriteResult);
    await ok(priceDropResult);
    assert.equal((await ok(await buyer.client.from("favorites").select("listing_id").eq("listing_id", firstListing))).length, 0);
    const priceRaceWorker = crypto.randomUUID();
    const priceRaceClaim = await claim(priceRaceWorker);
    const priceRaceDeliveries = priceRaceClaim.filter((item) => item.event_type === "listing_price_drop" && item.listing?.slug.includes(firstListing));
    assert.ok(priceRaceDeliveries.length <= 1, "unfavorite/price race must not duplicate delivery");
    assert.ok(priceRaceDeliveries.every((item) => item.recipient_email === buyer.email), "price drop targeted an unrelated recipient");
    await settleNonAlert(priceRaceClaim, priceRaceWorker);

    const page = await fetch(`${base}/mi-cuenta/alertas`, { headers: { Cookie: buyer.cookie() } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Alertas/);
    assert.match(html, /Marca: Fender/);
    assert.match(html, /Menú de cuenta móvil/);

    await alertApi(buyer, { action: "delete", id: alertId });
    assert.equal((await ok(await buyer.client.from("saved_search_alerts").select("id"))).length, 0);
    await publish(owner, admin, "eliminada");
    const deletedWorker = crypto.randomUUID();
    assert.deepEqual(await settleNonAlert(await claim(deletedWorker), deletedWorker), [], "deleted alert must not create future work");
    console.log("PASS Sprint 7 alert API, RLS, matching, retry, pause/resume/delete, queue recipient and account UI integration.");
  } finally {
    if (listings.length) {
      await service.from("listing_photos").delete().in("listing_id", listings);
      await service.from("listings").delete().in("id", listings);
    }
    for (const id of users) await service.auth.admin.deleteUser(id);
    const remaining = await ok(await service.auth.admin.listUsers({ perPage: 1000 }));
    assert.equal(remaining.users.filter((user) => users.includes(user.id)).length, 0);
    console.log("QA cleanup: Sprint 7 alert users, listings, alerts, matches and delivery fixtures removed.");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
