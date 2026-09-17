const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(filename, overrides = {}, globals = {}, cache = new Map()) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = { exports: {} };
  const imports = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("./") || name.startsWith("../") || name.startsWith("@/")) {
      const base = name.startsWith("@/")
        ? path.resolve(name.slice(2))
        : path.resolve(path.dirname(filename), name);
      const local = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate));
      return loadTypeScript(local, overrides, globals, cache);
    }
    return require(name);
  };
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)(
    imports, mod, mod.exports, ...Object.values(globals),
  );
  cache.set(filename, mod.exports);
  return mod.exports;
}

function walk(element) {
  if (Array.isArray(element)) return element.flatMap(walk);
  if (!element || typeof element !== "object") return [];
  return [element, ...walk(element.props?.children)];
}

function response(body, ok = true) {
  return { ok, json: async () => body };
}

function file(name = "gear.jpg", type = "image/jpeg", size = 1024) {
  return { name, type, size, lastModified: 1700000000000 };
}

function existingPhotos(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `photo-${index}`,
    image_url: `https://images.example/gear-${index}.jpg`,
    alt_text: `Vista ${index}`,
    sort_order: index,
  }));
}

function editorHarness({ photos = existingPhotos(), livePhotos = photos, listing: changes = {}, hasPendingRevision = false, initialNotice = "", request, upload, returnHref = "/mi-cuenta/publicaciones" } = {}) {
  const listing = {
    id: "listing-qa", title: "Guitarra usada", status: "approved", category: "guitars",
    instrument_type: "electric_guitar", attributes: {}, brand: "Fender", model: "Stratocaster",
    condition: "Usado - bueno", price_pen: 1200, city: "Lima", region: "Lima",
    description: "Guitarra en buen estado, incluye todos los accesorios originales.",
    listing_photos: photos, ...changes,
  };
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let uuid = 0;
  const calls = { requests: [], uploads: [], buckets: [], removed: [], created: [], revoked: [], destinations: [], refreshes: 0 };
  const Image = () => null;
  const Link = () => null;
  const PageNotice = () => null;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (value) => { hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(create) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: create() };
      return hooks[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!(index in hooks) || dependencies.some((value, dependency) => !Object.is(value, hooks[index].dependencies[dependency]))) {
        hooks[index] = { dependencies };
        effects.push(() => { hooks[index].cleanup = effect(); });
      }
    },
  };
  const { ListingEditForm } = loadTypeScript("components/listing-edit-form.tsx", {
    react,
    "next/image": { __esModule: true, default: Image },
    "next/link": { __esModule: true, default: Link },
    "next/navigation": { useRouter: () => ({
      replace: (destination, options) => calls.destinations.push({ destination, options }),
      refresh: () => { calls.refreshes++; },
    }) },
    "@/components/page-notice": { PageNotice },
    "@/components/location-fields": { LocationFields: () => null },
    "@/lib/listings": { categoryOptions: [], conditionOptions: [] },
    "@/lib/supabase/browser-client": { getSupabaseBrowserClient: () => ({ storage: {
      from(bucket) {
        calls.buckets.push(bucket);
        return {
          async upload(objectPath, value, options) {
            const entry = { bucket, path: objectPath, file: value, options };
            calls.uploads.push(entry);
            return upload ? upload(entry, calls.uploads.length) : { error: null };
          },
          remove(paths) { calls.removed.push(paths); throw new Error("The browser must not remove stored photos."); },
        };
      },
    } }) },
  }, {
    FormData: class {
      constructor(values) { this.values = values; }
      get(name) { return this.values[name] ?? null; }
      getAll(name) { const value = this.values[name]; return Array.isArray(value) ? value : value == null ? [] : [value]; }
    },
    crypto: { randomUUID: () => `local-${++uuid}` },
    URL: {
      createObjectURL(value) { const url = `blob:preview-${calls.created.length}`; calls.created.push({ file: value, url }); return url; },
      revokeObjectURL(url) { calls.revoked.push(url); },
    },
    async fetch(url, options) {
      const entry = { url, method: options.method, body: JSON.parse(options.body) };
      calls.requests.push(entry);
      if (request) {
        const result = await request(entry, calls.requests.length);
        if (result !== undefined) return result;
      }
      if (url.endsWith("photo-cleanup")) return response({ ok: true, removed: entry.body.paths });
      if (entry.body.action === "start_edit") {
        const attempt = calls.requests.filter((entry) => entry.body.action === "start_edit").length;
        return response({ token: `signed-${attempt}`, attemptId: `attempt-${attempt}`, folder: `owner/listing/attempt-${attempt}`, bucket: "listing-edit-photos" });
      }
      return response({ result: { mode: "revision_amended" } });
    },
  });
  function render() {
    cursor = 0;
    effects = [];
    const element = ListingEditForm({ listing, hasPendingRevision, isVerifiedStore: false, returnHref, livePhotos, initialNotice });
    for (const effect of effects) effect();
    return element;
  }
  function elements() { return walk(render()); }
  function control(label) {
    const found = elements().find((element) => element.props?.["aria-label"] === label || (element.type === "button" && element.props.children === label));
    assert.ok(found, `Missing editor control: ${label}`);
    return found;
  }
  function values(overrides) {
    return {
      title: listing.title, brand: listing.brand, model: listing.model, condition: listing.condition,
      price_pen: String(listing.price_pen), city: listing.city, region: listing.region,
      description: listing.description, ...overrides,
    };
  }
  return {
    calls, listing, render, elements, control,
    images: () => elements().filter((element) => element.type === Image),
    notice: () => elements().find((element) => element.type === PageNotice),
    add(files) {
      const input = elements().find((element) => element.type === "input" && element.props.multiple);
      const target = { files, value: "selected files" };
      input.props.onChange({ target });
      return target;
    },
    replace(index, value) { control(`Reemplazar foto ${index + 1}`).props.onChange({ target: { files: [value], value: "selected file" } }); },
    move(index, direction) { control(`Mover foto ${index + 1} ${direction === -1 ? "antes" : "después"}`).props.onClick(); },
    remove(index) { control(`Quitar foto ${index + 1}`).props.onClick(); },
    submit(overrides = {}) { return render().props.onSubmit({ preventDefault() {}, currentTarget: values(overrides) }); },
    unmount() { for (const hook of hooks) hook.cleanup?.(); },
  };
}

