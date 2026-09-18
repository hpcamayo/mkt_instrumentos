// Optional actual-browser acceptance proof; uses only the local analytics integration fixtures.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

exports.runAnalyticsBrowserSmoke = async function runAnalyticsBrowserSmoke({ base, service, ownerSession, otherSession, storeSession, buyerSession, live, sold }) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  assert.ok(localHosts.has(new URL(base).hostname), "Analytics browser acceptance is local-only.");
  assert.ok(localHosts.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname), "Browser fixtures require local Supabase.");
  const binary = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
  const prefix = `s4a-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const sessions = [];
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "laria-s4-analytics-browser-"));
  const numbers = new Intl.NumberFormat("es-PE");
  const percentages = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 });
  let shiftedRows = [];

  function browser(label) {
    const session = `${prefix}-${label}`;
    sessions.push(session);
    function command(...args) {
      const result = spawnSync(binary, ["--session", session, "--json", ...args], {
        encoding: "utf8", timeout: 45000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "30000" },
      });
      assert.equal(result.status, 0, `agent-browser ${args[0]}: ${result.error?.message || result.stderr || result.stdout}`);
      const response = JSON.parse(result.stdout.trim());
      assert.equal(response.success, true, response.error ?? `Browser ${args[0]} failed.`);
      return response.data;
    }
    function evaluate(expression) { return command("eval", expression).result; }
    function wait(expression) { command("wait", "--fn", `Boolean(${expression})`); }
    function healthy() {
      assert.equal(evaluate("!!document.body.innerText.trim() && !document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')"), true);
      assert.deepEqual(command("errors").errors, [], "Uncaught browser errors.");
    }
    function login(user) {
      command("open", `${base}/login`);
      assert.match(command("snapshot", "-i").snapshot, /Correo/);
      command("find", "label", "Correo", "fill", user.email);
      command("find", "label", "Contraseña", "fill", user.password);
      command("find", "role", "button", "click", "--name", "Ingresar");
      command("wait", "--url", "**/mi-cuenta");
      healthy();
    }
    return { command, evaluate, wait, healthy, login };
  }
  async function report(session, days) {
    const result = await session.client.rpc("get_account_analytics", { p_days: days });
    assert.equal(result.error, null);
    return result.data;
  }
  function metrics(page, label) {
    return page.evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('section[aria-label=${JSON.stringify(label)}] > div:first-child > div')).map(card => {
      const lines = card.querySelectorAll(':scope > p');
      return [lines[0].textContent, lines[1].textContent];
    }))`);
  }
  function assertMetrics(actual, expected, store = false) {
    const summary = expected.summary;
    assert.equal(actual["Publicaciones activas"], numbers.format(summary.active));
    assert.equal(actual["Vistas de publicaciones"], numbers.format(summary.views));
    assert.equal(actual["Contactos por WhatsApp"], numbers.format(summary.contacts));
    assert.equal(actual["Publicaciones vendidas"], numbers.format(summary.sold));
    if (store) {
      assert.equal(actual["Impresiones de productos"], numbers.format(summary.impressions));
      assert.equal(actual["Visitas a la tienda"], numbers.format(summary.store_views));
      assert.equal(actual["Contactos a la tienda"], numbers.format(summary.store_contacts));
      assert.equal(actual["CTR de productos"], summary.ctr === null ? "Sin datos" : percentages.format(summary.ctr));
      assert.equal(actual["Tasa de contacto"], summary.contact_rate === null ? "Sin datos" : percentages.format(summary.contact_rate));
    }
    assert.equal(actual["Favoritos actuales"], numbers.format(summary.favorites));
    assert.equal(actual["Guardados en el periodo"], numbers.format(summary.favorite_additions));
    assert.equal(actual["Retirados en el periodo"], numbers.format(summary.favorite_removals));
    assert.equal(actual["Tasa de favoritos"], summary.favorite_rate === null ? "Sin datos" : percentages.format(summary.favorite_rate));
    assert.equal(Object.keys(actual).some((label) => /ingresos|revenue/i.test(label)), false);
  }
  async function detailViews() {
    const result = await service.from("marketplace_events").select("id", { count: "exact", head: true }).eq("listing_id", live.id).eq("actor_user_id", buyerSession.user.id).eq("event_type", "listing_view");
    assert.equal(result.error, null);
    return result.count;
  }
  async function contacts() {
    const result = await service.from("marketplace_events").select("id", { count: "exact", head: true }).eq("listing_id", live.id).eq("actor_user_id", buyerSession.user.id).eq("event_type", "whatsapp_contact");
    assert.equal(result.error, null);
    return result.count;
  }

  const particular = browser("owner");
  const store = browser("store");
  const empty = browser("empty");
  const buyer = browser("buyer");
  const anonymous = browser("anon");
  try {
    particular.login(ownerSession.user);
    const ownerReport = await report(ownerSession, 0);
    particular.wait("document.querySelector('section[aria-label=\"Resumen de publicaciones\"]')");
    assertMetrics(metrics(particular, "Resumen de publicaciones"), ownerReport);
    assert.ok(ownerReport.listings.length > 5, "Summary fixture must prove full-owner aggregation, not recent-five values.");
    assert.equal(particular.evaluate("!!document.querySelector('nav[aria-label=\"Navegación de cuenta\"] a[href=\"/mi-cuenta/tienda/estadisticas\"]')"), false);
    particular.command("screenshot", path.join(artifacts, "particular-summary.png"), "--full");
    particular.command("open", `${base}/mi-cuenta/publicaciones`);
    particular.wait("document.querySelector('table tbody tr')");
    const rows = particular.evaluate("Array.from(document.querySelectorAll('table tbody tr')).map(row => ({ cells: Array.from(row.querySelectorAll('td')).map(cell => cell.textContent), hrefs: Array.from(row.querySelectorAll('a')).map(link => link.getAttribute('href')) }))");
    assert.equal(rows.length, ownerReport.listings.length);
    for (const fixture of [live, sold]) {
      const expected = ownerReport.listings.find((item) => item.id === fixture.id);
      const row = rows.find((item) => item.hrefs.includes(`/instrumentos/${fixture.slug}`))?.cells;
      assert.ok(row, "Owned listing must be visible in management table.");
      assert.equal(row[4], numbers.format(expected.views));
      assert.equal(row[5], numbers.format(expected.contacts));
      assert.equal(row[6], numbers.format(expected.favorites));
      assert.ok(row[3] && row[3] !== "Aún no publicada", "First-publication date must be present.");
      if (expected.status === "sold") assert.match(row[1], /Vendida.*Marcada vendida:/);
    }
    particular.healthy();
    particular.command("screenshot", path.join(artifacts, "particular-listing-metadata.png"), "--full");

    empty.login(otherSession.user);
    empty.wait("document.querySelector('section[aria-label=\"Resumen de publicaciones\"]')");
    const emptyReport = await report(otherSession, 0);
    assert.equal(emptyReport.summary.views, 0);
    assertMetrics(metrics(empty, "Resumen de publicaciones"), emptyReport);

    store.login(storeSession.user);
    for (const days of [0, 7, 30]) {
      const expected = await report(storeSession, days);
      store.command("open", `${base}/mi-cuenta/tienda/estadisticas?periodo=${days}`);
      store.wait("document.querySelector('section[aria-label=\"Métricas de tienda\"]')");
      assertMetrics(metrics(store, "Métricas de tienda"), expected, true);
      assert.equal(store.evaluate("document.querySelector('nav[aria-label=\"Periodo de estadísticas\"] a[aria-current=page]').getAttribute('href')"), `/mi-cuenta/tienda/estadisticas?periodo=${days}`);
      assert.match(store.evaluate("document.body.innerText"), /excluyen las vistas históricas sin evento/);
      store.healthy();
    }
    store.command("screenshot", path.join(artifacts, "store-statistics-real.png"), "--full");

    const ownedStore = await storeSession.client.from("stores").select("id,slug").eq("owner_user_id", storeSession.user.id).single();
    assert.equal(ownedStore.error, null);
    const timestamps = await service.from("marketplace_events").select("id,created_at").eq("store_id", ownedStore.data.id);
    assert.equal(timestamps.error, null);
    shiftedRows = timestamps.data;
    assert.ok(shiftedRows.length > 0, "Store fixture must contain actual recorded events.");
    const shifted = await service.from("marketplace_events").update({ created_at: new Date(Date.now() - 45 * 86400000).toISOString() }).in("id", shiftedRows.map((row) => row.id));
    assert.equal(shifted.error, null);
    for (const days of [0, 7, 30]) {
      const expected = await report(storeSession, days);
      if (days > 0) {
        assert.equal(expected.summary.views, 0);
        assert.equal(expected.summary.contacts, 0);
        assert.equal(expected.summary.ctr, null);
        assert.equal(expected.summary.contact_rate, null);
        assert.ok(expected.summary.active > 0, "Current inventory remains active despite no events in the time window.");
      } else assert.ok(expected.summary.views > 0, "Lifetime must retain real historical events/views.");
      store.command("open", `${base}/mi-cuenta/tienda/estadisticas?periodo=${days}`);
      store.wait("document.querySelector('section[aria-label=\"Métricas de tienda\"]')");
      assertMetrics(metrics(store, "Métricas de tienda"), expected, true);
    }
    store.command("set", "viewport", "390", "844");
    store.command("find", "text", "Cuenta · Estadísticas", "click");
    const mobile = store.command("snapshot", "-i").snapshot;
    assert.match(mobile, /Estadísticas/);
    assert.equal(store.evaluate("document.querySelector('nav[aria-label=\"Menú de cuenta móvil\"] a[aria-current=page]').textContent.trim()"), "Estadísticas");
    assert.equal(store.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    store.healthy();
    store.command("screenshot", path.join(artifacts, "store-statistics-zero-mobile.png"), "--full");

    buyer.login(buyerSession.user);
    const viewBefore = await detailViews();
    for (const reload of [false, true]) {
      if (reload) buyer.command("reload");
      else buyer.command("open", `${base}/instrumentos/${live.slug}`);
      buyer.wait("performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === '/api/events')");
      assert.equal(await detailViews(), viewBefore, "Actual detail hydration and refresh must reuse the actor's existing deduped view.");
      buyer.healthy();
    }
    buyer.wait(`(() => {
      const thumbnails = document.querySelector('[aria-label="Miniaturas de fotos"]');
      const main = thumbnails?.previousElementSibling.querySelector('img');
      return main?.complete && main.naturalWidth > 0;
    })()`);
    const gallery = buyer.evaluate(`(() => {
      const thumbnails = document.querySelector('[aria-label="Miniaturas de fotos"]');
      const main = thumbnails?.previousElementSibling.querySelector('img');
      return { main: main && { src: main.getAttribute('src'), sizes: main.getAttribute('sizes'), srcset: main.getAttribute('srcset'), loading: main.getAttribute('loading') },
        thumbnails: Array.from(thumbnails?.querySelectorAll('img') ?? []).map(image => ({ src: image.getAttribute('src'), sizes: image.getAttribute('sizes'), loading: image.getAttribute('loading') })) };
    })()`);
    assert.ok(gallery.main.src.startsWith("/_next/image"));
    assert.ok(gallery.main.sizes.includes("100vw") && gallery.main.srcset);
    assert.equal(gallery.main.loading, "eager");
    assert.ok(gallery.thumbnails.length >= 2);
    assert.ok(gallery.thumbnails.every((image) => image.src.startsWith("/_next/image") && image.sizes === "64px" && image.loading === "lazy"));
    buyer.evaluate(`(() => {
      window.__qaContactDestinations = [];
      window.open = () => ({ closed: false, opener: null, location: { set href(url) { window.__qaContactDestinations.push(url); } } });
    })()`);
    const beforeContact = await contacts();
    buyer.command("find", "first", 'a[href^="https://wa.me/"]', "click");
    buyer.wait("window.__qaContactDestinations.length === 1");
    assert.equal(new URL(buyer.evaluate("window.__qaContactDestinations[0]")).hostname, "wa.me");
    assert.equal(await contacts(), beforeContact + 1, "Actual UI click must record buyer contact through the trusted endpoint.");
    buyer.command("network", "route", `${base}/api/contact`, "--abort");
    buyer.command("find", "first", 'a[href^="https://wa.me/"]', "click");
    buyer.wait("window.__qaContactDestinations.length === 2");
    assert.equal(new URL(buyer.evaluate("window.__qaContactDestinations[1]")).hostname, "wa.me");
    assert.equal(await contacts(), beforeContact + 1, "Failed telemetry must not create a contact event or block the canonical WhatsApp destination.");
    buyer.command("network", "unroute", `${base}/api/contact`);
    buyer.healthy();

    const inventory = await storeSession.client.from("listings").select("id,title,slug").eq("store_id", ownedStore.data.id).eq("status", "approved").single();
    assert.equal(inventory.error, null);
    async function anonymousImpressions() {
      const result = await service.from("marketplace_events").select("id", { count: "exact", head: true }).eq("listing_id", inventory.data.id).is("actor_user_id", null).eq("event_type", "listing_impression");
      assert.equal(result.error, null);
      return result.count;
    }
    const initialAnonymousImpressions = await anonymousImpressions();
    const existingEvents = await service.from("marketplace_events").select("id").eq("store_id", ownedStore.data.id);
    assert.equal(existingEvents.error, null);
    const existingIds = new Set(existingEvents.data.map((row) => row.id));
    anonymous.command("set", "viewport", "390", "250");
    anonymous.command("open", `${base}/tiendas/${ownedStore.data.slug}`);
    anonymous.wait("document.querySelector('article') && performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname === '/api/events')");
    assert.equal(anonymous.evaluate("document.querySelector('article').getBoundingClientRect().top >= innerHeight"), true, "Test card must actually be offscreen, not just assumed hidden.");
    assert.equal(await anonymousImpressions(), initialAnonymousImpressions, "Actual offscreen card must not record an impression during hydration/store tracking.");
    anonymous.command("set", "viewport", "390", "844");
    anonymous.command("scrollintoview", "article");
    anonymous.wait(`(() => {
      const box = document.querySelector('article').getBoundingClientRect();
      const visible = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
      return visible / box.height >= 0.5 && performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname === '/api/events').length >= 2;
    })()`);
    assert.equal(await anonymousImpressions(), initialAnonymousImpressions + 1, "Actual viewport intersection must record exactly one anonymous card impression.");
    const cardImage = anonymous.evaluate(`(() => {
      const image = document.querySelector('article img');
      return { src: image.getAttribute('src'), sizes: image.getAttribute('sizes'), srcset: image.getAttribute('srcset'), loading: image.getAttribute('loading') };
    })()`);
    assert.ok(cardImage.src.startsWith("/_next/image") && cardImage.sizes.includes("100vw") && cardImage.srcset);
    assert.equal(cardImage.loading, "lazy");
    anonymous.wait("document.querySelector('article img').complete && document.querySelector('article img').naturalWidth > 0");
    anonymous.command("scroll", "up", "1800");
    anonymous.command("scrollintoview", "article");
    assert.equal(await anonymousImpressions(), initialAnonymousImpressions + 1, "Returning to the viewport must not duplicate its impression.");
    anonymous.healthy();
    anonymous.command("screenshot", path.join(artifacts, "anonymous-visible-store-card.png"), "--full");
    const extraEvents = await service.from("marketplace_events").select("id,session_id").eq("store_id", ownedStore.data.id);
    assert.equal(extraEvents.error, null);
    const createdEvents = extraEvents.data.filter((row) => !existingIds.has(row.id));
    console.log(`PASS actual analytics browser: complete Particular summary+metadata, genuine zero, Store 0/7/30 real/zero ratios, mobile active menu, detail refresh dedupe, real contact + failure fallback, actual anonymous offscreen/visible impression, optimized responsive card/detail + lazy thumbnails. Artifacts: ${artifacts}`);
    // New anonymous events have fixture listing/store targets, and are also returned for explicit parent cleanup.
    return { eventIds: createdEvents.map((row) => row.id), sessionIds: [...new Set(createdEvents.map((row) => row.session_id))] };
  } finally {
    try {
      for (const row of shiftedRows) {
        const restored = await service.from("marketplace_events").update({ created_at: row.created_at }).eq("id", row.id);
        assert.equal(restored.error, null);
      }
    } finally {
      for (const session of sessions) spawnSync(binary, ["--session", session, "--json", "close"], { encoding: "utf8", timeout: 10000 });
    }
  }
};
