// Local-only Sprint 8 report and legacy-link concurrency verification.
// The test uses only temporary fixtures and always removes them.
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");

loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local Supabase only");

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anonKey, "Local anon key required");
assert.ok(serviceKey, "Local service-role key required");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const suffix = crypto.randomUUID();
const users = [];
const listingIds = [];
const revisionIds = [];

async function ok(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}

async function account(label, { admin = false } = {}) {
  const email = `s8-${label}-${suffix}@example.invalid`;
  const password = `Qa-${crypto.randomUUID()}`;
  const created = await ok(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: admin ? { role: "admin" } : {},
    user_metadata: {
      account_type: "seller",
      full_name: `QA Sprint 8 ${label}`,
      phone: "51999997888",
      city: "Lima",
      region: "Lima",
    },
  }));
  users.push(created.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  await ok(await client.auth.signInWithPassword({ email, password }));
  return { id: created.user.id, client };
}

async function listing(ownerId, label, { legacy = false } = {}) {
  const id = crypto.randomUUID();
  listingIds.push(id);
  await ok(await service.from("listings").insert({
    id,
    slug: `s8-race-${label}-${id}`,
    title: `Publicación Sprint 8 ${label}`,
    seller_type: "individual",
    status: "approved",
    category: "guitars",
    instrument_type: "electric_guitar",
    attributes: {},
    brand: "QA",
    model: label,
    condition: "Usado - buen estado",
    price_pen: 1500,
    city: "Lima",
    region: "Lima",
    contact_name: "Contacto histórico QA",
    whatsapp_phone: "51999997888",
    description: "Descripción suficientemente extensa para la prueba local de concurrencia de Sprint 8.",
    owner_user_id: legacy ? null : ownerId,
    created_by_source: legacy ? "legacy" : "admin",
    marketplace_rules_accepted_at: legacy ? null : new Date().toISOString(),
    published_at: new Date().toISOString(),
  }));
  await ok(await service.from("listing_photos").insert([
    { listing_id: id, image_url: `https://example.invalid/${id}-0.jpg`, sort_order: 0 },
    { listing_id: id, image_url: `https://example.invalid/${id}-1.jpg`, sort_order: 1 },
  ]));
  return id;
}

function report(client, listingId, reason) {
  return client.rpc("submit_content_report", {
    p_target_type: "listing",
    p_target_id: listingId,
    p_reason: reason,
    p_detail: "Prueba concurrente local de Sprint 8",
  });
}