test("photo editor sorts persisted proposal photos without mutating its input or losing alt text", async () => {
  const photos = existingPhotos(3).reverse();
  const form = editorHarness({ photos });
  assert.deepEqual(form.images().map((image) => image.props.src), existingPhotos(3).map((photo) => photo.image_url));
  assert.equal(photos[0].id, "photo-2");
  form.move(0, 1);
  await form.submit();
  const edit = form.calls.requests.find((request) => request.body.action === "edit");
  assert.deepEqual(edit.body.photos.map((photo) => photo.alt_text), ["Vista 1", "Vista 0", "Vista 2"]);
  assert.equal(form.calls.uploads.length, 0);
});

test("photo editor adds supported files up to ten and rejects invalid, empty, oversized or eleventh files", () => {
  const form = editorHarness();
  for (const invalid of [file("gear.gif", "image/gif"), file("empty.png", "image/png", 0), file("large.jpg", "image/jpeg", 5 * 1024 * 1024 + 1)]) {
    assert.equal(form.add([invalid]).value, "");
    assert.equal(form.images().length, 2);
    assert.equal(form.notice().props.kind, "error");
  }
  const accepted = [file(), file("gear.png", "image/png"), file("gear.webp", "image/webp"), ...Array.from({ length: 5 }, (_, index) => file(`${index}.jpg`))];
  form.add(accepted);
  assert.equal(form.images().length, 10);
  assert.equal(form.calls.created.length, 8);
  form.add([file("extra.jpg")]);
  assert.equal(form.images().length, 10);
  assert.match(form.notice().props.message, /hasta 10/);
  assert.equal(form.calls.created.length, 8);
});

