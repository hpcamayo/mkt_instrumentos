// Local-only transaction/review race verification. Always removes fixtures.
const assert = require("node:assert/strict");
const { loadEnvFile } = require("node:process");
const { createClient } = require("@supabase/supabase-js");
loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local Supabase only");
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = crypto.randomUUID();
const users = [];
const listings = [];

async function ok(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}

async function account(label) {
  const email = `s6-${label}-${suffix}@example.invalid`;
  const password = `Qa-${crypto.randomUUID()}`;
  const created = await ok(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "seller", full_name: label, phone: "51999996666", city: "Lima", region: "Lima" },
  }));
  users.push(created.user.id);
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await ok(await client.auth.signInWithPassword({ email, password }));
  return { id: created.user.id, client };
}

async function soldListing(owner, label) {
  const id = crypto.randomUUID();
  listings.push(id);
  await ok(await service.from("listings").insert({
    id,
    slug: `s6-${label}-${id}`,
    title: `Sprint 6 ${label}`,
    seller_type: "individual",
    status: "approved",
    category: "guitars",
    instrument_type: "electric_guitar",
    attributes: {},
    brand: "QA",
    model: label,
    condition: "Usado - buen estado",
    price_pen: 1000,
    city: "Lima",
    region: "Lima",
    contact_name: "QA",
    whatsapp_phone: "51999996666",
    description: "Descripción suficientemente extensa para la integración local de Sprint 6.",
    owner_user_id: owner.id,
    created_by_source: "admin",
    marketplace_rules_accepted_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  }));
  await ok(await service.from("listing_photos").insert([
    { listing_id: id, image_url: `https://example.invalid/${id}-0.jpg`, sort_order: 0 },
    { listing_id: id, image_url: `https://example.invalid/${id}-1.jpg`, sort_order: 1 },
  ]));
  await ok(await owner.client.rpc("set_owned_listing_lifecycle", { p_listing_id: id, p_action: "sold" }));
  const sold = await ok(await service.from("listings").select("sold_at").eq("id", id).single());
  return { id, sold_at: sold.sold_at };
}

async function contact(listing, owner, buyer) {
  await ok(await service.from("marketplace_events").insert({
    event_type: "whatsapp_contact",
    listing_id: listing.id,
    seller_user_id: owner.id,
    actor_user_id: buyer.id,
    session_id: crypto.randomUUID(),
    source: "detail",
    created_at: new Date(new Date(listing.sold_at).getTime() - 60_000).toISOString(),
  }));
}

async function verified(owner, buyer, label) {
  const listing = await soldListing(owner, label);
  await contact(listing, owner, buyer);
  const claimId = await ok(await owner.client.rpc("create_transaction_claim", { p_listing_id: listing.id, p_buyer_user_id: buyer.id }));
  const response = await ok(await buyer.client.rpc("respond_transaction_claim", { p_claim_id: claimId, p_confirmed: true }));
  return { listing, claimId, transactionId: response.transaction_id };
}

