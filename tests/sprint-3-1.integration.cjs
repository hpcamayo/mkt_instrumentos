// Explicit local/production Sprint 3.1 smoke. Temporary fixtures are removed.
// Usage: node tests/sprint-3-1.integration.cjs http://localhost:3100
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");

loadEnvFile(".env.local");
const base = process.argv[2];
assert.ok(base, "Provide the app base URL explicitly.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (localHosts.has(new URL(base).hostname)) {
  assert.ok(localHosts.has(new URL(url).hostname), "Local app must use local Supabase.");
} else {
  assert.equal(new URL(base).origin, "https://laria.audio", "Only the explicitly authorized production domain is supported.");
}
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const users = [];
const listings = [];
const stores = [];
const objects = [];
const suffix = crypto.randomUUID();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=", "base64");

(async () => {
  try {
    const owner = await createUser("owner", "seller");
    const storeOwner = await createUser("store", "store_owner");
    const other = await createUser("other", "store_owner");
    const admin = await createUser("admin", "seller", { role: "admin" });
    const [ownerSession, storeSession, otherSession, adminSession] = await Promise.all(
      [owner, storeOwner, other, admin].map(signIn),
    );

    const initial = await submit("listing", ownerSession, listingFields("QA Sprint 3.1 título original"));
    await rpc(adminSession.client, "review_listing", { p_listing_id: initial.id, p_decision: "approve" });
    const initialPublic = await anonymous.from("listings").select("title,price_pen,slug").eq("id", initial.id).single();
    assert.equal(initialPublic.error, null);
    assert.equal(initialPublic.data.price_pen, 1200);
    await assertPublicRendering(initialPublic.data.slug, initialPublic.data.title, 1200);

    const first = await manage(initial.id, ownerSession.cookie, { immediate: {}, moderated: { title: "QA Sprint 3.1 título aprobado" } });
    const photos = (await service.from("listing_photos").select("image_url,alt_text").eq("listing_id", initial.id).order("sort_order")).data;
    const second = await manage(initial.id, ownerSession.cookie, { immediate: { price_pen: 1100 }, moderated: {}, photos: [...photos].reverse() });
    assert.equal(second.revision_id, first.revision_id);
    const third = await manage(initial.id, ownerSession.cookie, { immediate: {}, moderated: { condition: "Usado - con detalles" } });
    assert.equal(third.revision_id, first.revision_id);
    assert.equal(third.revision_version, 3);
    const pending = await service.from("listings").select("title,price_pen").eq("id", initial.id).single();
    assert.deepEqual(pending.data, { title: "QA Sprint 3.1 título original", price_pen: 1100 });
    const editorHtml = await (await fetch(`${base}/mi-cuenta/publicaciones/${initial.id}/editar`, { headers: { Cookie: ownerSession.cookie } })).text();
    assert.match(editorHtml, /QA Sprint 3.1 título aprobado/);
    const stale = await adminSession.client.rpc("review_listing_revision", { p_revision_id: first.revision_id, p_decision: "approve", p_expected_version: 1 });
    assert.match(stale.error?.message ?? "", /LISTING_REVISION_STALE/);
    await rpc(adminSession.client, "review_listing_revision", { p_revision_id: first.revision_id, p_decision: "approve", p_expected_version: 3 });
    const approved = await anonymous.from("listings").select("title,price_pen,slug").eq("id", initial.id).single();
    assert.equal(approved.data.title, "QA Sprint 3.1 título aprobado");
    assert.equal(approved.data.price_pen, 1100);
    const approvedPhotos = (await service.from("listing_photos").select("image_url").eq("listing_id", initial.id).order("sort_order")).data;
    assert.equal(approvedPhotos[0].image_url, photos[1].image_url);
    await assertPublicRendering(approved.data.slug, approved.data.title, 1100);
    console.log("PASS: exact initial/edit price, canonical title, same-row photo/mixed amendment, stale admin denial, latest atomic approval");

    const rejected = await manage(initial.id, ownerSession.cookie, { immediate: {}, moderated: { title: "QA Sprint 3.1 título rechazado" } });
    await manage(initial.id, ownerSession.cookie, { immediate: {}, moderated: { model: "Propuesta rechazada" } });
    await rpc(adminSession.client, "review_listing_revision", { p_revision_id: rejected.revision_id, p_decision: "reject", p_expected_version: 2, p_reason: "QA: el título no corresponde al producto" });
    assert.equal((await service.from("listings").select("title").eq("id", initial.id).single()).data.title, approved.data.title);
    const ownerNotifications = await ownerSession.client.from("notifications").select("id,event_type,listing_id,read_at").order("created_at", { ascending: false });
    assert.equal(ownerNotifications.error, null);
    const rejectionNotice = ownerNotifications.data.find((row) => row.event_type === "listing_revision_rejected");
    assert.ok(rejectionNotice);
    assert.equal(rejectionNotice.listing_id, initial.id);
    assert.equal((await otherSession.client.from("notifications").select("id").in("id", ownerNotifications.data.map((row) => row.id))).data.length, 0);
    const notificationPage = await (await fetch(`${base}/mi-cuenta/notificaciones`, { headers: { Cookie: ownerSession.cookie } })).text();
    assert.match(notificationPage, /Cambios rechazados/);
    assert.match(notificationPage, /\/mi-cuenta\/publicaciones/);
    await rpc(ownerSession.client, "mark_notification_read", { p_notification_id: rejectionNotice.id });
    assert.ok((await ownerSession.client.from("notifications").select("read_at").eq("id", rejectionNotice.id).single()).data.read_at);
    const ownerList = await (await fetch(`${base}/mi-cuenta/publicaciones`, { headers: { Cookie: ownerSession.cookie } })).text();
    assert.match(ownerList, /el título no corresponde al producto/);
    console.log("PASS: amended rejection preserves live title; notification creation/RLS/read/link/reason navigation");

    const ruc = `20${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const application = await submit("store", storeSession, storeFields(storeOwner.email, ruc));
    const duplicate = await start("store", otherSession.cookie);
    const duplicateResponse = await submissionRequest({ action: "complete", token: duplicate.token, fields: storeFields(other.email, ruc), paths: [], roles: [] }, otherSession.cookie, 409);
    assert.equal(duplicateResponse.message, "Este RUC ya está registrado en Laria.");
    const pendingInventory = await submit("store_listing", storeSession, listingFields("QA Sprint 3.1 inventario normal"));
    assert.equal((await anonymous.from("listings").select("id").eq("id", pendingInventory.id)).data.length, 0);
    await rpc(adminSession.client, "review_store_application", { p_store_id: application.id, p_decision: "approve" });
    assert.equal((await service.from("listings").select("status").eq("id", pendingInventory.id).single()).data.status, "pending");
    await rpc(adminSession.client, "set_store_verification", { p_store_id: application.id, p_verified: true });
    assert.equal((await service.from("listings").select("status").eq("id", pendingInventory.id).single()).data.status, "approved");
    const directInventory = await submit("store_listing", storeSession, listingFields("QA Sprint 3.1 inventario verificado"));
    assert.equal((await service.from("listings").select("status").eq("id", directInventory.id).single()).data.status, "approved");
    const directEdit = await manage(directInventory.id, storeSession.cookie, { immediate: {}, moderated: { title: "QA Sprint 3.1 cambio directo" } });
    assert.equal(directEdit.mode, "direct");
    await rpc(adminSession.client, "set_store_verification", { p_store_id: application.id, p_verified: false });
    assert.equal((await anonymous.from("listings").select("id").eq("id", directInventory.id)).data.length, 1);
    const afterRevocation = await submit("store_listing", storeSession, listingFields("QA Sprint 3.1 tras revocación"));
    assert.equal((await service.from("listings").select("status").eq("id", afterRevocation.id).single()).data.status, "pending");
    const storeNotifications = await storeSession.client.from("notifications").select("event_type");
    assert.ok(storeNotifications.data.some((row) => row.event_type === "store_approved"));
    assert.ok(storeNotifications.data.some((row) => row.event_type === "store_verified"));
    assert.ok(storeNotifications.data.some((row) => row.event_type === "store_verification_revoked"));
    console.log("PASS: exact duplicate-RUC reason, pending/normal/verified Tienda behavior, direct edit, revocation, store notifications");

    for (const action of ["hide", "restore", "sold"]) await lifecycle(initial.id, ownerSession.cookie, action);
    const relisted = await lifecycle(initial.id, ownerSession.cookie, "relist");
    listings.push(relisted.id);
    assert.equal(relisted.title, approved.data.title);
    assert.equal(relisted.status, "pending");
    const soldPage = await fetch(`${base}/instrumentos/${approved.data.slug}`);
    assert.equal(soldPage.status, 200);
    assert.match(await soldPage.text(), /Vendido/);
    console.log("PASS: Particular hide/restore/sold URL/relist canonical-title regression");
  } finally {
    if (users.length) assert.equal((await service.from("marketplace_events").delete().in("actor_user_id", users.map((user) => user.id))).error, null);
    if (listings.length) {
      const revisions = await service.from("listing_revisions").select("id").in("listing_id", listings);
      assert.equal(revisions.error, null);
      const revisionIds = revisions.data.map((row) => row.id);
      if (revisionIds.length) assert.equal((await service.from("listing_revision_photos").delete().in("revision_id", revisionIds)).error, null);
      assert.equal((await service.from("listing_revisions").delete().in("listing_id", listings)).error, null);
      assert.equal((await service.from("listings").delete().in("id", listings)).error, null);
    }
    for (const id of stores) assert.equal((await service.from("stores").delete().eq("id", id)).error, null);
    for (const bucket of ["listing-photos", "store-assets"]) {
      const paths = objects.filter((object) => object.bucket === bucket).map((object) => object.path);
      if (paths.length) assert.equal((await service.storage.from(bucket).remove(paths)).error, null);
      for (const path of paths) {
        const folder = path.slice(0, path.lastIndexOf("/"));
        const name = path.slice(path.lastIndexOf("/") + 1);
        const remaining = await service.storage.from(bucket).list(folder, { search: name });
        assert.equal(remaining.error, null);
        assert.ok(!remaining.data.some((object) => object.name === name), "storage residue");
      }
    }
    for (const user of [...users].reverse()) {
      let result;
      for (let attempt = 0; attempt < 8; attempt++) {
        result = await service.auth.admin.deleteUser(user.id);
        if (!result.error) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.equal(result.error, null);
    }
    const ids = users.map((user) => user.id);
    for (const [table, column] of [["profiles", "id"], ["stores", "owner_user_id"], ["listings", "owner_user_id"], ["listing_revisions", "owner_user_id"], ["notifications", "user_id"]]) {
      if (ids.length) {
        const remaining = await service.from(table).select(column, { count: "exact", head: true }).in(column, ids);
        assert.equal(remaining.error, null);
        assert.equal(remaining.count, 0, `${table} residue`);
      }
    }
    console.log("QA residue: 0 users/profiles/stores/listings/revisions/revision photos/notifications/storage objects.");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

async function createUser(label, accountType, appMetadata = {}) {
  const user = { email: `s31-${label}-${suffix}@example.invalid`, password: `Qa-${crypto.randomUUID()}` };
  const result = await service.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true, app_metadata: appMetadata, user_metadata: { account_type: accountType, full_name: "QA Sprint 3.1", phone: "51999999201", city: "Lima", region: "Lima" } });
  assert.equal(result.error, null);
  user.id = result.data.user.id;
  users.push(user);
  return user;
}

async function signIn(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  assert.equal((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error, null);
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }) });
  assert.equal(response.status, 200);
  return { client, cookie: response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ") };
}

async function submissionRequest(body, cookie, expected = 200) {
  const response = await fetch(`${base}/api/submissions`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expected, result.message);
  return result;
}
async function start(kind, cookie) { return submissionRequest({ action: "start", kind }, cookie); }
async function submit(kind, session, fields) {
  const started = await start(kind, session.cookie);
  if (kind === "store") stores.push(started.id);
  else listings.push(started.id);
  const paths = kind === "store" ? [] : [`${started.folder}/0.png`, `${started.folder}/1.png`];
  for (const path of paths) {
    objects.push({ bucket: "listing-photos", path });
    assert.equal((await session.client.storage.from("listing-photos").upload(path, png, { contentType: "image/png" })).error, null);
  }
  await submissionRequest({ action: "complete", token: started.token, fields, paths, roles: paths.map(() => null) }, session.cookie);
  return started;
}
function listingFields(title) {
  return { title, category: "guitars", instrument_type: "electric_guitar", attributes: { body_type: "solid_body" }, brand: "Yamaha", model: "112J QA", condition: "Usado - buen estado", price_pen: 1200, city: "Lima", region: "Lima", description: "Registro temporal de QA para comprobar los flujos de Sprint tres punto uno.", marketplace_rules_accepted: true };
}
function storeFields(email, ruc) {
  return { name: "QA Sprint 3.1 Tienda", razon_social: "QA Sprint 3.1 SAC", ruc, email, contact_person: "QA Store Owner", whatsapp_phone: "51999999201", city: "Lima", region: "Lima", address: "Av. QA temporal 31" };
}
async function manage(id, cookie, fields) {
  const response = await fetch(`${base}/api/listings/${id}/manage`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ action: "edit", ...fields }) });
  const result = await response.json();
  assert.equal(response.status, 200, result.message);
  return result.result;
}
async function lifecycle(id, cookie, action) {
  const response = await fetch(`${base}/api/listings/${id}/manage`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ action }) });
  const result = await response.json();
  assert.equal(response.status, 200, result.message);
  return result.listing;
}
async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, `${name}: ${result.error?.message}`);
  return result.data;
}
async function assertPublicRendering(slug, title, price) {
  const formatted = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(price);
  for (const path of [`/instrumentos/${slug}`, "/listados?sort=newest"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(title), `${path}: canonical title missing`);
    assert.ok(html.includes(formatted), `${path}: exact price missing`);
  }
}