test("photo editor replacement and removal revoke only local previews and retain two-photo minimum", () => {
  const form = editorHarness();
  form.remove(0);
  assert.equal(form.images().length, 2);
  assert.match(form.notice().props.message, /al menos 2/);
  form.replace(0, file("first.png", "image/png"));
  assert.equal(form.images().length, 2);
  form.replace(0, file("bad.gif", "image/gif"));
  assert.equal(form.images()[0].props.src, "blob:preview-0");
  form.replace(0, file("second.webp", "image/webp"));
  assert.deepEqual(form.calls.revoked, ["blob:preview-0"]);
  form.add([file("third.jpg")]);
  form.remove(2);
  assert.equal(form.images().length, 2);
  assert.deepEqual(form.calls.revoked, ["blob:preview-0", "blob:preview-2"]);
  form.unmount();
  assert.deepEqual(form.calls.revoked, ["blob:preview-0", "blob:preview-2", "blob:preview-1"]);
  assert.deepEqual(form.calls.removed, []);
});

test("photo editor reordering moves the principal and ignores list boundaries", async () => {
  const form = editorHarness();
  form.move(0, -1);
  form.move(1, 1);
  assert.deepEqual(form.images().map((image) => image.props.src), existingPhotos().map((photo) => photo.image_url));
  form.move(1, -1);
  assert.equal(form.images()[0].props.src, existingPhotos()[1].image_url);
  await form.submit();
  assert.equal(form.calls.requests.find((request) => request.body.action === "edit").body.photos[0].image_url, existingPhotos()[1].image_url);
});

test("synchronous busy guard blocks stale mutation handlers and duplicate saves before React rerenders", async () => {
  let release;
  const started = new Promise((resolve) => { release = resolve; });
  const form = editorHarness({ request: async (entry) => entry.body.action === "start_edit" ? started : undefined });
  form.add([file()]);
  const staleAdd = form.elements().find((element) => element.type === "input" && element.props.multiple).props.onChange;
  const staleReplace = form.control("Reemplazar foto 1").props.onChange;
  const staleRemove = form.control("Quitar foto 1").props.onClick;
  const staleMove = form.control("Mover foto 1 después").props.onClick;
  const saving = form.submit();
  staleAdd({ target: { files: [file("extra.jpg")], value: "selected" } });
  staleReplace({ target: { files: [file("replacement.jpg")], value: "selected" } });
  staleRemove();
  staleMove();
  await form.submit();
  assert.equal(form.calls.requests.length, 1);
  assert.equal(form.calls.created.length, 1);
  assert.equal(form.images().length, 3);
  assert.equal(form.images()[0].props.src, existingPhotos()[0].image_url);
  assert.equal(form.render().props["aria-busy"], true);
  assert.ok(form.elements().some((element) => element.type === "fieldset" && element.props.disabled));
  release(response({ token: "signed-1", attemptId: "attempt-1", folder: "owner/listing/attempt-1", bucket: "listing-edit-photos" }));
  await saving;
  assert.equal(form.calls.uploads.length, 1);
  assert.equal(form.render().props["aria-busy"], false);
});

