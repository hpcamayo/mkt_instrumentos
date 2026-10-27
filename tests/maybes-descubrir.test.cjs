// Descubrir (big-02, the maybes batch): one listing per screen, from the home ("Lo nuevo") or any results list
// ("Ver en Descubrir"). docs/ux-effortless/maybes-descubrir.md; the cases are EASE-830 to EASE-859.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// Loads a project file with some of its imports replaced; the project's own modules load fresh each time.
function load(file, mocks = {}) {
  const original = Module._load;
  Module._load = function (name, ...args) {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return original.call(this, name, ...args);
  };
  for (const key of Object.keys(require.cache)) {
    if (["lib", "app", "components"].some((dir) => key.startsWith(path.join(root, dir)))) delete require.cache[key];
  }
  try {
    return require(path.resolve(root, file));
  } finally {
    Module._load = original;
  }
}

const d = require("@/lib/descubrir");
const { parseListingFilters } = require("@/lib/listings");

// 2026-10-28 03:00 UTC is still 27 October in Lima (UTC-5 all year).
const NOW = Date.UTC(2026, 9, 28, 3, 0);
const TODAY = "2026-10-27";
const at = (day, hour = 12) => new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00-05:00`)).toISOString();
let serial = 0;
const listing = (overrides = {}) => {
  serial += 1;
  return {
    id: `6b1f4f8e-0000-4c43-9d49-${String(serial).padStart(12, "0")}`,
    slug: `guitarra-${serial}`,
    title: `Guitarra ${serial}`,
    seller_type: "individual",
    status: "approved",
    category: "guitars",
    instrument_type: "electric_guitar",
    brand: "Fender",
    model: "Stratocaster",
    condition: "Usado - buen estado",
    attributes: {},
    price_pen: 1500,
    previous_price_pen: null,
    price_dropped_at: null,
    city: "Lima",
    region: "Lima",
    stock_state: "in_stock",
    published_at: at(TODAY),
    created_at: at(TODAY),
    stores: null,
    listing_photos: [
      { id: `p-${serial}-1`, image_url: `https://example.test/${serial}-1.jpg`, alt_text: null, sort_order: 0 },
      { id: `p-${serial}-2`, image_url: `https://example.test/${serial}-2.jpg`, alt_text: null, sort_order: 1 },
    ],
    ...overrides,
  };
};
const CONTEXT = { mode: "nuevo", windowDays: 7, listTitle: "Lo nuevo" };

test("big-02: Lo nuevo counts Lima days, and a feed's start reaches at most 31 days back", () => {
  assert.equal(d.limaDay(NOW), TODAY);
  assert.equal(d.windowStart(TODAY, d.NEW_WINDOW_DAYS), "2026-10-21");
  assert.equal(d.windowDays("2026-10-21", TODAY), 7);
  assert.equal(d.windowStart("2026-03-01", 30), "2026-01-31", "across a month");
  assert.equal(d.limaMidnight("2026-10-21"), "2026-10-21T00:00:00-05:00");
  assert.ok(d.SPARSE_WINDOW_DAYS < d.MAX_WINDOW_DAYS && d.NEW_WINDOW_DAYS < d.SPARSE_WINDOW_DAYS);
  assert.equal(d.readSince(null, NOW), null, "no window");
  assert.equal(d.readSince(TODAY, NOW), TODAY);
  assert.equal(d.readSince("2026-09-27", NOW), "2026-09-27", "30 days back");
  assert.equal(d.readSince("2026-09-26", NOW), "invalid", "31 days back is refused");
  assert.equal(d.readSince("2026-10-28", NOW), "invalid", "a day still to come in Lima");
  for (const bad of ["", "2026-02-30", "27/10/2026", "2026-10-27T00:00", "hoy"]) assert.equal(d.readSince(bad, NOW), "invalid", bad);
});

