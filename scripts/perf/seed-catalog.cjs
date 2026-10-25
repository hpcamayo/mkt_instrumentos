// Representative public-catalog data for local query and load measurements (docs/operations/catalog-performance.md).
// Local databases only: it prints SQL that inserts stores, listings and photos with fixed pseudo-random choices, so two
// runs with the same size and seed give the same rows. Never run its output against a hosted project.
//
//   node --require ./tests/setup-alias.cjs scripts/perf/seed-catalog.cjs 5000 > /tmp/seed.sql
//   psql "postgresql://postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f /tmp/seed.sql
//
// Shape (chosen to stress the catalog, not to mirror any real account): about 70% individual listings and 30% store
// listings over 80 stores (75% active, two thirds of those verified); 82% approved, the rest pending, hidden or sold;
// 12% of store listings out of stock; one to four photos each; real filter attributes for each type; half the
// listings in Lima and a tail of cities outside the predefined city list.
const { instrumentFilterGroups } = require("@/lib/instrument-filters");
const { instrumentTypesByCategory } = require("@/lib/listing-submission");

const size = Number(process.argv[2] ?? 5000);
let state = Number(process.argv[3] ?? 20261024) >>> 0;
function random() {
  // mulberry32
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (items) => items[Math.floor(random() * items.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of pairs) if ((roll -= weight) < 0) return value;
  return pairs[pairs.length - 1][0];
};
const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const sql = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);

