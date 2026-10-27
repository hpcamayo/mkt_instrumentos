// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-05 "Campañas Laria". Unit checks for
// parsing, dates without countdowns, the listing line, the cards' "Antes", the forms (nothing preselected) and the
// routes; the database rules are in tests/store-reach-campaigns.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  // The forms only refresh or move after a save; rendering them needs no mounted router.
  if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
  return load.call(this, request, ...rest);
};

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const {
  parseCampaign, parseStoreCampaigns, parseCampaignOptions, parsePublicCampaign, parseLiveCampaignMarks, campaignMarkForListing,
  campaignDiscountPct, campaignPeriodLabel, campaignPhaseLine, campaignCards, limaLocalToIso, isoToLimaLocal,
} = require("@/lib/campaigns");
const { notificationHref, notificationLabel } = require("@/lib/notifications");

const CAMPAIGN = {
  id: "c1", slug: "navidad-2026", name: "Navidad 2026", description: "Instrumentos para regalar.",
  starts_at: "2026-12-15T05:00:00+00:00", ends_at: "2027-01-01T05:00:00+00:00", min_discount_pct: 10,
  status: "published", phase: "live", revision: 3,
};
const ENTRY = {
  id: "e1", campaign_id: "c1", listing_id: "l1", listing_title: "Yamaha P-45", listing_slug: "yamaha-p-45",
  campaign_price_pen: 850, reference_price_pen: 1000, price_before_pen: 1000, after_campaign: "restore", status: "live",
  status_reason: null, applied_at: "2026-12-15T05:10:00+00:00", ended_at: null, created_at: "2026-12-01T12:00:00+00:00",
};

test("reach-05: rows parse strictly", () => {
  assert.equal(parseCampaign(CAMPAIGN).minDiscountPct, 10);
  assert.equal(parseCampaign({ ...CAMPAIGN, phase: "soon" }), null);
  assert.equal(parseCampaign({ ...CAMPAIGN, revision: "3" }), null);
  const [store] = parseStoreCampaigns([{ ...CAMPAIGN, entries: [ENTRY, { ...ENTRY, id: "e2", after_campaign: null }] }, { id: 1 }]);
  assert.equal(store.entries.length, 1, "an entry without the store's explicit choice is dropped");
  const options = parseCampaignOptions({ ...CAMPAIGN, listings: [
    { id: "l1", title: "Yamaha P-45", slug: "yamaha-p-45", price_pen: 1000, reference_price_pen: 1000, max_campaign_price_pen: 900, eligible_from: "2026-11-01", problem_code: null, problem: null, entry: null },
    { id: "l2", title: "Roland", price_pen: 900, problem_code: "CAMPAIGN_PRICE_RAISED", problem: "El precio actual…", entry: ENTRY },
    { title: "sin id" },
  ] });
  assert.equal(options.listings.length, 2);
  assert.equal(options.listings[0].maxCampaignPrice, 900);
  assert.equal(options.listings[1].entry.id, "e1");
  const page = parsePublicCampaign({ ...CAMPAIGN, total: 2, entries: [
    { listing_id: "l1", campaign_price_pen: 850, reference_price_pen: 1000, applied_at: ENTRY.applied_at },
    { listing_id: "l2", campaign_price_pen: "800" },
  ] });
  assert.equal(page.total, 2);
  assert.equal(page.entries.length, 1);
});

test("reach-05: dates are plain dates in Lima, never a countdown", () => {
  const campaign = parseCampaign(CAMPAIGN);
  assert.equal(campaignPeriodLabel(campaign), "Del 15 de diciembre al 31 de diciembre de 2026");
  assert.equal(campaignPeriodLabel({ startsAt: "2026-12-20T05:00:00.000Z", endsAt: "2027-01-03T05:00:00.000Z" }), "Del 20 de diciembre de 2026 al 2 de enero de 2027");
  assert.equal(campaignPhaseLine(campaign), "Hasta el 31 de diciembre de 2026");
  assert.equal(campaignPhaseLine({ ...campaign, phase: "upcoming" }), "Empieza el 15 de diciembre de 2026");
  assert.equal(campaignPhaseLine({ ...campaign, phase: "ended" }), "Terminó el 31 de diciembre de 2026");
  assert.equal(limaLocalToIso("2026-12-15T00:00"), "2026-12-15T05:00:00.000Z");
  assert.equal(limaLocalToIso("2026-12-15"), null);
  assert.equal(isoToLimaLocal("2026-12-15T05:00:00+00:00"), "2026-12-15T00:00");
  const copy = ["lib/campaigns.ts", "components/store-reach/campaign-mark.tsx", "app/campanas/page.tsx", "app/campanas/[slug]/page.tsx",
    "components/store-reach/campaign-rules.tsx", "app/mi-cuenta/tienda/campanas/page.tsx"].map(read).join("\n");
  assert.doesNotMatch(copy, /quedan \d|últimas? horas|solo por hoy|termina en \d|cuenta regresiva\b(?! ni)|apúrate|no te lo pierdas/i);
});