(async () => {
  try {
    const owner = await account("owner");
    const reporterA = await account("reporter-a");
    const reporterB = await account("reporter-b");
    const reporterC = await account("reporter-c");
    const adminA = await account("admin-a", { admin: true });
    const adminB = await account("admin-b", { admin: true });

    const publicListingId = await listing(owner.id, "report-target");

    // ADMIN-005: inspect an actual photo-only proposal through both readers,
    // then amend that same version into an attribute-only proposal.
    const revisionId = crypto.randomUUID();
    revisionIds.push(revisionId);
    await ok(await service.from("listing_revisions").insert({
      id: revisionId, listing_id: publicListingId, owner_user_id: owner.id,
      status: "pending", version: 1, changed_fields: ["photos"],
    }));
    await ok(await service.from("listing_revision_photos").insert([
      { revision_id: revisionId, image_url: `/api/listing-images/${revisionId}-front.jpg`, alt_text: "Frente propuesto", sort_order: 0 },
      { revision_id: revisionId, image_url: `/api/listing-images/${revisionId}-back.jpg`, alt_text: "Reverso propuesto", sort_order: 1 },
    ]));
    async function readRevision() {
      const queue = await ok(await adminA.client.rpc("get_admin_moderation_queue", { p_queue: "revisiones", p_page_size: 25 }));
      const page = await ok(await adminA.client.rpc("get_admin_domain_page", {
        p_domain: "revisiones", p_search: "Publicación Sprint 8 report-target", p_status: "pending", p_page_size: 10,
      }));
      const queued = queue.items.find((row) => row.id === revisionId);
      const inspected = page.items.find((row) => row.id === revisionId);
      assert.ok(queued && inspected, "proposal exists in workbench and domain page");
      for (const key of ["version", "changed_fields", "current_values", "proposed_values", "current_photos", "proposed_photos"]) {
        assert.deepEqual(queued[key], inspected[key], `reader agreement: ${key}`);
      }
      return inspected;
    }
    let proposal = await readRevision();
    assert.deepEqual(proposal.changed_fields, ["photos"]);
    assert.equal(proposal.current_photos.length, 2);
    assert.equal(proposal.proposed_photos.length, 2);
    assert.equal(proposal.current_photos[0].image_url, `https://example.invalid/${publicListingId}-0.jpg`);
    assert.equal(proposal.proposed_photos[0].image_url, `/api/listing-images/${revisionId}-front.jpg`);
    assert.equal(proposal.proposed_values.instrument_type, "electric_guitar", "unchanged type retains formatting context");
    await ok(await service.from("listing_revisions").update({
      version: 2, changed_fields: ["attributes"], attributes: { strings: "7", bridge: "tremolo" },
    }).eq("id", revisionId));
    proposal = await readRevision();
    assert.equal(proposal.version, 2, "both readers expose the amended version");
    assert.deepEqual(proposal.current_values.attributes, {});
    assert.deepEqual(proposal.proposed_values.attributes, { strings: "7", bridge: "tremolo" });
    const staleDecision = await adminA.client.rpc("review_listing_revision", {
      p_revision_id: revisionId, p_decision: "approve", p_expected_version: 1,
    });
    assert.match(staleDecision.error?.message ?? "", /STALE/, "reader changes preserve stale-decision authority");

    const duplicateRace = await Promise.all([
      report(reporterA.client, publicListingId, "spam"),
      report(reporterA.client, publicListingId, "informacion_falsa"),
    ]);
    assert.equal(duplicateRace.filter((result) => !result.error).length, 1, "same reporter race has one winner");
    assert.equal(duplicateRace.filter((result) => result.error).length, 1, "same reporter race rejects one request");
    assert.match(
      duplicateRace.find((result) => result.error).error.message,
      /REPORT_ALREADY_SUBMITTED/,
      "duplicate report returns the canonical safe error",
    );
    let persisted = await ok(await service
      .from("reports")
      .select("id,reporter_user_id,status")
      .eq("listing_id", publicListingId)
      .eq("reporter_user_id", reporterA.id)
      .eq("status", "open"));
    assert.equal(persisted.length, 1, "same reporter leaves exactly one open report");

    const distinctReporterRace = await Promise.all([
      report(reporterB.client, publicListingId, "posible_estafa"),
      report(reporterC.client, publicListingId, "articulo_prohibido"),
    ]);
    assert.ok(
      distinctReporterRace.every((result) => !result.error),
      distinctReporterRace.map((result) => result.error?.message),
    );
    persisted = await ok(await service
      .from("reports")
      .select("id,reporter_user_id,status")
      .eq("listing_id", publicListingId)
      .eq("status", "open"));
    assert.equal(persisted.length, 3, "different reporters retain independent open reports");
    assert.equal(new Set(persisted.map((row) => row.reporter_user_id)).size, 3);
    const reportPage = await ok(await adminA.client.rpc("get_admin_reports_page", { p_search: publicListingId }));
    assert.equal(reportPage.items.length, 3);
    assert.ok(reportPage.items.every((row) => row.target_report_count === 3 && row.open_target_report_count === 3), "target-specific report counts preserve semantics");

    // ADMIN-030: the authoritative Admin transition cancels the pending
    // proposal and creates neither kind of buyer relationship.
    await ok(await adminA.client.rpc("review_listing", { p_listing_id: publicListingId, p_decision: "sold" }));
    const cancelled = await ok(await service.from("listing_revisions").select("status,reviewed_at").eq("id", revisionId).single());
    assert.equal(cancelled.status, "cancelled");
    assert.ok(cancelled.reviewed_at);
    for (const table of ["transaction_claims", "verified_transactions"]) {
      const relations = await ok(await service.from(table).select("id").eq("listing_id", publicListingId));
      assert.deepEqual(relations, [], `Admin mark-sold creates no ${table}`);
    }

    const legacyListingId = await listing(null, "legacy-target", { legacy: true });
    const legacyRace = await Promise.all([
      adminA.client.rpc("link_legacy_listing_owner", {
        p_listing_id: legacyListingId,
        p_owner_user_id: reporterB.id,
        p_note: "Selección explícita del candidato B",
      }),
      adminB.client.rpc("link_legacy_listing_owner", {
        p_listing_id: legacyListingId,
        p_owner_user_id: reporterC.id,
        p_note: "Selección explícita del candidato C",
      }),
    ]);
    assert.equal(legacyRace.filter((result) => !result.error).length, 1, "legacy-link race has one winner");
    assert.equal(legacyRace.filter((result) => result.error).length, 1, "legacy-link race rejects one request");
    const winnerIndex = legacyRace.findIndex((result) => !result.error);
    const winningAdminId = [adminA.id, adminB.id][winnerIndex];
    const winningOwnerId = [reporterB.id, reporterC.id][winnerIndex];
    assert.match(
      legacyRace.find((result) => result.error).error.message,
      /LEGACY_LISTING_NOT_ELIGIBLE|LEGACY_LISTING_ALREADY_LINKED/,
      "losing legacy-link request fails with a canonical eligibility error",
    );

    const linked = await ok(await service
      .from("listings")
      .select("owner_user_id,status,contact_name,whatsapp_phone")
      .eq("id", legacyListingId)
      .single());
    assert.equal(linked.owner_user_id, winningOwnerId, "the winning request selects the persisted Particular owner");
    assert.equal(linked.status, "approved", "linking preserves listing state");
    assert.equal(linked.contact_name, "Contacto histórico QA", "linking preserves historical contact");
    assert.equal(linked.whatsapp_phone, "51999997888", "linking preserves historical WhatsApp");

    const audits = await ok(await service
      .from("admin_audit_actions")
      .select("id,admin_user_id,detail")
      .eq("target_type", "legacy_link")
      .eq("target_id", legacyListingId)
      .eq("action", "legacy_owner_linked"));
    assert.equal(audits.length, 1, "legacy-link race records one durable audit action");
    assert.equal(audits[0].admin_user_id, winningAdminId, "the winning Admin is recorded");
    assert.equal(audits[0].detail.owner_user_id, linked.owner_user_id);

    console.log("PASS Sprint 8 revision inspection/stale decisions, Admin mark-sold, concurrent reports and one-time legacy linking.");
  } finally {
    if (listingIds.length) {
      await service.from("reports").delete().in("listing_id", listingIds);
      await service.from("admin_audit_actions").delete().in("target_id", listingIds);
      if (revisionIds.length) {
        await ok(await service.from("admin_audit_actions").delete().in("target_id", revisionIds));
        await ok(await service.from("listing_revision_photos").delete().in("revision_id", revisionIds));
        await ok(await service.from("listing_revisions").delete().in("id", revisionIds));
      }
      await service.from("listings").delete().in("id", listingIds);
    }
    for (const id of users) await service.auth.admin.deleteUser(id);

    const remainingUsers = await ok(await service.auth.admin.listUsers({ perPage: 1000 }));
    assert.equal(remainingUsers.users.filter((user) => users.includes(user.id)).length, 0, "all QA users removed");
    if (listingIds.length) {
      assert.equal((await ok(await service.from("listings").select("id").in("id", listingIds))).length, 0, "all QA listings removed");
      assert.equal((await ok(await service.from("listing_photos").select("id").in("listing_id", listingIds))).length, 0, "all QA listing photos removed");
      assert.equal((await ok(await service.from("reports").select("id").in("listing_id", listingIds))).length, 0, "all QA reports removed");
      assert.equal((await ok(await service.from("admin_audit_actions").select("id").in("target_id", listingIds))).length, 0, "all QA audits removed");
      if (revisionIds.length) {
        assert.equal((await ok(await service.from("listing_revisions").select("id").in("id", revisionIds))).length, 0, "all QA revisions removed");
        assert.equal((await ok(await service.from("listing_revision_photos").select("id").in("revision_id", revisionIds))).length, 0, "all QA proposed photos removed");
        assert.equal((await ok(await service.from("admin_audit_actions").select("id").in("target_id", revisionIds))).length, 0, "all QA revision audits removed");
      }
    }
    console.log("QA cleanup: Sprint 8 users, listings, reports and audit rows removed.");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