const brands = {
  guitars: [["Fender", ["Stratocaster", "Telecaster", "Jazzmaster", "Player Strat"]], ["Gibson", ["Les Paul Standard", "SG Standard", "ES-335"]], ["Ibanez", ["RG550", "AZ2402", "GRX70"]], ["Yamaha", ["Pacifica 112V", "C40", "FG800"]], ["Epiphone", ["Les Paul Special", "Casino"]], ["Squier", ["Classic Vibe 50s", "Affinity Tele"]], ["Taylor", ["114ce", "GS Mini"]], ["Takamine", ["GD30CE"]], ["Cort", ["AD810"]], ["PRS", ["SE Custom 24"]]],
  basses: [["Fender", ["Precision Bass", "Jazz Bass"]], ["Ibanez", ["SR305", "SR500", "GSR200"]], ["Yamaha", ["TRBX304", "BB234"]], ["Squier", ["Jazz Bass Affinity"]], ["Music Man", ["StingRay"]], ["Sire", ["Marcus Miller V7"]]],
  keyboards: [["Yamaha", ["PSR-E373", "P-45", "Montage"]], ["Casio", ["CT-S300", "Privia PX-S1100"]], ["Roland", ["FP-30X", "Juno-DS61"]], ["Korg", ["Minilogue", "Kross 2"]], ["Nord", ["Stage 3"]], ["Kawai", ["ES120"]]],
  percussion: [["Pearl", ["Export", "Roadshow"]], ["Tama", ["Imperialstar"]], ["Zildjian", ["A Custom", "K Sweet"]], ["Sabian", ["AAX", "B8X"]], ["Meinl", ["Cajón Headliner", "HCS"]], ["Roland", ["TD-07KV"]], ["Mapex", ["Tornado"]]],
  winds: [["Yamaha", ["YAS-280", "YTR-2330", "YFL-222"]], ["Jupiter", ["JAS500"]], ["Selmer", ["Mark VI"]], ["Hohner", ["Special 20"]]],
  strings: [["Yamaha", ["V3SKA"]], ["Stentor", ["Student II"]], ["Kala", ["KA-15S"]], ["Cremona", ["SV-130"]]],
  pedals: [["Boss", ["DS-1", "SD-1", "RC-30", "GT-1"]], ["Electro-Harmonix", ["Big Muff", "Holy Grail"]], ["MXR", ["Phase 90", "Carbon Copy"]], ["Line 6", ["HX Stomp", "POD Go"]], ["Zoom", ["G1X Four", "MS-50G"]], ["TC Electronic", ["Hall of Fame 2"]], ["Ibanez", ["Tube Screamer TS9"]]],
  amplifiers: [["Marshall", ["DSL40CR", "MG15"]], ["Fender", ["Champion 20", "Blues Junior", "Rumble 40"]], ["Orange", ["Crush 20", "Rocker 15"]], ["Vox", ["AC15", "Pathfinder 10"]], ["Peavey", ["6505"]], ["Boss", ["Katana 50"]], ["Ampeg", ["BA-108"]]],
  microphones: [["Shure", ["SM58", "SM57", "Beta 58A"]], ["Audio-Technica", ["AT2020", "AT2035"]], ["Rode", ["NT1", "PodMic"]], ["Sennheiser", ["e835", "e906"]], ["Behringer", ["C-1"]]],
  audio: [["Focusrite", ["Scarlett 2i2", "Scarlett Solo"]], ["Behringer", ["UMC204HD", "Xenyx Q802"]], ["PreSonus", ["AudioBox USB 96"]], ["Yamaha", ["MG10XU", "HS5"]], ["KRK", ["Rokit 5"]], ["Mackie", ["ProFX10v3"]], ["JBL", ["EON710"]]],
};
const nouns = { guitars: "Guitarra", basses: "Bajo", keyboards: "Teclado", percussion: "Batería", winds: "Saxofón", strings: "Violín", pedals: "Pedal", amplifiers: "Amplificador", microphones: "Micrófono", audio: "Interfaz" };
const conditions = ["Nuevo", "Usado - como nuevo", "Usado - buen estado", "Usado - con detalles"];
// Half in Lima; the tail includes cities that are not in lib/location.ts's suggestions (discovered only from listings).
const cities = [["Lima", "Lima", 50], ["Arequipa", "Arequipa", 9], ["Trujillo", "La Libertad", 7], ["Cusco", "Cusco", 6], ["Chiclayo", "Lambayeque", 5], ["Piura", "Piura", 5], ["Huancayo", "Junín", 4], ["Callao", "Callao", 4], ["Iquitos", "Loreto", 2], ["Tacna", "Tacna", 2], ["Chimbote", "Áncash", 2], ["Huaraz", "Áncash", 1], ["Ayacucho", "Ayacucho", 1], ["Cajamarca", "Cajamarca", 1], ["Pucallpa", "Ucayali", 1]];
const categories = [["guitars", 26], ["basses", 9], ["keyboards", 9], ["percussion", 10], ["winds", 5], ["strings", 4], ["pedals", 13], ["amplifiers", 10], ["microphones", 6], ["audio", 8]];
const priceRange = { guitars: [250, 9000], basses: [300, 7000], keyboards: [300, 12000], percussion: [120, 8000], winds: [400, 9000], strings: [150, 3000], pedals: [80, 2500], amplifiers: [200, 6000], microphones: [90, 3500], audio: [150, 5000] };

function attributesFor(type) {
  const group = instrumentFilterGroups.find((item) => item.instrumentType === type);
  const attributes = {};
  if (!group) return attributes;
  for (const filter of group.filters) {
    if (random() < 0.25) continue;
    if (filter.type === "boolean") attributes[filter.key] = random() < 0.5 ? "yes" : "no";
    else if (filter.type === "multiselect" && filter.options?.length) attributes[filter.key] = [...new Set([pick(filter.options).value, pick(filter.options).value])];
    else if (filter.options?.length) attributes[filter.key] = pick(filter.options).value;
  }
  return attributes;
}

const out = [];
out.push("-- Generated by scripts/perf/seed-catalog.cjs: local measurement data only.");
out.push("begin;");
out.push("set local session_replication_role = replica; -- bulk load without per-row triggers; derived columns are set here");
out.push("set local synchronous_commit = off;");

