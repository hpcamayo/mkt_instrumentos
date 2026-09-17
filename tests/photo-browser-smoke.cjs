// Optional actual-browser proof used only by the local Sprint 4 photo integration.
// Install agent-browser separately, or provide LARIA_AGENT_BROWSER_BIN explicitly.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.exports = async function photoBrowserSmoke({ base, id, session, adminSession, service, objects, edit, pending, livePhotos }) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  assert.ok(localHosts.has(new URL(base).hostname), "Browser smoke is local-only.");
  assert.ok(localHosts.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname), "Browser fixtures require local Supabase.");
  const browser = process.env.LARIA_AGENT_BROWSER_BIN ?? "agent-browser";
  const browserSession = `s4p-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const adminBrowserSession = `${browserSession}-admin`;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "laria-s4-photo-browser-"));
  const addition = path.join(output, "addition.jpg");
  const replacement = path.join(output, "replacement.webp");
  const photoSection = 'section[aria-labelledby="edit-photo-heading"]';
  const photoRows = `${photoSection} ol > li`;
  const photoSources = `Array.from(document.querySelectorAll(${JSON.stringify(`${photoRows} img`)})).map((image) => {
    const source = image.getAttribute('src');
    return source.startsWith('/_next/image') ? new URL(source, location.origin).searchParams.get('url') : source;
  })`;

  function inSession(sessionName, ...args) {
    const result = spawnSync(browser, ["--session", sessionName, "--json", ...args], {
      encoding: "utf8", timeout: 45000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "30000" },
    });
    assert.equal(result.status, 0, `agent-browser ${args[0]} failed: ${result.error?.message || result.stderr || result.stdout}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.success, true, parsed.error ?? `Browser command ${args[0]} failed.`);
    return parsed.data;
  }
  function command(...args) { return inSession(browserSession, ...args); }
  function adminCommand(...args) { return inSession(adminBrowserSession, ...args); }
  function evaluate(expression) { return command("eval", expression).result; }
  function snapshot() { return command("snapshot", "-i").snapshot; }
  function waitFor(expression) { command("wait", "--fn", `Boolean(${expression})`); }
  function assertHealthy() {
    assert.equal(evaluate("!!document.body.innerText.trim() && !document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')"), true, "Page must render without framework error overlays.");
    assert.deepEqual(command("errors").errors, [], "Uncaught browser errors.");
  }
  function sources() { return evaluate(photoSources); }
  function clickPhoto(label) {
    command("click", `button[aria-label=${JSON.stringify(label)}]`);
    snapshot();
  }
  async function saveAndCheck(expectedCount) {
    command("scroll", "down", "1800");
    command("find", "role", "button", "click", "--name", "Guardar cambios");
    command("wait", "--url", "**guardado=revision_amended");
    waitFor(`(() => {
      const notice = document.querySelector('form [role="status"][tabindex="-1"]');
      const rows = document.querySelectorAll(${JSON.stringify(photoRows)});
      return notice && notice === document.activeElement && rows.length === ${expectedCount}
        && !Array.from(rows).some((row) => row.querySelector('img')?.getAttribute('src')?.startsWith('blob:'))
        && document.querySelector('form[aria-busy="false"]');
    })()`);
    waitFor(`(() => {
      const notice = document.querySelector('form [role="status"][tabindex="-1"]');
      const box = notice?.getBoundingClientRect();
      return box && box.top >= 0 && box.bottom <= innerHeight;
    })()`);
    assert.match(evaluate("document.activeElement.textContent"), /Actualizamos la propuesta pendiente/);
    assertHealthy();
    snapshot();
    return pending(id);
  }

  const live = await livePhotos(id);
  const liveUrls = live.map((photo) => photo.image_url);
  const original = await service.from("listings").select("title").eq("id", id).single();
  assert.equal(original.error, null);
  const proposedTitle = "QA Sprint 4 navegador propuesta con fotos";
  const proposal = await edit(id, session, { moderated: { title: proposedTitle } });
  try {
    command("open", `${base}/login`);
    assert.match(snapshot(), /Correo/);
    const images = evaluate(`(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 24; canvas.height = 24;
      const context = canvas.getContext('2d');
      context.fillStyle = '#dc2626'; context.fillRect(0, 0, 24, 24);
      const jpeg = canvas.toDataURL('image/jpeg', 0.9);
      context.fillStyle = '#2563eb'; context.fillRect(0, 0, 24, 24);
      return { jpeg, webp: canvas.toDataURL('image/webp', 0.9) };
    })()`);
    assert.match(images.jpeg, /^data:image\/jpeg;base64,/);
    assert.match(images.webp, /^data:image\/webp;base64,/);
    fs.writeFileSync(addition, Buffer.from(images.jpeg.split(",", 2)[1], "base64"));
    fs.writeFileSync(replacement, Buffer.from(images.webp.split(",", 2)[1], "base64"));
    command("find", "label", "Correo", "fill", session.user.email);
    command("find", "label", "Contraseña", "fill", session.user.password);
    command("find", "role", "button", "click", "--name", "Ingresar");
    command("wait", "--url", "**/mi-cuenta");
    command("open", `${base}/mi-cuenta/publicaciones/${id}/editar`);
    waitFor(`document.querySelectorAll(${JSON.stringify(photoRows)}).length === ${live.length}`);
    assert.match(snapshot(), /Restaurar fotos aprobadas/);
    assertHealthy();
    assert.equal(evaluate("document.querySelector('input[name=title]').value"), proposedTitle);
    assert.deepEqual(sources(), liveUrls);
    command("screenshot", path.join(output, "desktop-editor.png"), "--full");

    command("upload", `${photoSection} input[type=file][multiple]`, addition);
    waitFor(`document.querySelectorAll(${JSON.stringify(photoRows)}).length === ${live.length + 1}`);
    snapshot();
    assert.equal(sources().length, live.length + 1);
    for (let index = live.length + 1; index > 1; index--) clickPhoto(`Mover foto ${index} antes`);
    assert.ok(sources()[0].startsWith("blob:"), "New primary must move to exact first position.");
    clickPhoto("Quitar foto 3");
    waitFor(`document.querySelectorAll(${JSON.stringify(photoRows)}).length === ${live.length}`);
    assert.equal(sources().length, live.length);
    command("upload", `${photoSection} input[aria-label="Reemplazar foto 3"]`, replacement);
    waitFor(`${photoSources}[2].startsWith('blob:')`);
    snapshot();
    assert.ok(sources()[2].startsWith("blob:"), "Replacement must keep its exact position.");
    const saved = await saveAndCheck(live.length);
    assert.equal(saved.id, proposal.revision_id, "Browser amendments must reuse the existing text proposal.");
    assert.equal(saved.title, proposedTitle);
    const savedUrls = saved.listing_revision_photos.sort((a, b) => a.sort_order - b.sort_order).map((photo) => photo.image_url);
    assert.deepEqual(sources(), savedUrls, "Remounted form must display exactly the server-persisted proposal.");
    assert.equal(savedUrls[1], liveUrls[0]);
    assert.ok(savedUrls[0].startsWith("/api/listing-images/") && savedUrls[2].startsWith("/api/listing-images/"));
    assert.match(savedUrls[0], /\.jpg$/);
    assert.match(savedUrls[2], /\.webp$/);
    for (const imageUrl of savedUrls) {
      if (!imageUrl.startsWith("/api/listing-images/")) continue;
      const objectPath = imageUrl.slice("/api/listing-images/".length);
      if (!objects.some((object) => object.bucket === "listing-edit-photos" && object.path === objectPath)) {
        objects.push({ bucket: "listing-edit-photos", path: objectPath });
      }
    }
    assert.deepEqual((await livePhotos(id)).map((photo) => photo.image_url), liveUrls, "Browser proposal never changes live approved photos.");
    command("screenshot", path.join(output, "desktop-success.png"));

    adminCommand("open", `${base}/login`);
    adminCommand("snapshot", "-i");
    adminCommand("find", "label", "Correo", "fill", adminSession.user.email);
    adminCommand("find", "label", "Contraseña", "fill", adminSession.user.password);
    adminCommand("find", "role", "button", "click", "--name", "Ingresar");
    adminCommand("wait", "--url", "**/mi-cuenta");
    adminCommand("open", `${base}/admin`);
    for (const privateImage of [savedUrls[0], savedUrls[2]]) {
      const selector = `img[src=${JSON.stringify(privateImage)}]`;
      adminCommand("wait", selector);
      adminCommand("scrollintoview", selector);
      adminCommand("wait", "--fn", `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).every((image) => image.complete && image.naturalWidth > 0)`);
    }
    assert.equal(adminCommand("eval", "document.body.innerText.includes('Fotos propuestas')").result, true);
    assert.deepEqual(adminCommand("errors").errors, []);
    adminCommand("snapshot", "-i");
    adminCommand("screenshot", path.join(output, "admin-private-proposal.png"));

    command("set", "viewport", "390", "844");
    snapshot();
    command("click", "summary");
    assert.match(snapshot(), /Menú de cuenta móvil/);
    assert.equal(evaluate("(() => { const menu = document.querySelector('nav[aria-label=\"Menú de cuenta móvil\"]'); return !!menu && menu.getBoundingClientRect().width > 0 && Array.from(menu.querySelectorAll('a')).some((link) => link.getAttribute('aria-current') === 'page'); })()"), true, "Mobile account menu must expose an active real account destination.");
    assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "Photo editor must not overflow the narrow viewport.");
    command("screenshot", path.join(output, "mobile-menu.png"), "--full");
    command("click", "summary");
    command("find", "role", "button", "click", "--name", "Restaurar fotos aprobadas");
    waitFor(`JSON.stringify(${photoSources}) === ${JSON.stringify(JSON.stringify(liveUrls))}`);
    snapshot();
    assert.deepEqual(sources(), liveUrls, "Restoration must bring back removed live photos in canonical order.");
    const restored = await saveAndCheck(live.length);
    assert.equal(restored.id, proposal.revision_id);
    assert.equal(restored.title, proposedTitle, "Photo restoration must retain the other pending title proposal.");
    assert.ok(!restored.changed_fields.includes("photos"));
    assert.equal(restored.listing_revision_photos.length, 0);
    assert.deepEqual(sources(), liveUrls);
    command("screenshot", path.join(output, "mobile-restored-success.png"));
    await edit(id, session, { moderated: { title: original.data.title } });
    assert.equal(await pending(id), null);
    console.log("PASS actual browser photo editor: JPEG add/WebP replace/reorder/remove; same combined proposal; focus+scroll success; remounted persisted state; admin private proposal bytes loaded; canonical live restoration; mobile menu/no overflow; no browser errors.");
    console.log(`Browser screenshots: ${output}`);
  } catch (error) {
    try {
      command("screenshot", path.join(output, "failure.png"), "--full");
      console.error(`Browser failure evidence: ${output}`);
      console.error(snapshot());
    } catch { /* The original failure still controls the gate if the browser itself exited. */ }
    throw error;
  } finally {
    // Track every object under this invocation's exact owner/listing fixture prefix,
    // including uncertain upload responses; the parent integration removes them.
    const prefix = `${session.user.id}/listing-edits/${id}`;
    const folders = await service.storage.from("listing-edit-photos").list(prefix, { limit: 1000 });
    assert.equal(folders.error, null);
    const seen = new Set(objects.map((object) => `${object.bucket}:${object.path}`));
    for (const folder of folders.data) {
      if (folder.id || !/^[0-9a-f-]{36}$/.test(folder.name)) continue;
      const entries = await service.storage.from("listing-edit-photos").list(`${prefix}/${folder.name}`, { limit: 1000 });
      assert.equal(entries.error, null);
      for (const entry of entries.data) {
        if (!entry.id) continue;
        const objectPath = `${prefix}/${folder.name}/${entry.name}`;
        if (!seen.has(`listing-edit-photos:${objectPath}`)) {
          objects.push({ bucket: "listing-edit-photos", path: objectPath });
          seen.add(`listing-edit-photos:${objectPath}`);
        }
      }
    }
    spawnSync(browser, ["--session", browserSession, "close"], { encoding: "utf8", timeout: 10000 });
    spawnSync(browser, ["--session", adminBrowserSession, "close"], { encoding: "utf8", timeout: 10000 });
    if (fs.existsSync(addition)) fs.unlinkSync(addition);
    if (fs.existsSync(replacement)) fs.unlinkSync(replacement);
  }
};
