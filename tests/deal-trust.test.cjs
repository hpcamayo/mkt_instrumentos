// Deal-trust batch (docs/feature-ideas/deal-trust.md): the parsers and words of lib/deal-trust.ts, the meetup places,
// the track record line in the WhatsApp message, the counter purchase QR (read back with a separate decoder) and the
// boundaries the pages and routes must keep. Database behavior is in tests/feat-deal-trust.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const trust = require(path.resolve("lib/deal-trust.ts"));
const places = require(path.resolve("lib/safe-meetup-places.ts"));
const qr = require(path.resolve("lib/sale-qr.ts"));
const contactMessage = require(path.resolve("lib/contact-message.ts"));
const read = (file) => fs.readFileSync(file, "utf8");

const UUID = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

// ------------------------------------------------------------------ parsers and words

test("listing trust reads the seller kind, page, level, history and meetup city", () => {
  assert.equal(trust.readListingTrust(null), null);
  assert.equal(trust.readListingTrust({ seller_kind: "admin" }), null);
  const value = trust.readListingTrust({
    seller_kind: "particular",
    seller_page: { slug: "maria-a1b2c3" },
    level: { kind: "particular", since: "2026-10-20T07:30:00Z" },
    provenance: { bought_at: "2026-05-10T15:00:00Z", previous_owners: 1, original: { category: "guitars", brand: "Fender", attributes: {} } },
    safe_spot: null,
    meetup: { city: "Lima", region: "Lima" },
  });
  assert.equal(value.sellerKind, "particular");
  assert.equal(value.sellerPageSlug, "maria-a1b2c3");
  assert.deepEqual(value.level, { kind: "particular", since: "2026-10-20T07:30:00Z" });
  assert.equal(value.provenance.previousOwners, 1);
  assert.equal(value.provenance.original.brand, "Fender");
  assert.deepEqual(value.meetup, { city: "Lima", region: "Lima" });
  // A slug that isn't one is dropped, never linked.
  assert.equal(trust.readListingTrust({ seller_kind: "store", seller_page: { slug: "../x" } }).sellerPageSlug, null);
});

test("the seller page and buyer card are read strictly", () => {
  assert.equal(trust.readSellerPage({ user_id: UUID, slug: "maria-a1b2c3", first_name: "María", member_since: "2026-01-01", verified_sales: -1, active_listings: 2 }), null);
  const page = trust.readSellerPage({ user_id: UUID, slug: "maria-a1b2c3", first_name: "María", city: "Lima", member_since: "2026-01-01", verified_sales: 5, active_listings: 2, level: null });
  assert.equal(page.firstName, "María");
  assert.equal(page.level, null);
  const card = trust.readBuyerCard({ first_name: "Luis", member_since: "2026-02-01", verified_purchases: 3, rating_count: 0, average_rating: 4.2 });
  // No ratings, no average, whatever the row says.
  assert.equal(card.averageRating, null);
  const record = trust.readTrackRecord({ first_name: "Luis", member_since: "2026-02-01", verified_purchases: 3, rating_count: 3, average_rating: 4.67, enabled: true, token: "abc" });
  assert.equal(record.enabled, false, "a malformed token reads as off");
  assert.equal(trust.readMySellerPage({ exists: false, slug: null, hidden: false }), null);
  assert.deepEqual(trust.readMySellerPage({ exists: true, slug: "maria-a1b2c3", hidden: true }), { slug: "maria-a1b2c3", hidden: true });
});

test("the seller level: name, criteria and the owner's progress", () => {
  assert.equal(trust.levelName("particular"), "Vendedor destacado");
  assert.equal(trust.levelName("store"), "Tienda destacada");
  assert.equal(trust.LEVEL_CRITERIA.length, 4);
  assert.match(trust.LEVEL_CRITERIA[1], /4,5 o más/);
  const progress = trust.levelProgress({ verifiedSales: 5, reviewCount: 3, averageRating: 4.67, upheldReports: 0, unansweredQuestions: 1, storeActive: false });
  assert.deepEqual(progress.map((item) => item.met), [true, true, true, false]);
  assert.equal(progress[1].value, "3 reseñas, 4,7 de 5");
  const levels = trust.readMyLevels({ particular: { facts: { verified_sales: 2, review_count: 0, average_rating: null, upheld_reports_90d: 0, unanswered_questions: 0 }, level: null }, store: null });
  assert.equal(levels.particular.facts.verifiedSales, 2);
  assert.equal(levels.store, null);
});