const storeCount = Math.max(6, Math.min(80, Math.round(size / 60)));
const stores = [];
const storeRows = [];
for (let n = 1; n <= storeCount; n += 1) {
  const status = weighted([["active", 75], ["pending", 10], ["hidden", 15]]);
  const verified = status === "active" && random() < 0.67;
  const [city, region] = weighted(cities.map(([c, r, w]) => [[c, r], w]));
  const id = uuid("9e000000", n);
  stores.push({ id, status, verified, city, region });
  storeRows.push(`(${sql(id)}, ${sql(`Tienda Perf ${n}`)}, ${sql(`tienda-perf-${n}`)}, ${sql(status)}, ${verified}, '51990${String(n).padStart(6, "0")}', ${sql(city)}, ${sql(region)}, now() - interval '${n} days')`);
}
out.push(`insert into public.stores (id, name, slug, status, is_verified, whatsapp_phone, city, region, created_at) values\n${storeRows.join(",\n")};`);

const now = Date.UTC(2026, 9, 24);
const listingRows = [];
const photoRows = [];
for (let n = 1; n <= size; n += 1) {
  const category = weighted(categories);
  const type = pick(instrumentTypesByCategory[category].filter((value) => value !== "other").concat(random() < 0.05 ? ["other"] : []));
  const [brand, models] = pick(brands[category]);
  const model = random() < 0.85 ? pick(models) : null;
  const isStore = random() < 0.3;
  const store = isStore ? pick(stores) : null;
  const [city, region] = store ? [store.city, store.region] : weighted(cities.map(([c, r, w]) => [[c, r], w]));
  const status = weighted([["approved", 82], ["pending", 6], ["hidden", 6], ["sold", 6]]);
  const stock = store ? (random() < 0.12 ? "out_of_stock" : "in_stock") : null;
  const [low, high] = priceRange[category];
  const price = Math.round((low + (high - low) * random() ** 2) / 10) * 10;
  const created = new Date(now - Math.floor(random() * 120 * 86400000));
  const published = status === "pending" ? null : new Date(created.getTime() + 3600000);
  const dropped = status === "approved" && random() < 0.05;
  const condition = isStore && random() < 0.7 ? "Nuevo" : pick(conditions);
  const title = `${nouns[category]} ${brand}${model ? ` ${model}` : ""}${condition === "Nuevo" ? "" : " usado"} ${n}`;
  const id = uuid("9f000000", n);
  listingRows.push(`(${sql(id)}, ${sql(store?.id ?? null)}, ${sql(store ? "store" : "individual")}, ${sql(status)}, ${sql(title)}, ${sql(`perf-${n}`)}, 'Instrumento en buen estado para la medición local del catálogo.', ${sql(category)}, ${sql(type)}, ${sql(JSON.stringify(attributesFor(type)))}, ${sql(random() < 0.97 ? brand : null)}, ${sql(model)}, ${sql(condition)}, ${price}, ${sql(city)}, ${sql(region)}, '51991${String(n).padStart(6, "0")}', ${sql(created.toISOString())}, ${sql(published?.toISOString() ?? null)}, ${sql(stock)}, ${dropped ? Math.round(price * 1.15) : "null"}, ${dropped ? sql(new Date(now - Math.floor(random() * 20 * 86400000)).toISOString()) : "null"}, ${status === "sold" ? sql(created.toISOString()) : "null"}, ${Math.floor(random() * 400)})`);
  const photos = 1 + Math.floor(random() * 4);
  for (let p = 0; p < photos; p += 1) photoRows.push(`(${sql(id)}, 'https://example.invalid/perf/${n}-${p}.jpg', ${p})`);
}
for (let start = 0; start < listingRows.length; start += 1000) {
  out.push(`insert into public.listings (id, store_id, seller_type, status, title, slug, description, category, instrument_type, attributes, brand, model, condition, price_pen, city, region, whatsapp_phone, created_at, published_at, stock_state, previous_price_pen, price_dropped_at, sold_at, view_count) values\n${listingRows.slice(start, start + 1000).join(",\n")};`);
}
for (let start = 0; start < photoRows.length; start += 2000) {
  out.push(`insert into public.listing_photos (listing_id, image_url, sort_order) values\n${photoRows.slice(start, start + 2000).join(",\n")};`);
}
out.push("commit;");
out.push("analyze public.stores; analyze public.listings; analyze public.listing_photos;");
process.stdout.write(`${out.join("\n")}\n`);