test("big-02: Ver en Descubrir carries the list's filters and order, Salir goes back to it, and the feed reads the catalog's page route", () => {
  const record = { category: "guitars", brand: "Fender", location: ["Lima", "Cusco"], condition: "Nuevo", max_price: "3000", sort: "price_asc" };
  const filters = parseListingFilters(record);
  const href = d.descubrirHref(filters);
  assert.match(href, /^\/descubrir\?modo=resultados&/);
  const url = new URL(href, "https://laria.audio");
  const back = Object.fromEntries([...new Set(url.searchParams.keys())].map((key) => [key, url.searchParams.getAll(key)]));
  const request = d.readDescubrirRequest(back);
  assert.equal(request.mode, "resultados");
  assert.deepEqual(request.filters, filters, "the same filters and order");
  assert.equal(d.exitHref("resultados", filters), require("@/lib/catalog-filters").catalogHref(filters));
  assert.equal(d.feedTitle("resultados", filters), require("@/lib/catalog-filters").catalogTitle(filters));

  assert.equal(d.descubrirHref(), "/descubrir", "the home's entry carries nothing");
  const home = d.readDescubrirRequest({});
  assert.equal(home.mode, "nuevo");
  assert.equal(home.filters.sort, "newest");
  assert.equal(d.readDescubrirRequest({ modo: "otro", category: "guitars" }).filters.category, undefined, "only modo=resultados reads filters");
  assert.equal(d.exitHref("nuevo", home.filters), "/");
  assert.equal(d.feedTitle("nuevo", home.filters), "Lo nuevo");

  const next = new URL(d.feedPageUrl({ filters, since: null, page: 3 }), "https://laria.audio");
  assert.equal(next.pathname, "/api/catalog/page");
  assert.equal(next.searchParams.get("fotos"), "todas");
  assert.equal(next.searchParams.get("page"), "3");
  assert.equal(next.searchParams.get("desde"), null);
  assert.deepEqual(next.searchParams.getAll("location"), ["Lima", "Cusco"]);
  const first = new URL(d.feedPageUrl({ filters: home.filters, since: "2026-10-21", page: 1 }), "https://laria.audio");
  assert.equal(first.searchParams.get("desde"), "2026-10-21");
  assert.equal(first.searchParams.get("page"), null, "page 1 is the default");
});

test("big-02: each listing says when it was published in Lima days, and the bar counts where you are", () => {
  assert.equal(d.publishedLabel({ published_at: at(TODAY, 0) }, TODAY, NOW), "Publicado hoy");
  assert.equal(d.publishedLabel({ published_at: at("2026-10-26", 23) }, TODAY, NOW), "Publicado ayer");
  assert.equal(d.publishedLabel({ published_at: at("2026-10-22") }, TODAY, NOW), "Publicado hace 5 días");
  assert.match(d.publishedLabel({ published_at: at("2026-09-01") }, TODAY, NOW), /^Publicado /);
  assert.equal(d.publishedLabel({ published_at: null }, TODAY, NOW), null);
  assert.equal(d.counterLabel(3, 24), "3 de 24");
  assert.equal(d.counterLabel(1250, 2400), "1,250 de 2,400");
  assert.equal(d.counterLabel(3, null), "3", "no total yet");
});