(async () => {
  try {
    const owner = await account("owner");
    const buyerA = await account("buyer-a");
    const buyerB = await account("buyer-b");

    const claimRace = await soldListing(owner, "claim-race");
    await Promise.all([contact(claimRace, owner, buyerA), contact(claimRace, owner, buyerB)]);
    const competing = await Promise.all([
      owner.client.rpc("create_transaction_claim", { p_listing_id: claimRace.id, p_buyer_user_id: buyerA.id }),
      owner.client.rpc("create_transaction_claim", { p_listing_id: claimRace.id, p_buyer_user_id: buyerB.id }),
    ]);
    assert.ok(competing.every((result) => !result.error), competing.map((result) => result.error?.message));
    let claims = await ok(await service.from("transaction_claims").select("id,status,buyer_user_id").eq("listing_id", claimRace.id));
    assert.equal(claims.filter((row) => row.status === "pending").length, 1, "different-buyer race leaves one pending");
    assert.equal(claims.filter((row) => row.status === "superseded").length, 1, "superseded history retained");
    const active = claims.find((row) => row.status === "pending");
    const idempotent = await Promise.all(Array.from({ length: 4 }, () => owner.client.rpc("create_transaction_claim", {
      p_listing_id: claimRace.id,
      p_buyer_user_id: active.buyer_user_id,
    })));
    assert.ok(idempotent.every((result) => !result.error && result.data === active.id), "same-claim concurrent retry is idempotent");

    const confirmCancel = await soldListing(owner, "confirm-cancel");
    await contact(confirmCancel, owner, buyerA);
    const claimId = await ok(await owner.client.rpc("create_transaction_claim", { p_listing_id: confirmCancel.id, p_buyer_user_id: buyerA.id }));
    const [confirmation, cancellation] = await Promise.all([
      buyerA.client.rpc("respond_transaction_claim", { p_claim_id: claimId, p_confirmed: true }),
      owner.client.rpc("cancel_transaction_claim", { p_claim_id: claimId }),
    ]);
    assert.equal([confirmation, cancellation].filter((result) => !result.error).length, 1, "confirm/cancel race has one winner");
    const finalClaim = await ok(await service.from("transaction_claims").select("status").eq("id", claimId).single());
    assert.ok(["confirmed", "cancelled"].includes(finalClaim.status));
    assert.equal((await ok(await service.from("verified_transactions").select("id").eq("listing_id", confirmCancel.id))).length, finalClaim.status === "confirmed" ? 1 : 0);

    const reviewRace = await verified(owner, buyerA, "review-race");
    const sameDirection = await Promise.all([
      buyerA.client.rpc("submit_transaction_review", { p_transaction_id: reviewRace.transactionId, p_rating: 5, p_comment: "Primera" }),
      buyerA.client.rpc("submit_transaction_review", { p_transaction_id: reviewRace.transactionId, p_rating: 1, p_comment: "Segunda" }),
    ]);
    assert.equal(sameDirection.filter((result) => !result.error).length, 1, "one review per direction under race");
    const sellerRace = await Promise.all([
      owner.client.rpc("submit_transaction_review", { p_transaction_id: reviewRace.transactionId, p_rating: 4, p_comment: "" }),
      owner.client.rpc("submit_transaction_review", { p_transaction_id: reviewRace.transactionId, p_rating: 3, p_comment: "" }),
    ]);
    assert.equal(sellerRace.filter((result) => !result.error).length, 1, "seller review direction is also unique");
    assert.equal((await ok(await service.from("transaction_reviews").select("id").eq("transaction_id", reviewRace.transactionId))).length, 2);
    const publicReputation = await ok(await service.rpc("get_public_reputation", { p_subject_user_id: owner.id, p_limit: 5 }));
    assert.equal(publicReputation.review_count, 1, "paired reviews reveal to public aggregate");

    const simultaneous = await verified(owner, buyerB, "both-directions");
    const both = await Promise.all([
      buyerB.client.rpc("submit_transaction_review", { p_transaction_id: simultaneous.transactionId, p_rating: 5, p_comment: "Comprador" }),
      owner.client.rpc("submit_transaction_review", { p_transaction_id: simultaneous.transactionId, p_rating: 5, p_comment: "Vendedor" }),
    ]);
    assert.ok(both.every((result) => !result.error), both.map((result) => result.error?.message));
    assert.equal((await ok(await service.from("transaction_reviews").select("id").eq("transaction_id", simultaneous.transactionId))).length, 2);
    const detail = await ok(await buyerB.client.rpc("get_transaction_detail", { p_reference_id: simultaneous.transactionId }));
    assert.equal(detail.visible_reviews.length, 2, "simultaneous opposite directions reveal together");

    console.log("PASS Sprint 6 claim/confirm/review concurrency and double-blind integration.");
  } finally {
    if (users.length) {
      await service.from("review_reports").delete().in("reporter_user_id", users);
      const txRows = await ok(await service.from("verified_transactions").select("id").in("seller_user_id", users));
      const txIds = txRows.map((row) => row.id);
      if (txIds.length) {
        await service.from("review_moderation_actions").delete().in("review_id", (await ok(await service.from("transaction_reviews").select("id").in("transaction_id", txIds))).map((row) => row.id));
        await service.from("transaction_reviews").delete().in("transaction_id", txIds);
      }
      await service.from("notifications").delete().in("user_id", users);
      if (txIds.length) await service.from("verified_transactions").delete().in("id", txIds);
      await service.from("transaction_claims").delete().in("seller_user_id", users);
      await service.from("marketplace_events").delete().in("seller_user_id", users);
    }
    if (listings.length) {
      await service.from("listing_photos").delete().in("listing_id", listings);
      await service.from("listings").delete().in("id", listings);
    }
    for (const id of users) await service.auth.admin.deleteUser(id);
    const remaining = await ok(await service.auth.admin.listUsers({ perPage: 1000 }));
    assert.equal(remaining.users.filter((user) => users.includes(user.id)).length, 0);
    console.log("QA cleanup: Sprint 6 users, listings, claims, transactions, reviews and events removed.");
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