test("the track record line joins the message only when on, with a purchase and a card", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://laria.audio";
  const base = { enabled: true, token: "0123456789abcdef01234567", memberSince: "2026-03-01T12:00:00Z", verifiedPurchases: 3 };
  assert.equal(contactMessage.trackRecordLine(base), "Compro en Laria desde 2026 · 3 compras verificadas: https://laria.audio/comprador/0123456789abcdef01234567");
  assert.equal(contactMessage.trackRecordLine({ ...base, verifiedPurchases: 1 }).includes("1 compra verificada:"), true);
  assert.equal(contactMessage.trackRecordLine({ ...base, enabled: false }), null);
  assert.equal(contactMessage.trackRecordLine({ ...base, verifiedPurchases: 0 }), null);
  assert.equal(contactMessage.trackRecordLine({ ...base, token: null }), null);
  // The WhatsApp button adds it after the quick questions, in the message text.
  const href = "https://wa.me/51999999999?text=Hola";
  const destination = contactMessage.withQuestions(href, ["¿Sigue disponible?", contactMessage.trackRecordLine(base)]);
  const text = new URL(destination).searchParams.get("text");
  assert.equal(text, `Hola ¿Sigue disponible? ${contactMessage.trackRecordLine(base)}`);
  assert.doesNotMatch(destination, /\+/);
});

test("the contact button reads the track record per listing, off when the buyer took it out", () => {
  const source = read("components/whatsapp-contact-link.tsx");
  assert.match(source, /trackRecordLineFor\(listingId\)/);
  const state = read("components/trust/track-record-state.ts");
  assert.match(state, /excluded\.has\(listingId\) \|\| !state\.record/);
  const chip = read("components/trust/track-record-chip.tsx");
  // Off by default: the first press asks for consent.
  assert.match(chip, /record\.enabled \? toggleTrackRecordFor\(listingId\) : setConsent\(true\)/);
  assert.match(chip, /Nunca muestra tu teléfono, tu correo ni qué compraste/);
});

