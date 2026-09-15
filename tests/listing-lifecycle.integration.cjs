// Explicit local integration test. Creates isolated QA rows and removes them.
// Usage: node tests/listing-lifecycle.integration.cjs http://localhost:3100
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");

loadEnvFile(".env.local");
const base = process.argv[2];
if (!base) throw new Error("Provide the app base URL explicitly.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assertLocalTargetMatches(base, url);
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const createdUsers = [];
const listingIds = [];
const storeIds = [];

(async () => {
  const suffix = crypto.randomUUID();
  try {
    const owner = await createUser(`s3-owner-${suffix}@example.invalid`, "seller");
    const other = await createUser(`s3-other-${suffix}@example.invalid`, "seller");
    const admin = await createUser(`s3-admin-${suffix}@example.invalid`, "seller", { role: "admin" });
    const storeOwner = await createUser(`s3-store-${suffix}@example.invalid`, "store_owner");
    const ownerClient = await signIn(owner.email, owner.password);
    const otherClient = await signIn(other.email, other.password);
    const adminClient = await signIn(admin.email, admin.password);
    const storeClient = await signIn(storeOwner.email, storeOwner.password);

    const liveId = crypto.randomUUID();
    listingIds.push(liveId);
    assert.equal((await service.from("listings").insert(validListing({
      id: liveId,
      slug: `s3-live-${suffix}`,
      owner_user_id: owner.id,
      status: "approved",
      published_at: new Date().toISOString(),
    }))).error, null);
    await addPhotos(liveId, "live");

    const edit = await ownerClient.rpc("update_owned_listing", {
      p_listing_id: liveId,
      p_immediate: { price_pen: 900 },
      p_moderated: { title: "Título propuesto de integración", condition: "Usado - con detalles" },
      p_photos: null,
    });
    assert.equal(edit.error, null);
    assert.equal(edit.data.mode, "revision");
    const before = await service.from("listings").select("title,condition,price_pen,status").eq("id", liveId).single();
    assert.deepEqual(before.data, { title: "Publicación Sprint 3", condition: "Usado - buen estado", price_pen: 900, status: "approved" });

    const revision = await service.from("listing_revisions").select("id,status").eq("listing_id", liveId).single();
    assert.equal(revision.data.status, "pending");
    assert.equal((await otherClient.from("listing_revisions").select("id").eq("id", revision.data.id)).data.length, 0);
    assert.equal((await adminClient.rpc("review_listing_revision", {
      p_revision_id: revision.data.id,
      p_decision: "approve",
    })).error, null);
    const after = await service.from("listings").select("title,condition,price_pen,status").eq("id", liveId).single();
    assert.deepEqual(after.data, { title: "Título propuesto de integración", condition: "Usado - con detalles", price_pen: 900, status: "approved" });

    const cookie = await loginCookie(owner.email, owner.password);
    const rejectedId = crypto.randomUUID();
    listingIds.push(rejectedId);
    assert.equal((await service.from("listings").insert(validListing({
      id: rejectedId,
      slug: `s3-rejected-${suffix}`,
      owner_user_id: owner.id,
      status: "rejected",
      rejection_reason: "Corrige el detalle.",
    }))).error, null);
    await addPhotos(rejectedId, "rejected");
    const resubmitted = await manage(rejectedId, cookie, "resubmit");
    assert.equal(resubmitted.listing.status, "pending");
    assert.equal(resubmitted.listing.rejection_reason, null);

    await manage(liveId, cookie, "hide");
    assert.deepEqual((await service.from("listings").select("status,hidden_source").eq("id", liveId).single()).data, { status: "hidden", hidden_source: "owner" });
    await manage(liveId, cookie, "restore");
    await manage(liveId, cookie, "sold");
    const sold = await service.from("listings").select("status,sold_at,slug").eq("id", liveId).single();
    assert.equal(sold.data.status, "sold");
    assert.ok(sold.data.sold_at);

    const soldPage = await fetch(`${base}/instrumentos/${sold.data.slug}`);
    const soldHtml = await soldPage.text();
    assert.equal(soldPage.status, 200);
    assert.match(soldHtml, /Vendido/);
    assert.match(soldHtml, /ya no está disponible/);
    assert.match(soldHtml, /0 listados activos/);
    assert.doesNotMatch(soldHtml, /Coordina por WhatsApp/);
    assert.doesNotMatch(soldHtml, /<a[^>]*>Preguntar por WhatsApp<\/a>/);
    assert.equal((await createClient(url, anonKey).from("listings").select("id").eq("id", liveId)).data.length, 0);

    const relistResponse = await manage(liveId, cookie, "relist");
    listingIds.push(relistResponse.listing.id);
    assert.notEqual(relistResponse.listing.id, liveId);
    assert.equal(relistResponse.listing.status, "pending");
    assert.equal(relistResponse.listing.relisted_from_listing_id, liveId);

    const capStoreId = crypto.randomUUID();
    storeIds.push(capStoreId);
    assert.equal((await service.from("stores").insert({
      id: capStoreId,
      slug: `s3-cap-store-${suffix}`,
      name: "Tienda Cap Sprint 3",
      razon_social: "Tienda Cap Sprint 3 SAC",
      ruc: `20${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
      email: storeOwner.email,
      contact_person: "QA Store Owner",
      contact_name: "QA Store Owner",
      whatsapp_phone: "51999999103",
      city: "Lima",
      region: "Lima",
      address: "Av. QA Sprint 3",
      owner_user_id: storeOwner.id,
      status: "active",
      is_verified: false,
      listing_plan: "free",
    })).error, null);

    const capRows = Array.from({ length: 49 }, (_, index) => ({
      id: crypto.randomUUID(),
      slug: `s3-cap-${index}-${suffix}`,
      title: `Cap ${index}`,
      seller_type: "store",
      status: index % 2 ? "pending" : "approved",
      category: "guitars",
      city: "Lima",
      region: "Lima",
      whatsapp_phone: "51999999103",
      owner_user_id: storeOwner.id,
      store_id: capStoreId,
    }));
    listingIds.push(...capRows.map((row) => row.id));
    assert.equal((await service.from("listings").insert(capRows)).error, null);

    const soldOriginals = [0, 1].map((index) => validListing({
      id: crypto.randomUUID(),
      slug: `s3-sold-race-${index}-${suffix}`,
      owner_user_id: storeOwner.id,
      store_id: capStoreId,
      seller_type: "store",
      status: "sold",
      sold_at: new Date().toISOString(),
    }));
    listingIds.push(...soldOriginals.map((row) => row.id));
    assert.equal((await service.from("listings").insert(soldOriginals)).error, null);
    for (const [index, row] of soldOriginals.entries()) await addPhotos(row.id, `race-${index}`);

    const race = await Promise.all(soldOriginals.map((row) => storeClient.rpc("relist_sold_listing", { p_listing_id: row.id })));
    assert.equal(race.filter((result) => !result.error).length, 1, "Two concurrent relists from 49 must create only the 50th listing");
    assert.equal(race.filter((result) => result.error?.message.includes("STORE_INVENTORY_LIMIT_REACHED")).length, 1);
    for (const result of race) if (result.data?.id) listingIds.push(result.data.id);
    assert.equal((await service.from("listings").select("id", { count: "exact", head: true }).eq("store_id", capStoreId).in("status", ["pending", "approved"])).count, 50);

    console.log("Sprint 3 integration: lifecycle, revision, sold detail, RLS, relist, and concurrent cap passed.");
  } finally {
    if (listingIds.length) {
      await service.from("listing_revision_photos").delete().in("revision_id", (await service.from("listing_revisions").select("id").in("listing_id", listingIds)).data?.map((row) => row.id) ?? []);
      await service.from("listing_revisions").delete().in("listing_id", listingIds);
      await service.from("listings").delete().in("id", listingIds);
    }
    for (const storeId of storeIds) await service.from("stores").delete().eq("id", storeId);
    for (const userId of createdUsers.reverse()) await service.auth.admin.deleteUser(userId);
    console.log("Sprint 3 integration: temporary QA records removed.");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function validListing(overrides) {
  return {
    title: "Publicación Sprint 3",
    seller_type: "individual",
    status: "pending",
    category: "guitars",
    instrument_type: "electric_guitar",
    attributes: { body_type: "solid_body" },
    brand: "QA",
    model: "Sprint 3",
    condition: "Usado - buen estado",
    price_pen: 1000,
    city: "Lima",
    region: "Lima",
    contact_name: "QA Owner",
    whatsapp_phone: "51999999101",
    description: "Descripción válida para la integración completa de Sprint tres.",
    created_by_source: "self_service",
    marketplace_rules_accepted_at: new Date().toISOString(),
    ...overrides,
  };
}

async function addPhotos(listingId, name) {
  const rows = [0, 1].map((sort_order) => ({
    listing_id: listingId,
    image_url: `${url}/storage/v1/object/public/listing-photos/qa/${name}-${sort_order}.jpg`,
    alt_text: `Foto ${sort_order + 1}`,
    sort_order,
  }));
  assert.equal((await service.from("listing_photos").insert(rows)).error, null);
}

async function createUser(email, accountType, appMetadata = {}) {
  const password = `Qa-${crypto.randomUUID()}`;
  const result = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: {
      account_type: accountType,
      full_name: "QA Sprint 3",
      phone: "51999999101",
      city: "Lima",
      region: "Lima",
    },
  });
  assert.equal(result.error, null);
  createdUsers.push(result.data.user.id);
  return { id: result.data.user.id, email, password };
}

async function signIn(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  return client;
}

async function loginCookie(email, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

async function manage(id, cookie, action) {
  const response = await fetch(`${base}/api/listings/${id}/manage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, result.message);
  return result;
}

function assertLocalTargetMatches(appBase, supabaseUrl) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(new URL(appBase).hostname) && !localHosts.has(new URL(supabaseUrl).hostname)) {
    throw new Error("Refusing to run a local integration test against a hosted Supabase project.");
  }
}