test("big-02: Lo nuevo stops after today's listings with a true line, pauses every 48 and ends visibly", () => {
  const today = [listing(), listing(), listing()];
  const earlier = [listing({ published_at: at("2026-10-26") }), listing({ published_at: at("2026-10-24") })];
  const slots = d.feedSlots({ items: [...today, ...earlier], mode: "nuevo", today: TODAY, total: 5, complete: true });
  assert.deepEqual(slots.map((slot) => slot.kind), ["listing", "listing", "listing", "today", "listing", "listing", "end"]);
  assert.deepEqual(slots.filter((slot) => slot.kind === "listing").map((slot) => slot.position), [1, 2, 3, 4, 5]);
  const stop = slots[3];
  assert.deepEqual(d.stopCopy(stop, CONTEXT), { title: "Viste todo lo nuevo de hoy", body: "Sigue para ver 2 más de los últimos 7 días." });
  assert.deepEqual(d.stopCopy(slots.at(-1), CONTEXT), { title: "Viste todo lo nuevo", body: "Las 5 publicaciones de los últimos 7 días." });
  assert.equal(d.slotAnnouncement(slots[1], 5, CONTEXT), "2 de 5: " + today[1].title);
  assert.equal(d.slotAnnouncement(stop, 5, CONTEXT), "Viste todo lo nuevo de hoy");

  // Only today's listings: no "de hoy" stop in the middle, and the end says what the window was.
  const onlyToday = d.feedSlots({ items: today, mode: "nuevo", today: TODAY, total: 3, complete: true });
  assert.deepEqual(onlyToday.map((slot) => slot.kind), ["listing", "listing", "listing", "end"]);
  // Nothing today: the feed starts with the earlier days, no "de hoy" stop at all.
  const noneToday = d.feedSlots({ items: earlier, mode: "nuevo", today: TODAY, total: 2, complete: true });
  assert.equal(noneToday.some((slot) => slot.kind === "today"), false);
  // A results list never has the "de hoy" stop, whatever its dates.
  const results = d.feedSlots({ items: [...today, ...earlier], mode: "resultados", today: TODAY, total: 5, complete: true });
  assert.equal(results.some((slot) => slot.kind === "today"), false);
  assert.deepEqual(d.stopCopy(results.at(-1), { mode: "resultados", windowDays: 7, listTitle: "Fender en Guitarras" }), { title: "Viste todos los resultados", body: "5 publicaciones en Fender en Guitarras." });

  // Unknown total: the "de hoy" stop doesn't count what follows; more pages to come end in "more", not "end".
  const open = d.feedSlots({ items: [...today, ...earlier], mode: "nuevo", today: TODAY, total: null, complete: false });
  assert.equal(open.at(-1).kind, "more");
  assert.equal(d.stopCopy(open[3], CONTEXT).body, "Sigue para ver lo de los últimos 7 días.");
  assert.equal(d.slotAnnouncement(open.at(-1), null, CONTEXT), "Cargando más publicaciones");

  const many = Array.from({ length: 100 }, () => listing({ published_at: at("2026-10-25") }));
  const long = d.feedSlots({ items: many, mode: "resultados", today: TODAY, total: 100, complete: true });
  assert.deepEqual(long.filter((slot) => slot.kind === "checkpoint").map((slot) => slot.seen), [48, 96]);
  assert.deepEqual(d.stopCopy(long.find((slot) => slot.kind === "checkpoint"), { ...CONTEXT, mode: "resultados" }), {
    title: "Llevas 48 de 100",
    body: "Sigue para ver más, o vuelve a la lista para cambiar los filtros.",
  });

  const empty = d.feedSlots({ items: [], mode: "nuevo", today: TODAY, total: 0, complete: true });
  assert.deepEqual(empty.map((slot) => slot.kind), ["empty"]);
  assert.deepEqual(d.stopCopy(empty[0], { ...CONTEXT, windowDays: 30 }), { title: "No hay publicaciones nuevas", body: "No se publicó nada en los últimos 30 días." });
  assert.equal(d.hiddenNote(0), null);
  assert.equal(d.hiddenNote(1), "Omitimos 1 que marcaste con “No me interesa”.");
  assert.equal(d.hiddenNote(3), "Omitimos 3 que marcaste con “No me interesa”.");
});

