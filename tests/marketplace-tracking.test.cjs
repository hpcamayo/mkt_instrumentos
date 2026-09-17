const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(filename, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve(filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    mod, mod.exports, ...Object.values(globals),
  );
  return mod.exports;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const response = (body = {}, ok = true) => ({ ok, json: async () => body });
const listingId = "77000000-0000-4000-8000-000000000001";
const storeId = "77000000-0000-4000-8000-000000000002";
function withoutEventId(event) { const value = { ...event }; delete value.eventId; return value; }

function timersHarness() {
  let sequence = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(callback, delay) { const id = ++sequence; pending.set(id, { callback, delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    async runNext() {
      const [id, timer] = pending.entries().next().value ?? [];
      assert.ok(timer, "Expected a scheduled timer");
      pending.delete(id);
      timer.callback();
      await settle();
    },
    async drain() {
      for (let limit = 0; pending.size; limit++) {
        assert.ok(limit < 50, "The event queue must finish in bounded batches");
        await this.runNext();
      }
    },
  };
}

function clientHarness({ request } = {}) {
  const timers = timersHarness();
  const calls = [];
  let now = 0;
  let sequence = 0;
  const client = loadTypeScript("lib/marketplace-events-client.ts", {}, {
    setTimeout: timers.setTimeout,
    Date: { now: () => now },
    crypto: { randomUUID: () => `77000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    AbortSignal: { timeout: (timeoutMs) => ({ timeoutMs }) },
    async fetch(url, options) {
      const entry = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined };
      calls.push(entry);
      if (request) {
        const result = await request(entry, calls.length);
        if (result !== undefined) return result;
      }
      return response(url === "/api/events" ? { events: entry.body.events.map((event) => ({ eventId: event.eventId, recorded: true, view_count: 9 })) } : {});
    },
  });
  return { client, timers, calls, advance(milliseconds) { now += milliseconds; }, batches: () => calls.filter((entry) => entry.url === "/api/events") };
}

function browserHarness(visibilityState = "visible") {
  const listeners = new Map();
  const observers = [];
  const document = {
    visibilityState,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
  };
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
    intersect(ratio, isIntersecting = true) { this.callback([{ intersectionRatio: ratio, isIntersecting }]); }
  }
  return {
    document, observers, listeners,
    window: { IntersectionObserver },
    IntersectionObserver,
    visibility(value) { document.visibilityState = value; for (const callback of listeners.get("visibilitychange") ?? []) callback(); },
  };
}

function reactHarness() {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (value) => { hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value; }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, dependency) => !Object.is(value, previous.dependencies[dependency]))) {
        hooks[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = effect(); });
      }
    },
  };
  return {
    react,
    render(component, props) {
      cursor = 0;
      effects = [];
      const element = component(props);
      if (element?.props?.ref) element.props.ref.current = { id: "visible-listing-card" };
      for (const effect of effects) effect();
      return element;
    },
    unmount() { for (const hook of hooks) hook.cleanup?.(); },
  };
}

function telemetryHarness(transport, browser = browserHarness()) {
  const react = reactHarness();
  const telemetry = loadTypeScript("components/marketplace-telemetry.tsx", {
    react: react.react,
    "@/lib/marketplace-events-client": transport.client,
  }, { ...browser });
  return { ...react, ...browser, telemetry };
}

test("event transport bootstraps one shared first-party session and batches at most twenty events", async () => {
  const transport = clientHarness();
  const receipts = Array.from({ length: 45 }, (_, index) => transport.client.sendMarketplaceEvent({ type: "listing_impression", listingId: `listing-${index}`, source: "catalog" }));
  assert.equal(transport.timers.pending.size, 1);
  assert.equal(transport.timers.pending.values().next().value.delay, 80);
  await transport.timers.drain();
  assert.deepEqual(transport.batches().map((batch) => batch.body.events.length), [20, 20, 5]);
  assert.equal(transport.calls.filter((entry) => entry.url === "/api/events/session").length, 1);
  assert.equal((await Promise.all(receipts)).filter((receipt) => receipt?.recorded).length, 45);
  for (const entry of transport.calls) {
    assert.equal(entry.method, "POST");
    assert.equal(entry.signal.timeoutMs, 8000);
  }
});

test("event queue is capped at two hundred without allowing telemetry to prevent navigation", async () => {
  const transport = clientHarness();
  const receipts = Array.from({ length: 205 }, (_, index) => transport.client.sendMarketplaceEvent({ type: "listing_view", listingId: `listing-${index}`, source: "detail" }));
  assert.deepEqual(await Promise.all(receipts.slice(200)), Array(5).fill(null));
  await transport.timers.drain();
  assert.equal(transport.batches().length, 10);
  assert.equal((await Promise.all(receipts)).filter((receipt) => receipt?.recorded).length, 200);
});

test("lost event responses retry the same logical IDs and exact batch, not fresh events", async () => {
  let attempts = 0;
  const transport = clientHarness({ request(entry) {
    if (entry.url === "/api/events" && ++attempts === 1) throw new Error("Response lost after commit");
  } });
  const first = transport.client.sendMarketplaceEvent({ type: "listing_view", listingId, source: "detail" });
  const second = transport.client.sendMarketplaceEvent({ type: "store_view", storeId, source: "store" });
  await transport.timers.drain();
  assert.equal(transport.batches().length, 2);
  assert.deepEqual(transport.batches()[1].body, transport.batches()[0].body);
  assert.notEqual(transport.batches()[0].body.events[0].eventId, transport.batches()[0].body.events[1].eventId);
  assert.equal((await first).recorded, true);
  assert.equal((await second).recorded, true);
});

test("session failures resolve queued telemetry safely and let a later interaction retry bootstrap", async () => {
  let sessions = 0;
  const transport = clientHarness({ request(entry) {
    if (entry.url === "/api/events/session" && ++sessions === 1) return response({}, false);
  } });
  const failed = transport.client.sendMarketplaceEvent({ type: "listing_view", listingId, source: "detail" });
  await transport.timers.drain();
  assert.equal(await failed, null);
  assert.equal(transport.batches().length, 0);
  const later = transport.client.sendMarketplaceEvent({ type: "store_view", storeId, source: "store" });
  await transport.timers.drain();
  assert.equal((await later).recorded, true);
  assert.equal(sessions, 2);
});

test("event-recorder outages stop after two bounded attempts and return no synthetic receipt", async () => {
  const transport = clientHarness({ request(entry) {
    if (entry.url === "/api/events") return response({}, false);
  } });
  const receipt = transport.client.sendMarketplaceEvent({ type: "listing_view", listingId, source: "detail" });
  await transport.timers.drain();
  assert.equal(await receipt, null);
  assert.equal(transport.batches().length, 2);
  assert.deepEqual(transport.batches()[1].body, transport.batches()[0].body);
  assert.equal(transport.timers.pending.size, 0);
});

test("batch receipts are matched by their stable event IDs rather than response order", async () => {
  const transport = clientHarness({ request(entry) {
    if (entry.url === "/api/events") {
      return response({ events: entry.body.events.map((event, index) => ({ eventId: event.eventId, recorded: true, view_count: index + 7 })).reverse() });
    }
  } });
  const first = transport.client.sendMarketplaceEvent({ type: "listing_view", listingId, source: "detail" });
  const second = transport.client.sendMarketplaceEvent({ type: "store_view", storeId, source: "store" });
  await transport.timers.drain();
  assert.equal((await first).view_count, 7);
  assert.equal((await second).view_count, 8);
});

test("browsing dedup persists across rerenders and visibility changes but expires after thirty minutes", async () => {
  const transport = clientHarness();
  const view = { type: "listing_view", listingId, source: "detail" };
  const first = transport.client.sendBrowsingEvent(view, listingId);
  assert.equal(transport.client.sendBrowsingEvent(view, listingId), first);
  await transport.timers.drain();
  transport.advance(30 * 60 * 1000 - 1);
  assert.equal(transport.client.sendBrowsingEvent(view, listingId), first);
  transport.advance(1);
  const nextWindow = transport.client.sendBrowsingEvent(view, listingId);
  assert.notEqual(nextWindow, first);
  await transport.timers.drain();
  assert.equal(transport.batches().length, 2);
});

test("listing impressions require an intersecting half-visible card in a visible tab", async () => {
  const transport = clientHarness();
  const harness = telemetryHarness(transport, browserHarness("hidden"));
  const props = { listingId, children: "Listing card" };
  harness.render(harness.telemetry.ListingImpressionBoundary, props);
  const observer = harness.observers[0];
  assert.deepEqual(observer.options, { threshold: 0.5 });
  assert.ok(observer.element);
  observer.intersect(0.8);
  assert.equal(transport.timers.pending.size, 0);
  observer.intersect(0.49);
  harness.visibility("visible");
  assert.equal(transport.timers.pending.size, 0);
  observer.intersect(0.9, false);
  assert.equal(transport.timers.pending.size, 0);
  observer.intersect(0.5);
  await transport.timers.drain();
  assert.deepEqual(transport.batches()[0].body.events.map(withoutEventId), [{ type: "listing_impression", listingId, source: "home" }]);
  harness.render(harness.telemetry.ListingImpressionBoundary, props);
  harness.visibility("hidden");
  harness.visibility("visible");
  observer.intersect(1);
  assert.equal(transport.timers.pending.size, 0);
  assert.equal(harness.observers.length, 1);
  harness.unmount();
  assert.equal(observer.disconnected, true);
  assert.equal(harness.listeners.get("visibilitychange").size, 0);
});

test("store visits are visible-tab events and share the rerender deduplication window", async () => {
  const transport = clientHarness();
  const harness = telemetryHarness(transport, browserHarness("hidden"));
  harness.render(harness.telemetry.StoreVisitTelemetry, { storeId });
  assert.equal(transport.timers.pending.size, 0);
  harness.visibility("visible");
  await transport.timers.drain();
  harness.render(harness.telemetry.StoreVisitTelemetry, { storeId });
  harness.visibility("hidden");
  harness.visibility("visible");
  assert.equal(transport.timers.pending.size, 0);
  assert.equal(transport.batches()[0].body.events[0].type, "store_view");
  harness.unmount();
  assert.equal(harness.listeners.get("visibilitychange").size, 0);
});

test("search telemetry uses only an SSR receipt and records canonical changes once, not fresh receipts for the same search", async () => {
  const transport = clientHarness();
  const harness = telemetryHarness(transport, browserHarness("hidden"));
  const filters = { category: "guitars", sort: "newest" };
  const props = { searchReceipt: "signed-server-count-and-filters", signature: JSON.stringify(filters), filtered: true };
  harness.render(harness.telemetry.SearchTelemetry, props);
  assert.equal(transport.timers.pending.size, 0);
  harness.visibility("visible");
  await transport.timers.drain();
  assert.deepEqual(transport.batches()[0].body.events.map(withoutEventId), [
    { type: "search", searchReceipt: props.searchReceipt, source: "catalog" },
    { type: "filter_applied", searchReceipt: props.searchReceipt, source: "catalog" },
  ]);
  harness.render(harness.telemetry.SearchTelemetry, { ...props, searchReceipt: "new-server-receipt-same-state" });
  assert.equal(transport.timers.pending.size, 0);
  harness.render(harness.telemetry.SearchTelemetry, { searchReceipt: "different-search-receipt", signature: JSON.stringify({ sort: "newest" }), filtered: false });
  await transport.timers.drain();
  assert.equal(transport.batches()[1].body.events.length, 1);
  assert.equal(transport.batches()[1].body.events[0].type, "search");
  harness.unmount();
});

test("catalog creates authoritative search receipts only for successful page-one results and canonical supported filters", () => {
  const source = ts.createSourceFile("catalog.tsx", fs.readFileSync("app/listados/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function collect(node) { if (ts.isVariableDeclaration(node)) declarations.push(node); ts.forEachChild(node, collect); }
  collect(source);
  const receipt = declarations.find((node) => node.name.getText(source) === "searchReceipt");
  assert.ok(receipt && ts.isConditionalExpression(receipt.initializer));
  assert.equal(receipt.initializer.condition.getText(source), "!error && page === 1");
  assert.equal(receipt.initializer.whenTrue.getText(source), "createSearchReceipt(filters, count ?? 0)");
  assert.equal(receipt.initializer.whenFalse.getText(source), "null");
  const rendered = [];
  function jsx(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "SearchTelemetry") rendered.push(node);
    ts.forEachChild(node, jsx);
  }
  jsx(source);
  assert.equal(rendered.length, 1);
  const attributes = rendered[0].attributes.properties;
  const signature = attributes.find((attribute) => attribute.name?.getText(source) === "signature");
  assert.equal(signature.initializer.expression.getText(source), "JSON.stringify(searchState.filters)");
  assert.ok(!signature.initializer.expression.getText(source).includes("page"));
});

test("detail view count uses the accepted server receipt, not a synthetic local increment", async () => {
  const transport = clientHarness({ request(entry) {
    if (entry.url === "/api/events") return response({ events: entry.body.events.map((event) => ({ eventId: event.eventId, recorded: true, view_count: 17 })) });
  } });
  const browser = browserHarness("hidden");
  const react = reactHarness();
  const { ListingDetailMetadata } = loadTypeScript("components/listing-detail-metadata.tsx", {
    react: react.react, "@/lib/marketplace-events-client": transport.client,
  }, browser);
  const props = { listingId, publishedAt: "2026-09-01", createdAt: "2026-08-01", initialViewCount: 8 };
  assert.equal(react.render(ListingDetailMetadata, props).props.children[1].props.children, "Visto 8 veces");
  assert.equal(transport.timers.pending.size, 0);
  browser.visibility("visible");
  await transport.timers.drain();
  assert.equal(react.render(ListingDetailMetadata, props).props.children[1].props.children, "Visto 17 veces");
  browser.visibility("hidden");
  browser.visibility("visible");
  await settle();
  assert.equal(transport.timers.pending.size, 0);
  assert.equal(transport.batches().length, 1);
  react.unmount();
  assert.equal(browser.listeners.get("visibilitychange").size, 0);
});

test("sold detail metadata preserves its existing count and does not register an active-listing view", () => {
  const browser = browserHarness();
  const react = reactHarness();
  const calls = [];
  const { ListingDetailMetadata } = loadTypeScript("components/listing-detail-metadata.tsx", {
    react: react.react, "@/lib/marketplace-events-client": { sendBrowsingEvent: (...args) => { calls.push(args); return Promise.resolve(null); } },
  }, browser);
  const metadata = react.render(ListingDetailMetadata, { listingId, publishedAt: null, createdAt: "2026-09-01", initialViewCount: 1, trackView: false });
  assert.equal(metadata.props.children[1].props.children, "Visto 1 vez");
  browser.visibility("hidden");
  browser.visibility("visible");
  assert.deepEqual(calls, []);
});

function contactHarness({ api, request, popup = true } = {}) {
  const timers = timersHarness();
  const calls = { opens: [], requests: [], assigned: [], prevented: 0 };
  const tabs = [];
  let sequence = 0;
  const { WhatsAppContactLink } = loadTypeScript("components/whatsapp-contact-link.tsx", {
    "@/lib/marketplace-events-client": api ?? { ensureMarketplaceSession: async () => {} },
  }, {
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    AbortController,
    crypto: { randomUUID: () => `contact-${++sequence}` },
    window: {
      open(...args) {
        calls.opens.push(args);
        if (!popup) return null;
        const tab = { closed: false, opener: "parent-window", location: { href: "about:blank" } };
        tabs.push(tab);
        return tab;
      },
      location: { assign: (destination) => calls.assigned.push(destination) },
    },
    async fetch(url, options) {
      const entry = { url, ...options, body: JSON.parse(options.body) };
      calls.requests.push(entry);
      if (request) return request(entry);
      return response({ url: "https://wa.me/51999111222" });
    },
  });
  const href = "https://wa.me/51999888777?text=Mensaje%20privado%20del%20usuario";
  return {
    calls, tabs, timers, href,
    render(props = {}) { return WhatsAppContactLink({ href, listingId, children: "Contactar", ...props }); },
    click(props = {}, modifiers = {}) {
      return this.render(props).props.onClick({ preventDefault: () => { calls.prevented++; }, ...modifiers });
    },
  };
}

test("WhatsApp contact records canonical identity without serializing user message drafts or browser role claims", async () => {
  const contact = contactHarness();
  const anchor = contact.render();
  assert.equal(anchor.type, "a");
  assert.equal(anchor.props.href, contact.href);
  assert.equal(anchor.props.target, "_blank");
  assert.equal(anchor.props.rel, "noopener noreferrer");
  await contact.click();
  assert.deepEqual(contact.calls.requests[0].body, { eventId: "contact-1", listingId, source: "detail" });
  assert.equal(contact.calls.requests[0].url, "/api/contact");
  assert.equal(contact.calls.requests[0].method, "POST");
  assert.equal(JSON.stringify(contact.calls.requests[0].body).includes("privado"), false);
  assert.equal(contact.tabs[0].opener, null);
  assert.equal(contact.tabs[0].location.href, "https://wa.me/51999111222");
  assert.equal(contact.calls.prevented, 1);
  assert.equal(contact.timers.pending.size, 0);
});

test("true repeated WhatsApp clicks each record their own event while sharing the cookie bootstrap", async () => {
  const transport = clientHarness();
  const contact = contactHarness({ api: transport.client });
  await Promise.all([contact.click(), contact.click()]);
  assert.equal(transport.calls.filter((entry) => entry.url === "/api/events/session").length, 1);
  assert.equal(contact.calls.requests.length, 2);
  assert.notEqual(contact.calls.requests[0].body.eventId, contact.calls.requests[1].body.eventId);
  assert.equal(contact.tabs.length, 2);
  assert.ok(contact.tabs.every((tab) => tab.location.href === "https://wa.me/51999111222"));
});

test("store-only WhatsApp contact records its store entity and supported source", async () => {
  const contact = contactHarness();
  await contact.click({ listingId: undefined, storeId, source: "store" });
  assert.deepEqual(contact.calls.requests[0].body, { eventId: "contact-1", storeId, source: "store" });
});

test("WhatsApp failures and unsafe redirect responses fall back to the existing safe contact URL", async () => {
  for (const request of [
    async () => { throw new Error("Telemetry unavailable"); },
    async () => response({}, false),
    async () => response({ url: "https://phishing.example/wa.me/51999111222" }),
    async () => response({ url: "javascript:alert(1)" }),
    async () => response({ url: 7 }),
  ]) {
    const contact = contactHarness({ request });
    await contact.click();
    assert.equal(contact.tabs[0].location.href, contact.href);
    assert.equal(contact.timers.pending.size, 0);
  }
});

test("a blocked popup safely uses the same-window contact fallback after recording", async () => {
  const contact = contactHarness({ popup: false });
  await contact.click();
  assert.deepEqual(contact.calls.assigned, ["https://wa.me/51999111222"]);
});

test("modified WhatsApp clicks retain native navigation without opening an extra tab or preventing default", async () => {
  const contact = contactHarness();
  await contact.click({}, { ctrlKey: true });
  assert.equal(contact.calls.prevented, 0);
  assert.deepEqual(contact.calls.opens, []);
  assert.deepEqual(contact.calls.assigned, []);
  assert.equal(contact.calls.requests.length, 1);
});

test("the nine-hundred-millisecond contact deadline bounds delayed session bootstrap", async () => {
  const contact = contactHarness({ api: { ensureMarketplaceSession: () => new Promise(() => {}) } });
  const clicking = contact.click();
  assert.equal(contact.timers.pending.values().next().value.delay, 900);
  await contact.timers.runNext();
  await clicking;
  assert.equal(contact.tabs[0].location.href, contact.href);
  assert.equal(contact.calls.requests.length, 0);
  assert.equal(contact.timers.pending.size, 0);
});

test("the contact deadline aborts a stalled recorder but still navigates to the safe fallback", async () => {
  const contact = contactHarness({ request: () => new Promise(() => {}) });
  const clicking = contact.click();
  await settle();
  assert.equal(contact.calls.requests.length, 1);
  const signal = contact.calls.requests[0].signal;
  assert.equal(signal.aborted, false);
  await contact.timers.runNext();
  await clicking;
  assert.equal(signal.aborted, true);
  assert.equal(contact.tabs[0].location.href, contact.href);
});