test("provenance and meetup words never name the previous seller or promise safety", () => {
  assert.equal(trust.provenanceSummary({ boughtAt: "2026-05-10T15:00:00Z", previousOwners: 1 }), "Comprado en Laria en mayo de 2026 · 1 dueño anterior en Laria");
  assert.equal(trust.provenanceSummary({ boughtAt: "2026-05-10T15:00:00Z", previousOwners: 2 }).endsWith("2 dueños anteriores en Laria"), true);
  const message = contactMessage.meetupNoticeMessage({ title: "Fender Stratocaster", url: "https://laria.audio/instrumentos/x", sellerFirstName: "María", place: "Larcomar, Miraflores", when: contactMessage.meetupWhen("2026-11-07", "16:30") });
  assert.match(message, /^Voy a ver este equipo con María en Larcomar, Miraflores el sábado, 7 de noviembre a las 4:30/);
  assert.match(message, /Te aviso cuando termine\.$/);
  assert.equal(contactMessage.meetupWhen("", "16:30"), "");
  assert.equal(contactMessage.meetupWhen("2026-11-07", ""), "el sábado, 7 de noviembre");
  assert.equal(contactMessage.shareTextUrl("a b"), "https://wa.me/?text=a%20b");
  for (const file of ["components/trust/safe-meetup.tsx", "components/trust/safe-spot-mark.tsx", "components/trust/safe-spot-settings.tsx", "app/consejos-de-seguridad/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /\b(seguro garantizado|garantizamos|100% seguro|sin riesgo)\b/i, file);
  }
  assert.match(read("components/trust/safe-meetup.tsx"), /no puede garantizar cómo resulta un encuentro/);
});

test("meetup places: by city, folded, and map searches only", () => {
  assert.ok(places.meetupPlacesFor("Lima").length >= 5);
  assert.deepEqual(places.meetupPlacesFor(" AREQUIPA "), places.meetupPlacesFor("Arequipa"));
  assert.deepEqual(places.meetupPlacesFor("Ayacucho"), []);
  assert.equal(places.mapSearchUrl("Larcomar, Miraflores"), "https://www.google.com/maps/search/?api=1&query=Larcomar%2C%20Miraflores");
  assert.equal(places.placeQuery({ name: "Real Plaza Cusco", area: "Cusco" }, "Cusco"), "Real Plaza Cusco, Cusco");
  assert.equal(places.policeStationQuery("Lima"), "comisaría Lima");
});

test("counter purchase parsers: statuses, codes and lines", () => {
  assert.equal(trust.readCounterPurchase({ status: "not_found" }).status, "not_found");
  assert.equal(trust.readCounterPurchase({ status: "open", store: { name: "X" } }).status, "not_found", "no store slug, no page");
  const purchase = trust.readCounterPurchase({
    status: "open",
    store: { name: "Musicentro", slug: "musicentro", city: "Lima", is_verified: true, active: true },
    lines: [{ name: "Cuerdas 010", quantity: 2 }, { name: "", quantity: 1 }, { name: "Púas", quantity: 0 }],
    sold_at: "2026-10-26T15:00:00Z",
    mine: false,
  });
  assert.deepEqual(purchase.lines, [{ name: "Cuerdas 010", quantity: 2 }]);
  assert.equal(purchase.store.verified, true);
  assert.equal(trust.readCounterCode({ sale_id: UUID, token: "ABC", expires_at: "2026-10-27T15:00:00Z" }), null);
  assert.equal(trust.readCounterCode({ sale_id: UUID, token: "0123456789abcdef0123456789abcdef", expires_at: "2026-10-27T15:00:00Z" }).saleId, UUID);
  assert.equal(trust.saleLinesLabel([{ name: "Cuerdas", quantity: 2 }, { name: "Púas", quantity: 1 }]), "Cuerdas (2) y 1 más");
  assert.equal(trust.counterPurchaseUrl("0123456789abcdef0123456789abcdef"), "https://laria.audio/compra-en-tienda/0123456789abcdef0123456789abcdef");
  assert.equal(trust.trustErrorMessage("ERROR: COUNTER_STORE_DAILY_LIMIT"), "Ya confirmaste una compra en esta tienda hoy. Puedes confirmar otra mañana.");
  assert.equal(trust.trustErrorMessage(undefined), "No pudimos completar la acción. Intenta nuevamente.");
});

test("counter purchases join the transaction lists without a listing", () => {
  const transactions = require(path.resolve("lib/transactions.ts"));
  const item = {
    reference_id: UUID, claim_id: null, transaction_id: UUID, listing_id: null, title: "Cuerdas 010 y 1 más", slug: null,
    sold_at: "2026-10-26T15:00:00Z", status: "verified", attribution_type: "counter", origin: "counter", role: "buyer",
    seller_name: "Musicentro", store_slug: "musicentro", buyer_name: null, verified_at: "2026-10-26T15:05:00Z",
    review_deadline: "2026-11-05T15:05:00Z", own_review_submitted: false, reviews_revealed: false,
  };
  assert.equal(transactions.parseTransactionCenter([item]).length, 1);
  // A listing transaction still needs its claim, listing and slug.
  assert.equal(transactions.parseTransactionCenter([{ ...item, attribution_type: "laria" }]).length, 0);
  const detail = {
    origin: "counter", reference_id: UUID, transaction_id: UUID, claim_id: null, listing_id: null, listing_title: "Cuerdas 010",
    listing_slug: null, lines: [{ name: "Cuerdas 010", quantity: 1 }], store_slug: "musicentro", sold_at: "2026-10-26T15:00:00Z",
    role: "buyer", state: "verified", buyer_user_id: null, buyer_name: null, seller_name: "Musicentro", store_id: UUID,
    verified_at: "2026-10-26T15:05:00Z", review_deadline: "2026-11-05T15:05:00Z", review_window_open: true, own_review: null, visible_reviews: [],
  };
  assert.ok(transactions.parseTransactionDetail(detail));
  assert.equal(transactions.parseTransactionDetail({ ...detail, lines: undefined }), null);
  assert.equal(transactions.parseTransactionDetail({ ...detail, origin: undefined }), null);
});

test("review photos: strict ids, at most three, served only through the checked route", () => {
  assert.deepEqual(trust.readReviewPhotos([{ id: UUID }, { id: "x" }, null]), [{ id: UUID }]);
  assert.equal(trust.readReviewPhotos(Array.from({ length: 5 }, () => ({ id: UUID }))).length, 3);
  assert.deepEqual(trust.readMyReviewPhotos([{ id: UUID, status: "pending" }, { id: UUID, status: "rejected" }]), [{ id: UUID, status: "pending" }]);
  const route = read("app/api/review-photos/[id]/route.ts");
  assert.match(route, /get_review_photo_object/);
  assert.match(route, /X-Content-Type-Options": "nosniff"/);
  assert.match(route, /sandbox/);
  assert.match(route, /access === "public" \? "public, max-age=300, s-maxage=300" : "private, no-store"/);
  const photos = read("components/trust/review-photos.tsx");
  assert.match(photos, /prepareListingPhoto/, "photos are redrawn in the browser, so no camera position leaves the phone");
  assert.match(photos, /\$\{userId\}\/\$\{transactionId\}\/\$\{crypto\.randomUUID\(\)\}\.jpg/);
});

test("the nightly job is CRON_SECRET-protected, fails closed and needs no pg_cron job", () => {
  const route = read("app/api/internal/jobs/deal-trust/route.ts");
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /if \(!expected \|\| authorization\.length !== expected\.length\) return false;/);
  assert.match(route, /run_deal_trust_nightly/);
  assert.match(route, /list_orphan_review_photos/);
  assert.doesNotMatch(read("supabase/migrations/20261203100500_feat_safe_meetups.sql"), /cron\.schedule\(/);
});

test("person pages stay out of search engines and the code page sends no referrer", () => {
  assert.match(read("app/vendedores/[slug]/page.tsx"), /robots: NOINDEX_FOLLOW_ROBOTS/);
  assert.match(read("app/comprador/[token]/page.tsx"), /robots: NOINDEX_ROBOTS, referrer: "no-referrer"/);
  assert.match(read("app/compra-en-tienda/[token]/page.tsx"), /robots: NOINDEX_ROBOTS, referrer: "no-referrer"/);
  // The seller page shows a first name only: no phone, surname or address column is read.
  const seller = read("app/vendedores/[slug]/page.tsx");
  assert.doesNotMatch(seller, /whatsapp_phone|full_name|contact_name|public_address/);
});

test("Laria never handles money in these words", () => {
  const files = [
    "components/trust/counter-purchase-code.tsx", "app/compra-en-tienda/[token]/page.tsx", "components/trust/seller-level-mark.tsx",
    "app/comprador/[token]/page.tsx", "components/trust/listing-trust.tsx", "components/trust/safe-spot-mark.tsx",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /Laria (cobra|retiene|garantiza|verifica el instrumento)/, file);
    assert.doesNotMatch(source, /[a-záéíóú]![\s"<]/i, `${file}: no exclamation marks`);
  }
});

// ------------------------------------------------------------------ the QR, read back by a separate decoder

// Published constants (ISO/IEC 18004 tables): the 15-bit format word for level M, masks 0..7, and the 18-bit version
// word for versions 7..10.
const FORMAT_M = [0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011, 0b100010111111001, 0b100000011001110, 0b100111110010111, 0b100101010100000];
const VERSION_WORDS = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };
// Level M block structure per version: [blocks, total codewords per block, data codewords per block] groups.
const BLOCKS_M = {
  1: [[1, 26, 16]], 2: [[1, 44, 28]], 3: [[1, 70, 44]], 4: [[2, 50, 32]], 5: [[2, 67, 43]], 6: [[4, 43, 27]], 7: [[4, 49, 31]],
  8: [[2, 60, 38], [2, 61, 39]], 9: [[3, 58, 36], [2, 59, 37]], 10: [[4, 69, 43], [1, 70, 44]],
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const EXP = new Array(512);
const LOG = new Array(256);
for (let index = 0, value = 1; index < 255; index += 1) {
  EXP[index] = value;
  LOG[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255];
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function functionMap(version) {
  const size = version * 4 + 17;
  const map = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) map[y][x] = true; };
  for (const [ox, oy] of [[0, 0], [size - 8, 0], [0, size - 8]]) for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) mark(ox + x, oy + y);
  for (let i = 0; i < size; i += 1) { mark(6, i); mark(i, 6); }
  const align = ALIGN[version];
  for (const cy of align) for (const cx of align) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === align[align.length - 1]) || (cy === 6 && cx === align[align.length - 1])) continue;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) mark(cx + dx, cy + dy);
  }
  for (let i = 0; i < 9; i += 1) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i += 1) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
  if (version >= 7) for (let i = 0; i < 6; i += 1) for (let j = 0; j < 3; j += 1) { mark(size - 11 + j, i); mark(i, size - 11 + j); }
  return map;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function decode(modules) {
  const size = modules.length;
  const version = (size - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 10, "size is a QR size");
  const dark = (x, y) => modules[y][x] === true;
  // Finder patterns: a dark 7×7 ring, a light ring, a dark 3×3 core, a light separator.
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = -1; y <= 7; y += 1) for (let x = -1; x <= 7; x += 1) {
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(dark(px, py), ring === 0 || ring === 1 || ring === 3, `finder at ${ox},${oy}`);
    }
  }
  for (let i = 8; i < size - 8; i += 1) {
    assert.equal(dark(i, 6), i % 2 === 0, "timing row");
    assert.equal(dark(6, i), i % 2 === 0, "timing column");
  }
  assert.equal(dark(8, size - 8), true, "dark module");
  // Format word, both copies, read in the standard order (bit 14 first).
  const first = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
  const second = [[8, size - 1], [8, size - 2], [8, size - 3], [8, size - 4], [8, size - 5], [8, size - 6], [8, size - 7], [size - 8, 8], [size - 7, 8], [size - 6, 8], [size - 5, 8], [size - 4, 8], [size - 3, 8], [size - 2, 8], [size - 1, 8]];
  const word = (cells) => cells.reduce((acc, [x, y]) => (acc << 1) | (dark(x, y) ? 1 : 0), 0);
  const format = word(first);
  assert.equal(word(second), format, "both format copies agree");
  const mask = FORMAT_M.indexOf(format);
  assert.ok(mask >= 0, `format word ${format.toString(2)} is level M`);
  if (version >= 7) {
    let bitsA = 0;
    let bitsB = 0;
    for (let i = 17; i >= 0; i -= 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      bitsA = (bitsA << 1) | (dark(a, b) ? 1 : 0);
      bitsB = (bitsB << 1) | (dark(b, a) ? 1 : 0);
    }
    assert.equal(bitsA, VERSION_WORDS[version], "version word, top right");
    assert.equal(bitsB, VERSION_WORDS[version], "version word, bottom left");
  }
  // Data modules in zigzag order, two columns at a time from the right, skipping the timing column.
  const map = functionMap(version);
  const bits = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (map[y][x]) continue;
        bits.push(dark(x, y) !== MASKS[mask](x, y) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  // De-interleave: data codewords column by column across blocks, then the error correction codewords.
  const blocks = BLOCKS_M[version].flatMap(([count, total, data]) => Array.from({ length: count }, () => ({ total, data, words: [] })));
  let at = 0;
  const maxData = Math.max(...blocks.map((block) => block.data));
  for (let i = 0; i < maxData; i += 1) for (const block of blocks) if (i < block.data) block.words.push(codewords[at++]);
  const eccLength = blocks[0].total - blocks[0].data;
  for (let i = 0; i < eccLength; i += 1) for (const block of blocks) block.words.push(codewords[at++]);
  // Every block is a Reed-Solomon codeword: zero syndromes at α^0 … α^(ecc-1).
  for (const block of blocks) {
    for (let root = 0; root < eccLength; root += 1) {
      let syndrome = 0;
      for (const word of block.words) syndrome = gfMul(syndrome, EXP[root]) ^ word;
      assert.equal(syndrome, 0, `syndrome ${root} of a block in version ${version}`);
    }
  }
  const data = blocks.flatMap((block) => block.words.slice(0, block.data));
  const stream = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1));
  const take = (count) => stream.splice(0, count).reduce((acc, bit) => (acc << 1) | bit, 0);
  assert.equal(take(4), 0b0100, "byte mode");
  const length = take(version <= 9 ? 8 : 16);
  const bytes = Array.from({ length }, () => take(8));
  return { version, mask, text: Buffer.from(bytes).toString("utf8") };
}