test("big-02: No me interesa is kept on this device for Descubrir only, capped, and cleared with the rest", () => {
  const store = new Map();
  global.window = {
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) },
    dispatchEvent: () => true,
  };
  global.document = { cookie: "" };
  global.Event = global.Event ?? class { constructor(type) { this.type = type; } };
  try {
    const saves = load("lib/device-saves.ts");
    const a = "6b1f4f8e-1111-4c43-9d49-1d3f64f9c2aa";
    const b = "6b1f4f8e-2222-4c43-9d49-1d3f64f9c2aa";
    assert.deepEqual(saves.setListingHidden(a, true), [a]);
    assert.deepEqual(saves.setListingHidden(b, true), [b, a], "newest first");
    assert.deepEqual(saves.setListingHidden(a, true), [a, b], "once each");
    assert.deepEqual(saves.setListingHidden("../etc", true), [a, b], "only listing ids");
    assert.deepEqual(saves.setListingHidden(a, false), [b], "Deshacer");
    assert.deepEqual(saves.showHiddenListings([b]), [], "Volver a mostrarlas");
    assert.equal(store.has("laria:descubrir-ocultos"), false, "nothing left, nothing stored");
    for (let index = 0; index < saves.MAX_HIDDEN + 20; index += 1) saves.setListingHidden(`6b1f4f8e-3333-4c43-9d49-${String(index).padStart(12, "0")}`, true);
    assert.equal(saves.getHiddenListings().length, saves.MAX_HIDDEN);
    store.set("laria:descubrir-ocultos", "{not json");
    assert.deepEqual(saves.getHiddenListings(), [], "a broken value reads as nothing");
    saves.setListingHidden(a, true);
    saves.clearDeviceSaves();
    assert.deepEqual(saves.getHiddenListings(), [], "Borrar lo guardado en este dispositivo clears it too");
    assert.match(source("components/saving/device-favorites.tsx"), /lo que ocultaste en Descubrir/);
    // The catalog and the home never read it.
    for (const file of ["components/catalog-view.tsx", "components/home/home-for-you.tsx", "lib/catalog.ts", "lib/catalog-data.ts"]) {
      assert.doesNotMatch(source(file), /getHiddenListings|descubrir-ocultos/, file);
    }
  } finally {
    delete global.window;
    delete global.document;
  }
});

test("big-02: the page route serves Descubrir's pages with every photo and the window's start, and the catalog's as before", async () => {
  const calls = [];
  const catalog = {
    fetchCatalogPage: async (...args) => {
      calls.push(["catalog", args.slice(1)]);
      return { data: [{ id: "a" }], count: 40, error: null };
    },
    fetchDescubrirPage: async (...args) => {
      calls.push(["descubrir", args.slice(1)]);
      return { data: [{ id: "b" }], count: 9, error: null };
    },
  };
  const route = load("app/api/catalog/page/route.ts", {
    "@/lib/catalog": catalog,
    "@/lib/supabase/public-read-client": { createPublicReadClient: () => ({}) },
  });
  const { NextRequest } = require("next/server");
  const get = (query) => route.GET(new NextRequest(`https://laria.audio/api/catalog/page?${query}`));
  const today = d.limaDay(Date.now());

  let response = await get("category=guitars&page=2");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { listings: [{ id: "a" }], total: 40 });
  assert.equal(calls[0][0], "catalog", "Ver 24 más is unchanged");
  assert.equal(calls[0][1][1], 2);

  response = await get(`fotos=todas&desde=${today}&page=3`);
  assert.deepEqual(await response.json(), { listings: [{ id: "b" }], total: 9 });
  assert.equal(response.headers.get("cache-control"), "public, max-age=30");
  assert.equal(calls[1][0], "descubrir");
  assert.equal(calls[1][1][1], 3);
  assert.deepEqual(calls[1][1][2], { photos: 10, publishedSince: `${today}T00:00:00-05:00` });

  await get("fotos=todas&category=guitars");
  assert.deepEqual(calls[2][1][2], { photos: 10, publishedSince: undefined }, "a results list has no window");

  for (const bad of ["desde=2020-01-01", "desde=ayer", "fotos=todas&desde=2026-02-30"]) {
    response = await get(bad);
    assert.equal(response.status, 400, bad);
  }
  assert.equal(calls.length, 3, "a refused start reads nothing");
});