test("restoring live photos retains the pending proposal's other moderated fields", async () => {
  const proposal = existingPhotos().map((photo) => ({ ...photo, image_url: `/api/listing-images/proposal-${photo.id}` }));
  const form = editorHarness({ photos: proposal, livePhotos: existingPhotos(), hasPendingRevision: true, listing: { title: "Título pendiente", brand: "Marca pendiente" } });
  form.add([file()]);
  form.control("Restaurar fotos aprobadas").props.onClick();
  assert.deepEqual(form.images().map((image) => image.props.src), existingPhotos().map((photo) => photo.image_url));
  assert.deepEqual(form.calls.revoked, ["blob:preview-0"]);
  await form.submit();
  const edit = form.calls.requests.find((entry) => entry.body.action === "edit");
  assert.deepEqual(edit.body.moderated, {});
  assert.deepEqual(edit.body.immediate, {});
  assert.deepEqual(edit.body.photos.map((photo) => photo.image_url), existingPhotos().map((photo) => photo.image_url));
  assert.equal(form.listing.title, "Título pendiente");
  assert.equal(form.listing.brand, "Marca pendiente");
});

test("photo edits use signed start_edit capabilities and private bucket paths without upsert", async () => {
  const form = editorHarness();
  const png = file("gear.png", "image/png");
  const webp = file("gear.webp", "image/webp");
  form.replace(0, png);
  form.replace(1, webp);
  await form.submit({ title: "Título revisado" });
  assert.deepEqual(form.calls.requests[0].body, { action: "start_edit" });
  assert.equal(form.calls.requests[0].url, "/api/listings/listing-qa/manage");
  assert.deepEqual(form.calls.uploads, [
    { bucket: "listing-edit-photos", path: "owner/listing/attempt-1/0.png", file: png, options: { contentType: "image/png", upsert: false } },
    { bucket: "listing-edit-photos", path: "owner/listing/attempt-1/1.webp", file: webp, options: { contentType: "image/webp", upsert: false } },
  ]);
  const edit = form.calls.requests[1].body;
  assert.equal(edit.token, "signed-1");
  assert.deepEqual(edit.moderated, { title: "Título revisado" });
  assert.deepEqual(edit.photos, [{ path: "owner/listing/attempt-1/0.png", alt_text: "Foto de Título revisado" }, { path: "owner/listing/attempt-1/1.webp", alt_text: "Foto de Título revisado" }]);
  assert.deepEqual(form.calls.removed, []);
});

test("uncertain finalization retries the exact token and payload without reupload or unsafe cleanup", async () => {
  let edits = 0;
  const form = editorHarness({ request(entry) {
    if (entry.body.action === "edit" && ++edits === 1) throw new Error("Connection closed after commit");
  } });
  form.replace(0, file());
  await form.submit({ title: "Título propuesto" });
  assert.equal(form.notice().props.kind, "error");
  assert.equal(form.calls.uploads.length, 1);
  await form.submit({ title: "Título propuesto" });
  const saves = form.calls.requests.filter((entry) => entry.body.action === "edit");
  assert.equal(saves.length, 2);
  assert.deepEqual(saves[1], saves[0]);
  assert.equal(form.calls.requests.filter((entry) => entry.body.action === "start_edit").length, 1);
  assert.equal(form.calls.requests.filter((entry) => entry.url.endsWith("photo-cleanup")).length, 0);
  assert.equal(form.calls.uploads.length, 1);
  assert.deepEqual(form.calls.removed, []);
  assert.equal(form.notice().props.kind, "success");
});

test("changing an uncertain retry requests trusted reference-checked cleanup before a fresh capability", async () => {
  let edits = 0;
  const form = editorHarness({ request(entry) {
    if (entry.body.action === "edit" && ++edits === 1) throw new Error("Uncertain response");
  } });
  form.replace(0, file());
  await form.submit({ title: "Propuesta inicial" });
  form.replace(0, file("replacement.webp", "image/webp"));
  await form.submit({ title: "Propuesta corregida" });
  assert.deepEqual(form.calls.requests.map((entry) => entry.body.action ?? "photo-cleanup"), ["start_edit", "edit", "photo-cleanup", "start_edit", "edit"]);
  assert.deepEqual(form.calls.requests[2].body, { paths: ["owner/listing/attempt-1/0.jpg"], bucket: "listing-edit-photos" });
  assert.equal(form.calls.requests[4].body.token, "signed-2");
  assert.equal(form.calls.uploads[1].path, "owner/listing/attempt-2/0.webp");
  assert.deepEqual(form.calls.removed, []);
});