test("reach-05: the discount is rounded down and the listing line needs the campaign price", () => {
  assert.equal(campaignDiscountPct(1000, 850), 15);
  assert.equal(campaignDiscountPct(999, 900), 9, "9.9 % reads 9 %");
  assert.equal(campaignDiscountPct(1000, 1000), 0);
  const marks = parseLiveCampaignMarks([
    { listing_id: "l1", slug: "navidad-2026", name: "Navidad 2026", ends_at: "2027-01-01T05:00:00+00:00", campaign_price_pen: 850, reference_price_pen: 1000 },
    { listing_id: "l2" },
  ]);
  assert.equal(marks.length, 1);
  const during = Date.parse("2026-12-20T12:00:00Z");
  assert.equal(campaignMarkForListing(marks, { id: "l1", price_pen: 850, status: "approved" }, during)?.name, "Navidad 2026");
  assert.equal(campaignMarkForListing(marks, { id: "l1", price_pen: 900, status: "approved" }, during), null, "the store changed the price");
  assert.equal(campaignMarkForListing(marks, { id: "l1", price_pen: 850, status: "sold" }, during), null);
  assert.equal(campaignMarkForListing(marks, { id: "l1", price_pen: 850 }, Date.parse("2027-01-02T00:00:00Z")), null, "after the end");
  const { CampaignMark } = require("@/components/store-reach/campaign-mark");
  const html = renderToStaticMarkup(React.createElement(CampaignMark, { mark: marks[0] }));
  assert.match(html, /En Navidad 2026: 15 % menos, hasta el 31 de diciembre de 2026/);
  assert.match(html, /Laria revisó que S\/\s1,000 fue el precio más bajo de esta publicación en los 30 días anteriores a la campaña\./);
  assert.match(html, /href="\/campanas\/navidad-2026"/);
});

test("reach-05: campaign cards show the checked reference as their Antes and skip a changed price", () => {
  const entries = parsePublicCampaign({ ...CAMPAIGN, total: 2, entries: [
    { listing_id: "l2", campaign_price_pen: 700, reference_price_pen: 800, applied_at: ENTRY.applied_at },
    { listing_id: "l1", campaign_price_pen: 850, reference_price_pen: 1000, applied_at: ENTRY.applied_at },
  ] }).entries;
  const cards = campaignCards(entries, [
    { id: "l1", price_pen: 850, previous_price_pen: 990, price_dropped_at: null },
    { id: "l2", price_pen: 750, previous_price_pen: null, price_dropped_at: null },
  ]);
  assert.deepEqual(cards.map((card) => [card.id, card.previous_price_pen, card.price_dropped_at]), [["l1", 1000, ENTRY.applied_at]]);
});

test("reach-05: the store's form starts empty with no choice made", () => {
  const { CampaignJoinForm } = require("@/components/store-reach/campaign-forms");
  const option = parseCampaignOptions({ ...CAMPAIGN, listings: [{ id: "l1", title: "Yamaha P-45", slug: "yamaha-p-45", price_pen: 1000, reference_price_pen: 1000, max_campaign_price_pen: 900 }] }).listings[0];
  const html = renderToStaticMarkup(React.createElement(CampaignJoinForm, { campaign: parseCampaign(CAMPAIGN), option }));
  assert.doesNotMatch(html, /checked/);
  assert.match(html, /name="price"[^>]*value=""/);
  assert.match(html, /Hasta S\/\s900: al menos 10 % menos que S\/\s1,000, el precio más bajo de los últimos 30 días\./);
  assert.match(html, /Volver al precio anterior/);
  assert.match(html, /Mantener el precio de campaña/);
});

test("reach-05: routes check origin and the Admin role, and the job is protected", () => {
  for (const file of ["app/api/store/campaigns/route.ts", "app/api/admin/campaigns/route.ts"]) {
    assert.match(read(file), /if \(!sameOriginEventRequest\(request\)\) return failure\("Solicitud inválida\.", 403\);/, file);
  }
  assert.match(read("app/api/admin/campaigns/route.ts"), /revalidateTag\(CAMPAIGNS_CACHE_TAG\);/);
  const job = read("app/api/internal/jobs/campaigns/route.ts");
  assert.match(job, /if \(!cronAuthorized\(request\)\) return NextResponse\.json\(\{ message: "No autorizado\." \}, \{ status: 401 \}\);/);
  assert.match(job, /rpc\("run_campaign_job"\)/);
  assert.match(read("lib/campaigns-server.ts"), /if \(catalogEnrichmentDisabled\(\)\) return \[\];/);
  assert.match(read("components/store-reach/listing-reach-marks.tsx"), /campaignMarkForListing\(campaigns, listing\)/);
});

test("reach-05: notifications name what happened and open the store's campaigns", () => {
  for (const type of ["store_campaign_entry_ineligible", "store_campaign_entry_removed"]) {
    assert.notEqual(notificationLabel(type), "Actualización de tu cuenta", type);
    assert.equal(notificationHref({ event_type: type, listing_id: null, store_id: "s1" }), "/mi-cuenta/tienda/campanas");
  }
});