test("big-02: a Descubrir page is the catalog's query with up to ten photos a listing and, for Lo nuevo, a start", async () => {
  const recorded = [];
  const builder = new Proxy({}, {
    get(target, name) {
      if (name === "then") {
        return (resolve) => resolve({ data: [], count: 0, error: null });
      }
      return (...args) => {
        recorded.push([name, args]);
        return builder;
      };
    },
  });
  const supabase = { from: (table) => { recorded.push(["from", [table]]); return builder; }, rpc: () => builder };
  const catalog = load("lib/catalog.ts");
  const filters = parseListingFilters({ category: "guitars" });
  await catalog.fetchDescubrirPage(supabase, filters, 2, { photos: 10, publishedSince: "2026-10-21T00:00:00-05:00" });
  assert.deepEqual(recorded[0], ["from", ["public_listings"]], "the catalog's own view, with its filters");
  const gte = recorded.filter(([name, args]) => name === "gte" && args[0] === "published_at");
  assert.deepEqual(gte.map(([, args]) => args), [["published_at", "2026-10-21T00:00:00-05:00"]]);
  const photoLimit = recorded.find(([name, args]) => name === "limit" && args[1]?.foreignTable === "listing_photos");
  assert.equal(photoLimit[1][0], 10);
  const range = recorded.find(([name]) => name === "range");
  assert.deepEqual(range[1], [24, 47], "page 2 of 24");

  recorded.length = 0;
  await catalog.fetchCatalogPage(supabase, filters, 1);
  assert.equal(recorded.some(([name, args]) => name === "gte" && args[0] === "published_at"), false, "the catalog has no window");
  assert.equal(recorded.find(([name, args]) => name === "limit" && args[1]?.foreignTable === "listing_photos")[1][0], 1, "cards keep one photo");
});

test("big-02: the page opens on Lo nuevo's last 7 days, or 30 when the week holds fewer than 12, and leaves a failed read to the feed", async () => {
  const received = [];
  let answers = [];
  const page = load("app/descubrir/page.tsx", {
    "@/lib/catalog-data": {
      getDescubrirPage: async (filters, since) => {
        received.push({ filters, since });
        return answers.shift();
      },
    },
    "@/lib/supabase/public-client": { warnMissingSupabaseEnv: () => {} },
    "@/components/descubrir/descubrir-feed": { DescubrirFeed: () => null },
  });
  const feedProps = async (params) => {
    const element = await page.default({ searchParams: Promise.resolve(params) });
    assert.equal(element.props.id, "contenido", "Descubrir draws its own <main>");
    return element.props.children.props;
  };
  const today = d.limaDay(Date.now());
  const items = (count) => ({ data: Array.from({ length: count }, () => listing()), count, error: null });

  answers = [items(15)];
  let props = await feedProps({});
  assert.equal(props.mode, "nuevo");
  assert.equal(props.since, d.windowStart(today, 7));
  assert.equal(props.initial.total, 15);
  assert.equal(props.exit, "/");
  assert.equal(props.title, "Lo nuevo");

  received.length = 0;
  answers = [items(4), items(20)];
  props = await feedProps({});
  assert.deepEqual(received.map((call) => call.since), [d.windowStart(today, 7), d.windowStart(today, 30)]);
  assert.equal(props.since, d.windowStart(today, 30));
  assert.equal(props.initial.total, 20);

  received.length = 0;
  answers = [{ data: null, count: null, error: { message: "timeout" } }];
  props = await feedProps({});
  assert.equal(props.initial, null, "the feed asks for the first page itself");

  received.length = 0;
  answers = [items(3)];
  props = await feedProps({ modo: "resultados", category: "guitars", sort: "price_asc" });
  assert.equal(received[0].since, null, "a results list has no window, however short");
  assert.equal(received.length, 1);
  assert.equal(props.filters.sort, "price_asc");
  assert.match(props.exit, /^\/listados\?/);
  assert.match(source("app/descubrir/page.tsx"), /robots: NOINDEX_ROBOTS/);
  assert.match(source("app/descubrir/page.tsx"), /export const maxDuration = 30;/);
});