test("partial uploads clean both successful and uncertain paths before finalization and remain retryable", async () => {
  let fail = true;
  const form = editorHarness({ upload: (_entry, number) => ({ error: fail && number === 2 ? new Error("Upload connection lost") : null }) });
  form.replace(0, file("front.jpg"));
  form.replace(1, file("back.jpg"));
  await form.submit();
  assert.equal(form.calls.requests.filter((entry) => entry.body.action === "edit").length, 0);
  assert.deepEqual(form.calls.requests[1].body, { paths: ["owner/listing/attempt-1/0.jpg", "owner/listing/attempt-1/1.jpg"], bucket: "listing-edit-photos" });
  assert.equal(form.notice().props.kind, "error");
  fail = false;
  await form.submit();
  assert.equal(form.calls.requests.filter((entry) => entry.body.action === "start_edit").length, 2);
  assert.equal(form.calls.requests.find((entry) => entry.body.action === "edit").body.token, "signed-2");
  assert.deepEqual(form.calls.removed, []);
});

test("cleanup failure stops changed retries before any fresh uploads or capability", async () => {
  const form = editorHarness({ request(entry) {
    if (entry.body.action === "edit") throw new Error("Uncertain response");
    if (entry.url.endsWith("photo-cleanup")) return response({ ok: false }, false);
  } });
  form.replace(0, file());
  await form.submit();
  form.replace(0, file("new.jpg"));
  await form.submit();
  assert.equal(form.calls.uploads.length, 1);
  assert.equal(form.calls.requests.filter((entry) => entry.body.action === "start_edit").length, 1);
  assert.match(form.notice().props.message, /limpieza segura/);
  assert.deepEqual(form.calls.removed, []);
});

test("success retains shared accessible notice and links to the real account return destination", async () => {
  const returnHref = "/mi-cuenta/inventario";
  const form = editorHarness({ returnHref });
  form.move(0, 1);
  await form.submit();
  const notice = form.notice();
  assert.equal(notice.props.kind, "success");
  assert.equal(notice.props.children.props.href, returnHref);
  assert.deepEqual(form.calls.destinations, [{ destination: "/mi-cuenta/publicaciones/listing-qa/editar?guardado=revision_amended", options: { scroll: false } }]);
  assert.equal(form.calls.refreshes, 1);
});

test("private proposed and local previews bypass the public optimizer while persisted public images remain responsive", () => {
  const photos = existingPhotos();
  photos[1].image_url = "/api/listing-images/private-qa.jpg";
  const form = editorHarness({ photos });
  form.add([file()]);
  const images = form.images();
  assert.deepEqual(images.map((image) => image.props.unoptimized), [false, true, true]);
  for (const image of images) {
    assert.equal(image.props.fill, true);
    assert.equal(image.props.sizes, "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw");
    assert.match(image.props.alt, /^Foto \d$/);
  }
});

test("shared PageNotice moves accessible focus and scrolls new success and actionable errors into view", () => {
  for (const kind of ["success", "error"]) {
    const calls = [];
    const ref = { current: { focus: (options) => calls.push(["focus", options]), scrollIntoView: (options) => calls.push(["scroll", options]) } };
    let effect;
    const { PageNotice } = loadTypeScript("components/page-notice.tsx", { react: { useRef: () => ref, useEffect: (callback) => { effect = callback; } } });
    const notice = PageNotice({ kind, message: "Resultado de la operación" });
    effect();
    assert.equal(notice.props.tabIndex, -1);
    assert.equal(notice.props.role, kind === "error" ? "alert" : "status");
    assert.deepEqual(calls, [["focus", { preventScroll: true }], ["scroll", { behavior: "smooth", block: "center" }]]);
  }
});