test("the counter QR decodes back to its link, for every mask and versions 1 to 10", () => {
  const texts = [
    "Laria",
    "https://laria.audio/compra-en-tienda/0123456789abcdef0123456789abcdef",
    `https://laria.audio/compra-en-tienda/${"ab".repeat(30)}?tienda=música`,
    `https://laria.audio/x/${"c".repeat(120)}`,
    `https://laria.audio/y/${"d".repeat(185)}`,
  ];
  const versions = new Set();
  for (const text of texts) {
    for (let mask = 0; mask < 8; mask += 1) {
      const decoded = decode(qr.saleQrModules(text, mask));
      assert.equal(decoded.mask, mask);
      assert.equal(decoded.text, text);
      versions.add(decoded.version);
    }
    const chosen = decode(qr.saleQrModules(text));
    assert.equal(chosen.text, text, "the penalty-chosen mask too");
  }
  assert.ok(versions.has(1) && versions.has(5) && versions.has(10) && [...versions].some((v) => v >= 7), `versions covered: ${[...versions]}`);
  // Every length from 1 to the version 10 limit picks the smallest version that fits and decodes.
  for (let length = 1; length <= 213; length += 7) assert.equal(decode(qr.saleQrModules("q".repeat(length))).text.length, length);
  assert.throws(() => qr.saleQrModules("z".repeat(214)), qr.SaleQrTooLong);
  // The decoder is not a mirror of the encoder: one flipped data module, or the wrong mask in the format word, fails.
  const modules = qr.saleQrModules(texts[1], 3);
  modules[modules.length - 1][modules.length - 1] = !modules[modules.length - 1][modules.length - 1];
  assert.throws(() => decode(modules), /syndrome/);
  const other = qr.saleQrModules(texts[1], 3);
  for (let x = 0; x < 6; x += 1) other[8][x] = !other[8][x];
  assert.throws(() => decode(other));
});