test("big-02: a listing's screen has its photos, the facts, and a plain button for every gesture and verdict", () => {
  const screen = load("components/descubrir/descubrir-screen.tsx", {
    "@/components/favorite-button": { FavoriteButton: ({ listingId }) => React.createElement("button", { type: "button", "data-favorite": listingId }, "Guardar") },
    "@/components/marketplace-image": { MarketplaceImage: (props) => React.createElement("img", { src: props.src, alt: props.alt, loading: props.loading, "data-priority": props.priority ? "yes" : undefined }) },
    "@/components/marketplace-telemetry": { useListingImpression: () => React.createRef() },
    "@/components/descubrir/descubrir-contact": { DescubrirContact: ({ listingId }) => React.createElement("button", { type: "button", "data-contact": listingId }, "WhatsApp") },
  });
  const item = listing({ title: "Fender Player Telecaster", price_pen: 3999, listing_photos: [0, 1, 2].map((index) => ({ id: `t-${index}`, image_url: `https://example.test/t-${index}.jpg`, alt_text: null, sort_order: index })) });
  const render = (props) => renderToStaticMarkup(React.createElement(screen.DescubrirScreen, { item, headingId: "descubrir-x", current: true, loading: "first", today: TODAY, now: NOW, source: "home", onHide: () => {}, onOpen: () => {}, ...props }));
  const html = render();
  assert.match(html, /<h2 id="descubrir-x" tabindex="-1"[^>]*>Fender Player Telecaster<\/h2>/);
  assert.match(html, /S\/\s?3,999/);
  assert.match(html, /Publicado hoy/);
  assert.match(html, /aria-label="Foto anterior"/);
  assert.match(html, /aria-label="Foto siguiente"/);
  assert.match(html, /aria-keyshortcuts="ArrowLeft"/);
  assert.match(html, /<span class="sr-only">Foto <\/span>1 \/ 3/);
  assert.match(html, /alt="Fender Player Telecaster, foto 2"/);
  assert.match(html, /data-priority="yes"/, "the first screen's first photo comes first");
  assert.equal((html.match(/loading="eager"/g) ?? []).length, 1, "then its second; the rest wait for a swipe");
  assert.match(html, /data-contact=/);
  assert.match(html, /data-favorite=/);
  assert.match(html, />No me interesa</);
  assert.match(html, /href="\/instrumentos\/[^"]+"[^>]*>Ver publicación</);
  assert.doesNotMatch(html, /Reservado/);
  assert.doesNotMatch(html, /autoplay|<video|<audio/, "nothing plays on its own");

  assert.match(render({ item: { ...item, reserved: true } }), /Reservado/, "the reservation batch's flag shows as a tag");
  const [marked, plain] = d.markReserved([item, listing()], new Set([item.id]));
  assert.equal(marked.reserved, true);
  assert.equal(plain.reserved, undefined);
  const page = [item];
  assert.equal(d.markReserved(page, []), page, "no ids, the same items");
  assert.equal(d.markReserved(page, undefined), page);
  assert.match(source("components/descubrir/descubrir-feed.tsx"), /markReserved\(listings, reserved\)/, "the route's `reserved` list marks the later pages");
  assert.match(render({ current: false }), /inert=""/, "screens out of view are inert");
  const single = render({ item: { ...item, listing_photos: item.listing_photos.slice(0, 1) } });
  assert.doesNotMatch(single, /Foto siguiente/, "one photo, no arrows");
  assert.match(render({ item: { ...item, listing_photos: [] } }), /Sin foto/);
  const idle = render({ loading: "idle", current: false });
  assert.equal((idle.match(/loading="eager"/g) ?? []).length, 0, "a screen far from view loads nothing new");
  const next = render({ loading: "next", current: false });
  assert.equal((next.match(/loading="eager"/g) ?? []).length, 1, "the next screen's first photo loads ahead");
});

test("big-02: the stops say what is true and offer one primary way on", () => {
  const { DescubrirStop } = load("components/descubrir/descubrir-stop.tsx");
  const html = renderToStaticMarkup(React.createElement(DescubrirStop, {
    headingId: "descubrir-fin",
    current: true,
    tone: "done",
    title: "Viste todo lo nuevo",
    body: "Las 5 publicaciones de los últimos 7 días.",
    primary: { label: "Ver todo el catálogo", href: "/listados" },
    secondary: { label: "Volver al inicio", href: "/" },
  }));
  assert.match(html, /<h2 id="descubrir-fin" tabindex="-1"[^>]*>Viste todo lo nuevo<\/h2>/);
  assert.match(html, /Las 5 publicaciones de los últimos 7 días\./);
  assert.match(html, /href="\/listados"[^>]*>Ver todo el catálogo</);
  assert.match(html, /href="\/"[^>]*>Volver al inicio</);
  assert.match(renderToStaticMarkup(React.createElement(DescubrirStop, { headingId: "x", current: false, tone: "loading", title: "Cargando publicaciones…" })), /inert=""/);
});

