// Sprint 4 actual-storage/API photo lifecycle proof. Local Supabase only.
// LARIA_TEST_ENV_FILE=/absolute/local.env node tests/photos.integration.cjs http://localhost:3100
// Add LARIA_PHOTO_BROWSER=1 for optional actual browser editor proof (agent-browser required).
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");
const { spawnSync } = require("node:child_process");

loadEnvFile(process.env.LARIA_TEST_ENV_FILE ?? ".env.local");
const base = process.argv[2];
assert.ok(base, "Provide the local app URL explicitly.");
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
assert.ok(localHosts.has(new URL(base).hostname), "Photo acceptance fixtures must never run against production.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(url && localHosts.has(new URL(url).hostname), "Use a local Supabase environment file.");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anonKey && serviceKey, "Local anonymous/service credentials are required.");
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const users = [];
const listings = [];
const stores = [];
const objects = [];
const suffix = crypto.randomUUID();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=", "base64");
const privateBucket = "listing-edit-photos";

(async () => {
  try {
    const owner = await createUser("particular", "seller");
    const other = await createUser("other", "seller");
    const admin = await createUser("admin", "seller", { role: "admin" });
    const normalOwner = await createUser("normal", "store_owner");
    const verifiedOwner = await createUser("verified", "store_owner");
    const [ownerSession, otherSession, adminSession, normalSession, verifiedSession] = await Promise.all(
      [owner, other, admin, normalOwner, verifiedOwner].map(signIn),
    );

    const initial = await submitListing("listing", ownerSession, "QA Sprint 4 foto A B C");
    await rpc(adminSession.client, "review_listing", { p_listing_id: initial.id, p_decision: "approve" });
    const live = await livePhotos(initial.id);
    assert.equal(live.length, 3);
    const first = await edit(initial.id, ownerSession, { moderated: { title: "QA Sprint 4 propuesta combinada" } });
    assert.equal(first.mode, "revision");
    const d = await uploadEdit(ownerSession, initial.id, 3);
    await assertImage(d.image_url, 404);
    await assertImage(d.image_url, 404, ownerSession.cookie);
    const second = await edit(initial.id, ownerSession, { photos: [...live, d.input] });
    assert.equal(second.revision_id, first.revision_id);
    assert.equal(second.revision_version, 2);
    await assertLive(initial.id, live);
    await assertProposal(initial.id, first.revision_id, [...live, d.input], "QA Sprint 4 propuesta combinada");
    await assertImage(d.image_url, 404);
    await assertImage(d.image_url, 200, ownerSession.cookie);
    await assertImage(d.image_url, 200, adminSession.cookie);
    await assertImage(d.image_url, 404, otherSession.cookie);
    const directStorage = await fetch(`${url}/storage/v1/object/public/${privateBucket}/${d.path}`);
    assert.ok([400, 403, 404].includes(directStorage.status), "Staged bucket must not serve public bytes.");
    console.log("PASS REV-014/add: real private upload after text proposal; one combined proposal; live bytes unchanged; private access enforced.");

    const reordered = await edit(initial.id, ownerSession, { photos: [d.input, ...live] });
    assert.equal(reordered.revision_id, first.revision_id);
    await assertProposal(initial.id, first.revision_id, [d.input, ...live]);
    const removed = await edit(initial.id, ownerSession, { photos: [d.input, live[0], live[2]] });
    assert.equal(removed.revision_id, first.revision_id);
    const e = await uploadEdit(ownerSession, initial.id, 4);
    const latestSet = [d.input, live[0], e.input];
    const replaced = await edit(initial.id, ownerSession, { photos: latestSet });
    assert.equal(replaced.revision_id, first.revision_id);
    await assertProposal(initial.id, first.revision_id, latestSet);
    await assertLive(initial.id, live);
    const adminPage = await fetch(`${base}/admin`, { headers: { Cookie: adminSession.cookie } });
    assert.equal(adminPage.status, 200);
    // The admin shell may hydrate its queue; the actual admin RLS query proves the complete latest proposal.
    const adminQueue = await adminSession.client.from("listing_revisions").select("id,title,version,changed_fields,listing_revision_photos(image_url,sort_order)").eq("id", first.revision_id).single();
    assert.equal(adminQueue.error, null);
    assert.equal(adminQueue.data.title, "QA Sprint 4 propuesta combinada");
    assert.deepEqual(adminQueue.data.listing_revision_photos.sort((a, b) => a.sort_order - b.sort_order).map((p) => p.image_url), effectiveUrls(latestSet));
    for (const decision of ["approve", "reject"]) {
      const stale = await adminSession.client.rpc("review_listing_revision", { p_revision_id: first.revision_id, p_decision: decision, p_expected_version: second.revision_version, p_reason: "QA stale" });
      assert.match(stale.error?.message ?? "", /LISTING_REVISION_STALE/);
      await assertLive(initial.id, live);
    }
    await edit(initial.id, ownerSession, { immediate: { price_pen: 1300 } });
    await rpc(adminSession.client, "review_listing_revision", { p_revision_id: first.revision_id, p_decision: "approve", p_expected_version: replaced.revision_version });
    await assertLive(initial.id, latestSet);
    const approved = await service.from("listings").select("title,price_pen,slug,published_at").eq("id", initial.id).single();
    assert.equal(approved.data.title, "QA Sprint 4 propuesta combinada");
    assert.equal(approved.data.price_pen, 1300);
    assert.ok(approved.data.published_at);
    await assertImage(d.image_url, 200);
    await assertImage(e.image_url, 200);
    const detail = await fetch(`${base}/instrumentos/${approved.data.slug}`);
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /QA Sprint 4 propuesta combinada/);
    assert.ok(detailHtml.includes("listing-images"), "Promoted photo must be rendered through the canonical URL.");
    console.log("PASS remove/replace/reorder/primary/stale approve+reject: exact latest private set promoted atomically and immediate price retained.");

    await testValidation(initial.id, ownerSession, otherSession, latestSet);
    await testSignedRetries(initial.id, ownerSession, otherSession, latestSet);
    await testRevert(initial.id, ownerSession, latestSet);
    await testRejectionAndCleanup(initial.id, ownerSession, otherSession, adminSession, latestSet);
    await testNonpublicStates(ownerSession, adminSession);
    await testStoreTier(normalSession, verifiedSession, adminSession);
    if (process.env.LARIA_PHOTO_BROWSER === "1") {
      await require("./photo-browser-smoke.cjs")({ base, id: initial.id, session: ownerSession, adminSession, service, objects, png, edit, pending, livePhotos });
    }
    await testSoldAndRelist(initial.id, ownerSession, latestSet);
    console.log("PASS complete photo subsystem: boundary validation, privacy, repeated proposals, reversion, retained audit, direct and nonpublic edits, history and safe cleanup.");
  } finally {
    if (users.length) assert.equal((await service.from("marketplace_events").delete().in("actor_user_id", users.map((user) => user.id))).error, null);
    // Delete only IDs and exact storage paths created by this invocation.
    if (listings.length) {
      const revisions = await service.from("listing_revisions").select("id").in("listing_id", listings);
      assert.equal(revisions.error, null);
      if (revisions.data.length) assert.equal((await service.from("listing_revision_photos").delete().in("revision_id", revisions.data.map((row) => row.id))).error, null);
      assert.equal((await service.from("listing_revisions").delete().in("listing_id", listings)).error, null);
      assert.equal((await service.from("listings").delete().in("id", listings)).error, null);
    }
    if (stores.length) assert.equal((await service.from("stores").delete().in("id", stores)).error, null);
    for (const bucket of [privateBucket, "listing-photos", "store-assets"]) {
      const paths = objects.filter((item) => item.bucket === bucket).map((item) => item.path);
      if (paths.length) assert.equal((await service.storage.from(bucket).remove(paths)).error, null);
      if (paths.length) assert.equal((await service.from("listing_photo_cleanup_claims").delete().eq("bucket", bucket).in("path", paths)).error, null);
      for (const path of paths) assert.equal(await exists(bucket, path), false, "Storage fixture residue.");
    }
    for (const user of [...users].reverse()) {
      let result;
      for (let attempt = 0; attempt < 8; attempt++) {
        result = await service.auth.admin.deleteUser(user.id);
        if (!result.error) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert.equal(result.error, null);
    }
    const ids = users.map((user) => user.id);
    if (ids.length) {
      for (const [table, column] of [["profiles", "id"], ["stores", "owner_user_id"], ["listings", "owner_user_id"], ["listing_revisions", "owner_user_id"], ["notifications", "user_id"]]) {
        const remaining = await service.from(table).select(column, { count: "exact", head: true }).in(column, ids);
        assert.equal(remaining.error, null);
        assert.equal(remaining.count, 0, `${table} fixture residue.`);
      }
    }
    console.log("QA residue: 0 fixture users/profiles/stores/listings/revisions/revision photos/notifications/storage objects.");
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

async function testValidation(id, session, otherSession, live) {
  const publicEditPath = `${session.user.id}/listing-edits/${id}/${crypto.randomUUID()}/0.png`;
  objects.push({ bucket: "listing-photos", path: publicEditPath });
  assert.ok((await session.client.storage.from("listing-photos").upload(publicEditPath, png, { contentType: "image/png" })).error, "Public bucket cannot stage new revision uploads.");
  for (const invalid of [live.slice(0, 1), [...live, live[0]], Array.from({ length: 11 }, (_, n) => live[n % live.length])]) {
    await edit(id, session, { photos: invalid }, 400);
    await assertLive(id, live);
  }
  const otherPath = `${otherSession.user.id}/listing-edits/${id}/${crypto.randomUUID()}/0.png`;
  const forbidden = await session.client.storage.from(privateBucket).upload(otherPath, png, { contentType: "image/png" });
  assert.ok(forbidden.error, "Owner must not upload into another user folder.");
  const anotherListing = await submitListing("listing", session, "QA Sprint 4 otra publicación");
  const wrongListing = await uploadEdit(session, anotherListing.id, 0);
  await edit(id, session, { photos: [...live.slice(0, 2), wrongListing.input] }, 400);
  const missing = `${session.user.id}/listing-edits/${id}/${crypto.randomUUID()}/0.png`;
  await edit(id, session, { photos: [...live.slice(0, 2), { path: missing }] }, 400);
  const htmlPath = `${session.user.id}/listing-edits/${id}/${crypto.randomUUID()}/0.png`;
  assert.ok((await session.client.storage.from(privateBucket).upload(htmlPath, Buffer.from("not an allowed MIME"), { contentType: "text/html" })).error);
  const bigPath = `${session.user.id}/listing-edits/${id}/${crypto.randomUUID()}/0.png`;
  assert.ok((await session.client.storage.from(privateBucket).upload(bigPath, Buffer.alloc(5242881), { contentType: "image/png" })).error);
  await edit(id, otherSession, { photos: live }, 404);
  const denied = await session.client.rpc("review_listing_revision", { p_revision_id: crypto.randomUUID(), p_decision: "approve", p_expected_version: 1 });
  assert.ok(denied.error, "Ordinary owner cannot moderate a photo revision.");
  const direct = await session.client.from("listing_photos").update({ sort_order: 9 }).eq("listing_id", id).select("id");
  assert.ok(direct.error || direct.data.length === 0, "Owner cannot bypass the canonical photo RPC.");

  const extra = [];
  for (let index = 0; index < 7; index++) extra.push(await uploadEdit(session, id, index));
  const ten = [...live, ...extra.map((item) => item.input)];
  const result = await edit(id, session, { photos: ten });
  await assertProposal(id, result.revision_id, ten);
  assert.equal(ten.length, 10);
  await edit(id, session, { photos: live });
  for (const item of extra) await cleanup(id, session, [item.path]);
  assert.equal((await pending(id)), null);
  console.log("PASS 2–10/MIME/size/duplicate/provenance/ownership: 10 succeeds, 1/11/duplicates/foreign/missing paths fail, direct table/moderation bypass denied.");
}

async function testRevert(id, session, live) {
  const proposal = await edit(id, session, { moderated: { model: "QA conserver proposition" } });
  const staged = await uploadEdit(session, id, 7);
  await edit(id, session, { photos: [live[0], staged.input] });
  const restored = await edit(id, session, { photos: live });
  assert.equal(restored.revision_id, proposal.revision_id);
  const revision = await pending(id);
  assert.deepEqual(revision.changed_fields, ["model"]);
  assert.equal(revision.listing_revision_photos.length, 0);
  await cleanup(id, session, [staged.path]);
  assert.equal(await exists(privateBucket, staged.path), false);
  const originalModel = (await service.from("listings").select("model").eq("id", id).single()).data.model;
  const cancelled = await edit(id, session, { moderated: { model: originalModel } });
  assert.equal(cancelled.mode, "revision_cancelled");
  assert.equal(await pending(id), null);
  await assertLive(id, live);
  console.log("PASS revert: returning to exact live set drops only photo component; final field restoration safely cancels empty proposal; exclusive staged object removed.");
}

async function testSignedRetries(id, session, otherSession, live) {
  const failedAttempt = await request(`/api/listings/${id}/manage`, session, { action: "start_edit" });
  assert.equal(failedAttempt.bucket, privateBucket);
  const firstPath = `${failedAttempt.folder}/0.png`;
  objects.push({ bucket: privateBucket, path: firstPath });
  assert.equal((await session.client.storage.from(privateBucket).upload(firstPath, png, { contentType: "image/png" })).error, null);
  const partial = await session.client.storage.from(privateBucket).upload(`${failedAttempt.folder}/1.png`, Buffer.from("invalid MIME"), { contentType: "text/html" });
  assert.ok(partial.error);
  await cleanup(id, session, [firstPath]);
  assert.equal(await exists(privateBucket, firstPath), false);

  const started = await request(`/api/listings/${id}/manage`, session, { action: "start_edit" });
  assert.ok(started.token && started.attemptId);
  const paths = [0, 1].map((n) => `${started.folder}/${n}.png`);
  for (const path of paths) {
    objects.push({ bucket: privateBucket, path });
    assert.equal((await session.client.storage.from(privateBucket).upload(path, png, { contentType: "image/png" })).error, null);
  }
  const uploadReplay = await session.client.storage.from(privateBucket).upload(paths[0], png, { contentType: "image/png" });
  assert.ok(uploadReplay.error, "Immutable upload replay must report already-exists rather than overwrite.");
  const payload = { token: started.token, photos: [live[0], ...paths.map((path) => ({ path, alt_text: "QA retry" }))] };
  const first = await edit(id, session, payload);
  const replay = await edit(id, session, payload);
  assert.equal(replay.revision_id, first.revision_id);
  assert.equal(replay.revision_version, first.revision_version, "Lost-success response retry cannot amend/increment the proposal.");
  const before = await pending(id);
  await request(`/api/listings/${id}/manage`, session, { action: "edit", immediate: {}, moderated: {}, ...payload, photos: [...payload.photos].reverse() }, 409);
  assert.equal((await pending(id)).version, before.version);
  await request(`/api/listings/${id}/manage`, otherSession, { action: "edit", immediate: {}, moderated: {}, ...payload }, [403, 404]);
  await cleanup(id, session, paths);
  for (const path of paths) assert.equal(await exists(privateBucket, path), true, "Committed proposal survives cleanup after uncertain response.");
  await edit(id, session, { photos: live });
  assert.equal(await pending(id), null);
  await cleanup(id, session, paths);
  for (const path of paths) assert.equal(await exists(privateBucket, path), false);
  console.log("PASS signed edit retries: partial-upload cleanup+recovery; immutable path; same-token replay no duplicate/version change; changed payload/other owner denied; committed refs never deleted.");
}

async function testRejectionAndCleanup(id, session, otherSession, adminSession, live) {
  const staged = await uploadEdit(session, id, 8);
  const result = await edit(id, session, { photos: [staged.input, live[0]] });
  await rpc(adminSession.client, "review_listing_revision", { p_revision_id: result.revision_id, p_decision: "reject", p_expected_version: result.revision_version, p_reason: "QA foto no corresponde" });
  await assertLive(id, live);
  await assertImage(staged.image_url, 404);
  await assertImage(staged.image_url, 200, session.cookie);
  await assertImage(staged.image_url, 200, adminSession.cookie);
  await assertImage(staged.image_url, 404, otherSession.cookie);
  await cleanup(id, session, [staged.path]);
  assert.equal(await exists(privateBucket, staged.path), true, "Retained rejected audit ref must never be deleted.");
  const rejection = await session.client.from("listing_revisions").select("rejection_reason").eq("id", result.revision_id).single();
  assert.equal(rejection.data.rejection_reason, "QA foto no corresponde");
  const unused = await uploadEdit(session, id, 9);
  await cleanup(id, otherSession, [unused.path], 404);
  assert.equal(await exists(privateBucket, unused.path), true);
  await cleanup(id, session, [unused.path]);
  await cleanup(id, session, [unused.path]);
  assert.equal(await exists(privateBucket, unused.path), false);
  await edit(id, session, { photos: [live[0], unused.input] }, 400);
  console.log("PASS rejection/cleanup: rejected audit stays private+retained; unrelated cleanup denied; unreferenced object retirement+deletion is replay-safe and cannot relink.");
}

async function testNonpublicStates(session, adminSession) {
  for (const status of ["pending", "rejected", "draft"]) {
    const created = await submitListing("listing", session, `QA Sprint 4 ${status}`);
    if (status === "rejected") await rpc(adminSession.client, "review_listing", { p_listing_id: created.id, p_decision: "reject", p_reason: "QA rechazo de fotos" });
    if (status === "draft") {
      // Draft is legacy-only, not a product action. Seed exactly this local fixture
      // through Postgres rather than weakening the protected-field trigger.
      assert.match(created.id, /^[0-9a-f-]{36}$/);
      const fixture = spawnSync("docker", ["exec", "-i", "supabase_db_mkt_instrumentos", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { encoding: "utf8", input: `begin; select set_config('app.allow_listing_admin_fields','true',true); update public.listings set status='draft' where id='${created.id}'; commit;` });
      assert.equal(fixture.status, 0, fixture.stderr);
    }
    const existing = await livePhotos(created.id);
    const staged = await uploadEdit(session, created.id, 0);
    const direct = await edit(created.id, session, { photos: [existing[0], staged.input] });
    assert.equal(direct.mode, "direct");
    assert.equal(await pending(created.id), null);
    assert.equal((await service.from("listings").select("status").eq("id", created.id).single()).data.status, status);
    await assertImage(staged.image_url, 404);
    await assertImage(staged.image_url, 200, session.cookie);
  }
  const hidden = await submitListing("listing", session, "QA Sprint 4 oculta propietario");
  await rpc(adminSession.client, "review_listing", { p_listing_id: hidden.id, p_decision: "approve" });
  await lifecycle(hidden.id, session, "hide");
  const old = await livePhotos(hidden.id);
  const staged = await uploadEdit(session, hidden.id, 0);
  const result = await edit(hidden.id, session, { photos: [old[0], staged.input] });
  assert.equal(result.mode, "revision", "Owner-hidden state must not bypass normal moderation.");
  await assertLive(hidden.id, old);
  await lifecycle(hidden.id, session, "restore");
  await assertImage(staged.image_url, 404);
  await assertLive(hidden.id, old);
  await rpc(adminSession.client, "review_listing", { p_listing_id: hidden.id, p_decision: "hide", p_reason: "QA oculta moderacion" });
  await edit(hidden.id, session, { photos: old }, 409);
  console.log("PASS draft/pending/rejected direct edits stay nonpublic; owner-hidden photo edits stay moderated; admin-hidden restriction preserved.");
}

async function testStoreTier(normalSession, verifiedSession, adminSession) {
  for (const [session, verified] of [[normalSession, false], [verifiedSession, true]]) {
    const store = await submitStore(session, verified ? "QA Sprint 4 verificada" : "QA Sprint 4 normal");
    await rpc(adminSession.client, "review_store_application", { p_store_id: store.id, p_decision: "approve" });
    if (verified) await rpc(adminSession.client, "set_store_verification", { p_store_id: store.id, p_verified: true });
    const created = await submitListing("store_listing", session, verified ? "QA Sprint 4 directo" : "QA Sprint 4 moderado");
    if (!verified) await rpc(adminSession.client, "review_listing", { p_listing_id: created.id, p_decision: "approve" });
    const before = await livePhotos(created.id);
    const d = await uploadEdit(session, created.id, 0);
    const editSet = [d.input, before[2], before[0]];
    const result = await edit(created.id, session, { photos: editSet });
    assert.equal(result.mode, verified ? "direct" : "revision");
    if (verified) {
      await assertLive(created.id, editSet);
      assert.equal(await pending(created.id), null);
      await assertImage(d.image_url, 200);
      await edit(created.id, session, { photos: [before[0], d.input] });
      await assertLive(created.id, [before[0], d.input]);
      const e = await uploadEdit(session, created.id, 1);
      await edit(created.id, session, { photos: [e.input, d.input, before[0]] });
      await assertLive(created.id, [e.input, d.input, before[0]]);
      assert.equal(await pending(created.id), null);
      await cleanup(created.id, session, [d.path]);
      assert.equal(await exists(privateBucket, d.path), true, "Live verified object cannot be cleaned.");
      await rpc(adminSession.client, "review_store_application", { p_store_id: store.id, p_decision: "hide", p_reason: "QA parent privacy" });
      await assertImage(d.image_url, 404);
      assert.equal((await anonymous.from("listings").select("id").eq("id", created.id)).data.length, 0);
      await rpc(adminSession.client, "review_store_application", { p_store_id: store.id, p_decision: "approve" });
      await rpc(adminSession.client, "set_store_verification", { p_store_id: store.id, p_verified: false });
      const afterRevocation = await edit(created.id, session, { photos: [d.input, e.input, before[0]] });
      assert.equal(afterRevocation.mode, "revision");
      await assertLive(created.id, [e.input, d.input, before[0]]);
    } else {
      await assertLive(created.id, before);
      await assertImage(d.image_url, 404);
      await rpc(adminSession.client, "review_listing_revision", { p_revision_id: result.revision_id, p_decision: "approve", p_expected_version: result.revision_version });
      await assertLive(created.id, editSet);
      await assertImage(d.image_url, 200);
    }
  }
  console.log("PASS Tienda moderated photos / Tienda Verificada direct add+remove+replace+order; parent-store public eligibility; revocation removes direct authority immediately.");
}

async function testSoldAndRelist(id, session, live) {
  await lifecycle(id, session, "sold");
  await edit(id, session, { photos: [...live].reverse() }, 409);
  const soldPhotos = await livePhotos(id);
  const copied = await lifecycle(id, session, "relist");
  listings.push(copied.id);
  await assertLive(copied.id, soldPhotos);
  const newPhoto = await uploadEdit(session, copied.id, 0);
  const result = await edit(copied.id, session, { photos: [newPhoto.input, soldPhotos[0]] });
  assert.equal(result.mode, "direct");
  await assertLive(id, soldPhotos);
  await assertLive(copied.id, [newPhoto.input, soldPhotos[0]]);
  const soldPrivatePath = soldPhotos.map((p) => p.image_url).find((value) => value.startsWith("/api/listing-images/"))?.slice("/api/listing-images/".length);
  assert.ok(soldPrivatePath);
  await cleanup(id, session, [soldPrivatePath]);
  assert.equal(await exists(privateBucket, soldPrivatePath), true, "Sold/shared photo identity is retained.");
  await assertImage(`/api/listing-images/${soldPrivatePath}`, 200);
  await assertImage(newPhoto.image_url, 404);
  const soldRow = await service.from("listings").select("status,title").eq("id", id).single();
  assert.equal(soldRow.data.status, "sold");
  console.log("PASS sold/relist: new listing identity and exclusive edits; immutable sold ordered set; shared live/history storage retained.");
}

async function createUser(label, type, appMetadata = {}) {
  const user = { email: `s4-photo-${label}-${suffix}@example.invalid`, password: `Qa-${crypto.randomUUID()}` };
  const created = await service.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true, app_metadata: appMetadata, user_metadata: { account_type: type, full_name: "QA Sprint 4 Fotos", phone: "51999999301", city: "Lima", region: "Lima" } });
  assert.equal(created.error, null);
  user.id = created.data.user.id;
  users.push(user);
  return user;
}
async function signIn(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  assert.equal((await client.auth.signInWithPassword({ email: user.email, password: user.password })).error, null);
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }) });
  assert.equal(response.status, 200);
  return { user, client, cookie: response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ") };
}
async function request(path, session, body, expected = 200) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: session.cookie }, body: JSON.stringify(body) });
  const result = await response.json();
  if (Array.isArray(expected)) assert.ok(expected.includes(response.status), `${path}: ${response.status} ${result.message ?? JSON.stringify(result)}`);
  else assert.equal(response.status, expected, `${path}: ${result.message ?? JSON.stringify(result)}`);
  return result;
}
async function submitListing(kind, session, title) {
  const started = await request("/api/submissions", session, { action: "start", kind });
  listings.push(started.id);
  const paths = [0, 1, 2].map((n) => `${started.folder}/${n}.png`);
  for (const path of paths) {
    objects.push({ bucket: "listing-photos", path });
    assert.equal((await session.client.storage.from("listing-photos").upload(path, png, { contentType: "image/png" })).error, null);
  }
  await request("/api/submissions", session, { action: "complete", token: started.token, paths, roles: paths.map(() => null), fields: { title, category: "guitars", instrument_type: "electric_guitar", attributes: { body_type: "solid_body" }, brand: "Yamaha", model: "QA 112J", condition: "Usado - buen estado", price_pen: 1200, city: "Lima", region: "Lima", description: "Registro temporal para comprobar de manera determinista las fotos de Sprint cuatro.", marketplace_rules_accepted: true } });
  return started;
}
async function submitStore(session, name) {
  const started = await request("/api/submissions", session, { action: "start", kind: "store" });
  stores.push(started.id);
  await request("/api/submissions", session, { action: "complete", token: started.token, paths: [], roles: [], fields: { name, razon_social: `${name} SAC`, ruc: `20${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, email: session.user.email, contact_person: "QA Fotos", whatsapp_phone: "51999999301", city: "Lima", region: "Lima", address: "Av. Temporal QA Fotos 4" } });
  return started;
}
async function uploadEdit(session, id, index) {
  const path = `${session.user.id}/listing-edits/${id}/${crypto.randomUUID()}/${index}.png`;
  objects.push({ bucket: privateBucket, path });
  assert.equal((await session.client.storage.from(privateBucket).upload(path, png, { contentType: "image/png" })).error, null);
  return { path, image_url: `/api/listing-images/${path}`, input: { path, alt_text: `QA foto ${index}` } };
}
async function edit(id, session, values = {}, expected = 200) {
  return (await request(`/api/listings/${id}/manage`, session, { action: "edit", immediate: {}, moderated: {}, ...values }, expected)).result;
}
async function lifecycle(id, session, action) { return (await request(`/api/listings/${id}/manage`, session, { action })).listing; }
async function cleanup(id, session, paths, expected = 200) { return request(`/api/listings/${id}/photo-cleanup`, session, { paths, bucket: privateBucket }, expected); }
async function rpc(client, name, args) { const result = await client.rpc(name, args); assert.equal(result.error, null, `${name}: ${result.error?.message}`); return result.data; }
async function livePhotos(id) { const result = await service.from("listing_photos").select("image_url,alt_text,sort_order").eq("listing_id", id).order("sort_order"); assert.equal(result.error, null); return result.data; }
async function pending(id) { const result = await service.from("listing_revisions").select("id,title,version,changed_fields,listing_revision_photos(image_url,alt_text,sort_order)").eq("listing_id", id).eq("status", "pending").maybeSingle(); assert.equal(result.error, null); return result.data; }
function effectiveUrls(photos) { return photos.map((photo) => photo.image_url ?? `/api/listing-images/${photo.path}`); }
async function assertLive(id, photos) { assert.deepEqual((await livePhotos(id)).map((photo) => photo.image_url), effectiveUrls(photos)); }
async function assertProposal(id, revisionId, photos, title) { const result = await pending(id); assert.ok(result); assert.equal(result.id, revisionId); if (title) assert.equal(result.title, title); assert.deepEqual(result.listing_revision_photos.sort((a, b) => a.sort_order - b.sort_order).map((p) => p.image_url), effectiveUrls(photos)); assert.deepEqual(result.listing_revision_photos.map((p) => p.sort_order), photos.map((_, n) => n)); }
async function assertImage(imageUrl, expected, cookie) { const response = await fetch(new URL(imageUrl, base), { headers: cookie ? { Cookie: cookie } : {} }); assert.equal(response.status, expected, `${imageUrl}: expected privacy/byte response ${expected}`); if (expected === 200) { assert.match(response.headers.get("content-type") ?? "", /^image\//); assert.ok((await response.arrayBuffer()).byteLength > 0); } }
async function exists(bucket, path) { const folder = path.slice(0, path.lastIndexOf("/")); const name = path.slice(path.lastIndexOf("/") + 1); const result = await service.storage.from(bucket).list(folder, { search: name }); assert.equal(result.error, null); return result.data.some((entry) => entry.name === name); }