test("big-02: the feed draws the screen in view and its neighbours, with a bar to leave, count and move", () => {
  const feed = load("components/descubrir/descubrir-feed.tsx", {
    "@/components/descubrir/descubrir-screen": {
      DescubrirScreen: ({ item, headingId }) => React.createElement("section", { "data-listing": item.id }, React.createElement("h2", { id: headingId }, item.title)),
      isFeedKey: () => false,
      prefersReducedMotion: () => false,
    },
  });
  const items = Array.from({ length: 6 }, () => listing());
  const html = renderToStaticMarkup(React.createElement(feed.DescubrirFeed, {
    mode: "nuevo",
    filters: d.readDescubrirRequest({}).filters,
    title: "Lo nuevo",
    exit: "/",
    today: TODAY,
    now: NOW,
    since: "2026-10-21",
    initial: { listings: items, total: 6 },
  }));
  assert.match(html, /<h1[^>]*>Descubrir<\/h1>/);
  assert.match(html, /aria-label="Salir de Descubrir"[^>]*href="\/"|href="\/"[^>]*aria-label="Salir de Descubrir"/);
  assert.match(html, /Lo nuevo<span class="tabular-nums"> · 1 de 6<\/span>/);
  assert.match(html, /aria-label="Anterior"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*aria-label="Anterior"/, "nothing before the first");
  assert.match(html, /aria-label="Siguiente"/);
  assert.match(html, /aria-keyshortcuts="ArrowDown"/);
  assert.equal((html.match(/data-listing=/g) ?? []).length, 2, "the screen in view and the next; the rest are empty frames");
  assert.equal((html.match(/data-slot=/g) ?? []).length, 7, "six listings and the end");
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /snap-y snap-mandatory/);
});

test("big-02: the entries, the frame, the crawler guard and the index rules", () => {
  const catalogView = source("components/catalog-view.tsx");
  assert.match(catalogView, /descubrirHref\(filters\)/);
  assert.equal((catalogView.match(/Ver en Descubrir/g) ?? []).length, 2, "one entry for desktop, one for phones");
  assert.match(catalogView, /!error && listings\.length > 0 \? descubrirHref\(filters\) : null/, "only a list with results offers it");
  const home = source("components/home/home-for-you.tsx");
  assert.match(home, /href=\{DESCUBRIR_PATH\}/);
  assert.match(home, /Descubrir lo nuevo/);
  // The grid stays the default: nothing sends anyone to Descubrir on its own.
  for (const file of ["app/page.tsx", "app/listados/page.tsx", "middleware.ts"]) assert.doesNotMatch(source(file), /redirect\([^)]*descubrir/i, file);

  const { getShellLayout } = require("@/lib/shell");
  assert.deepEqual(getShellLayout("/descubrir"), { header: "none", strip: "none", phoneSearch: "none", footer: "none" });
  const { blocksCatalogCrawler } = require("@/lib/catalog-crawlers");
  assert.equal(blocksCatalogCrawler("/descubrir", "Mozilla/5.0 (compatible; Amazonbot/0.1)"), true);
  assert.equal(blocksCatalogCrawler("/descubrir", "Mozilla/5.0"), false);
  assert.equal(blocksCatalogCrawler("/descubrir-algo", "Amazonbot/0.1"), false);
  const { NON_INDEXABLE_PATH_PREFIXES } = require("@/lib/site");
  assert.ok(NON_INDEXABLE_PATH_PREFIXES.includes("/descubrir"));
  assert.match(source("middleware.ts"), /"\/descubrir",/);
  // Nothing here throws a message of its own, so the A13 list of the site's messages needs no new entry.
  for (const file of ["lib/descubrir.ts", "app/descubrir/page.tsx", "components/descubrir/descubrir-feed.tsx", "components/descubrir/descubrir-screen.tsx", "components/descubrir/descubrir-stop.tsx", "components/descubrir/descubrir-contact.tsx"]) {
    assert.doesNotMatch(source(file), /throw new Error|throw Error/, file);
  }
});
