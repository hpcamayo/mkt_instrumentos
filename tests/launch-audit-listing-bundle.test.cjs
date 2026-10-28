// Launch audit A29: the listing page's first load. Phones arrive on it from WhatsApp and Google, and it shipped the
// Supabase browser client (supabase-js and its Auth, about 60 kB compressed) for big-08's "¿Cómo te fue?", which only a
// signed-in buyer can see, plus the photo lightbox and the questions section before anyone used them. These load after
// the page now. The build's sizes are in docs/performance.md.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// What Next.js puts in a page's browser bundle: every client component the page renders ("use client") and everything
// those import, statically. Imports inside import() and type-only imports are left out, as the bundler leaves them out.
function resolveImport(from, specifier) {
  const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function staticImports(file) {
  const text = fs.readFileSync(file, "utf8");
  const specifiers = [];
  for (const match of text.matchAll(/^(?:import|export)\s+(?!type\s)(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["'];?/gm)) specifiers.push(match[1]);
  return specifiers;
}

function browserModules(entry) {
  const seen = new Set();
  const browser = new Set();
  const packages = new Map();
  const visit = (file, client) => {
    const isClient = client || /^["']use client["'];?/.test(fs.readFileSync(file, "utf8").trimStart());
    const key = `${file}:${isClient}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (isClient) browser.add(path.relative(root, file));
    for (const specifier of staticImports(file)) {
      const target = resolveImport(file, specifier);
      if (target) visit(target, isClient);
      else if (isClient) packages.set(specifier, path.relative(root, file));
    }
  };
  visit(path.join(root, entry), false);
  return { browser, packages };
}

test("A29: the listing page's browser bundle has no Supabase client, lightbox or questions section", () => {
  const { browser, packages } = browserModules("app/instrumentos/[slug]/page.tsx");
  // The walk reaches the page's client components (a sanity check that it follows imports at all).
  for (const file of ["components/purchase-checkin.tsx", "components/listing/listing-gallery.tsx", "components/listing/listing-lazy.tsx", "components/whatsapp-contact-link.tsx"]) {
    assert.ok(browser.has(file), `${file} is in the bundle`);
  }
  for (const file of ["lib/supabase/browser-client.ts", "components/purchase-checkin-question.tsx", "components/listing/lightbox.tsx", "components/listing/listing-questions.tsx"]) {
    assert.ok(!browser.has(file), `${file} must load after the page`);
  }
  for (const name of ["@supabase/ssr", "@supabase/supabase-js"]) {
    assert.ok(!packages.has(name), `${name} is imported by ${packages.get(name)}`);
  }
});

test("A29: the store page loads the lightbox on demand too", () => {
  const { browser } = browserModules("app/tiendas/[slug]/page.tsx");
  assert.ok(browser.has("components/store/store-photos.tsx"));
  assert.ok(!browser.has("components/listing/lightbox.tsx"));
});

// Loads a module with some imports replaced, like tests/ux-listing.test.cjs.
function load(file, mocks) {
  const resolved = path.join(root, file);
  const mod = new Module(resolved, module);
  mod.filename = resolved;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  mod._compile(compiled, resolved);
  return mod.exports;
}

// afterPage stand-in: records what each part loads and its loading and failed parts, and renders a marker.
function afterPageStandIn(calls) {
  return {
    afterPage: (loader, parts) => {
      const target = /import\("([^"]+)"\)/.exec(String(loader))?.[1] ?? /require\("([^"]+)"\)/.exec(String(loader))?.[1];
      calls.push({ target, parts });
      return (props) => React.createElement("i", { "data-lazy": target, "data-listing": props.listingId });
    },
  };
}

test("A29: '¿Cómo te fue?' and its Supabase client load for a visitor with an auth cookie or found signed in, waiting for neither", () => {
  const calls = [];
  // In the browser, useSyncExternalStore reads the snapshot (the cookie); on the server and while hydrating, the server
  // snapshot (none).
  const browserReact = { ...React, useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot() };
  const render = (cookies, account) => {
    const { PurchaseCheckin } = load("components/purchase-checkin.tsx", {
      ...(cookies === null ? {} : { react: browserReact }),
      "@/components/after-page": afterPageStandIn(calls),
      "@/components/marketplace-account-provider": { useMarketplaceAccount: () => account },
    });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
      if (cookies !== null) globalThis.document = { cookie: cookies };
      return renderToStaticMarkup(React.createElement(PurchaseCheckin, { listingId: "l1" }));
    } finally {
      delete globalThis.document;
      if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    }
  };
  const asked = '<i data-lazy="@/components/purchase-checkin-question" data-listing="l1"></i>';
  const signedIn = "laria_device=1; sb-abc-auth-token.0=base64-x; sb-abc-auth-token.1=y";
  // Hydrating (the server's state, even with the cookie), or no cookie and not signed in: nothing, so nothing loads.
  assert.equal(render(null, { settled: false, ready: false, authenticated: false }), "");
  assert.equal(render("laria_device=1", { settled: true, ready: true, authenticated: false }), "");
  assert.equal(render("sb-abc-auth-token-code-verifier=z", { settled: true, ready: true, authenticated: false }), "");
  // Another project's cookie on the site (an earlier Supabase URL) isn't this project's session.
  assert.equal(render("sb-old-auth-token=x; sb-abc-auth-token.x=y", { settled: true, ready: true, authenticated: false }), "");
  // Codex's first review: an account check that failed, or that is still merging the device's favorites (settled
  // false), no longer hides the question from a visitor with the cookie, as before A29.
  assert.equal(render(signedIn, { settled: true, ready: false, authenticated: false }), asked);
  assert.equal(render(signedIn, { settled: false, ready: false, authenticated: false }), asked);
  assert.equal(render("", { settled: false, ready: true, authenticated: true }), asked);
  // Signed in, also while the account is checked again on focus (ready false, authenticated kept).
  assert.equal(render("", { settled: true, ready: false, authenticated: true }), asked);
  assert.ok(calls.every((call) => call.target === "@/components/purchase-checkin-question"));
  // If its code fails to download, the question just isn't asked; nothing shows while it loads.
  assert.equal(calls[0].parts.loading(), null);
  assert.equal(calls[0].parts.failed(() => {}, { listingId: "l1" }), null);
  // The cookie is read again when the tab regains focus; the store page's server check is the same one.
  assert.match(source("components/purchase-checkin.tsx"), /useSyncExternalStore\(subscribe, browserHasAuthCookie, \(\) => false\)/);
  assert.match(source("components/purchase-checkin.tsx"), /window\.addEventListener\("focus", onChange\)/);
  assert.match(source("lib/store-storefront.ts"), /export \{ hasSupabaseAuthCookie \} from "@\/lib\/supabase\/auth-cookie";/);
  // The question itself is big-08's, unchanged.
  const question = source("components/purchase-checkin-question.tsx");
  assert.match(question, /export default function PurchaseCheckinQuestion/);
  assert.match(question, /getSupabaseBrowserClient/);
});

test("A29: a part loaded after the page shows its loading part on the server, and only itself fails, with a retry", async () => {
  const { afterPage } = load("components/after-page.tsx", {});
  const loads = [];
  const Part = afterPage(
    () => {
      loads.push("load");
      return Promise.resolve(() => React.createElement("b", null, "part"));
    },
    { loading: () => React.createElement("p", null, "loading"), failed: () => React.createElement("p", null, "failed") },
  );
  // The server (and hydration) render the loading part and download nothing.
  assert.equal(renderToStaticMarkup(React.createElement(Part, { id: "x" })), "<p>loading</p>");
  assert.deepEqual(loads, []);

  // In the browser: hooks run by hand, so the tree the part returns can be read.
  const lazies = [];
  const state = { attempt: 0, sets: 0 };
  const browserReact = {
    ...React,
    lazy: (factory) => {
      const type = () => null;
      lazies.push({ factory, type });
      return type;
    },
    // The attempt; an initializer (where the focus was when the part was asked for) is read as React reads it on mount.
    useState: (initial) =>
      typeof initial === "function" ? [initial()] : [state.attempt, (update) => { state.sets += 1; state.attempt = update(state.attempt); }],
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  };
  const reports = [];
  const browser = load("components/after-page.tsx", {
    react: browserReact,
    "@/lib/monitoring/client-errors": { reportClientError: (...report) => reports.push(report) },
  });
  let retry = null;
  const failedFor = [];
  const focusFor = [];
  // The first download fails, the second works.
  const downloads = [Promise.reject(new Error("Loading chunk 123 failed.")), Promise.resolve(() => null)];
  downloads[0].catch(() => {});
  const Lazy = browser.afterPage(() => downloads.shift(), {
    loading: () => "loading",
    failed: (again, props, focus) => {
      retry = again;
      failedFor.push(props);
      focusFor.push(focus);
      return "failed";
    },
  });
  assert.equal(lazies.length, 1, "one lazy part, made once and shared");
  // A page with a photo that has the focus when the part is asked for, a question field and the body.
  class FakeElement {
    constructor() {
      this.isConnected = true;
      this.focusedWith = [];
    }
    focus(options) {
      this.focusedWith.push(options);
      globalThis.document.activeElement = this;
    }
  }
  const [photo, question, body] = [new FakeElement(), new FakeElement(), new FakeElement()];
  const onPage = (run) => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    globalThis.HTMLElement = FakeElement;
    globalThis.document = { body, activeElement: photo };
    try {
      return run();
    } finally {
      for (const name of ["HTMLElement", "document"]) {
        if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
        else delete globalThis[name];
      }
    }
  };
  const tree = onPage(() => Lazy({ id: "x" }));
  const Boundary = tree.type;
  assert.equal(tree.key, "0");
  const suspense = tree.props.children;
  assert.equal(suspense.type, React.Suspense);
  assert.equal(suspense.props.fallback, "loading");
  assert.equal(suspense.props.children.type, lazies[0].type);
  assert.deepEqual(suspense.props.children.props, { id: "x" });

  // The download fails: the lazy part rejects (React shows it to the boundary), and a new one is ready for the next
  // try, since React keeps a failed lazy part's error.
  await assert.rejects(lazies[0].factory(), /Loading chunk 123 failed/);
  assert.equal(lazies.length, 2);

  // The boundary: its children until they throw, then `failed`, with the part's props.
  const boundary = new Boundary({ failed: tree.props.failed, children: "children" });
  assert.equal(boundary.render(), "children");
  const chunkError = new Error("Loading chunk 123 failed.");
  boundary.state = { ...boundary.state, ...Boundary.getDerivedStateFromError(chunkError) };
  assert.equal(boundary.render(), "failed");
  assert.deepEqual(failedFor, [{ id: "x" }]);
  // What it caught is counted in Admin > Errores, like the pages' error boundaries.
  boundary.componentDidCatch(chunkError);
  assert.deepEqual(reports, [["boundary", chunkError]]);

  // The focus is free while it stays where it was when the part was asked for, or nowhere in particular; not once the
  // visitor took it elsewhere. `restore` puts it back on that element, while it is still on the page.
  const [focus] = focusFor;
  onPage(() => {
    assert.equal(focus.free(), true);
    globalThis.document.activeElement = body;
    assert.equal(focus.free(), true);
    globalThis.document.activeElement = null;
    assert.equal(focus.free(), true);
    globalThis.document.activeElement = question;
    assert.equal(focus.free(), false, "the visitor moved on to type a question");
    focus.restore();
    assert.equal(globalThis.document.activeElement, photo);
    assert.deepEqual(photo.focusedWith, [{ preventScroll: true }]);
    photo.isConnected = false;
    globalThis.document.activeElement = question;
    focus.restore();
    assert.equal(globalThis.document.activeElement, question, "a photo no longer on the page isn't focused");
  });

  // Retry, or the part's next showing: a new boundary (its key) around the new lazy part, which downloads again.
  retry();
  assert.equal(state.sets, 1);
  const again = Lazy({ id: "x" });
  assert.equal(again.key, "1");
  assert.equal(again.props.children.props.children.type, lazies[1].type);
  const loaded = await lazies[1].factory();
  assert.equal(typeof loaded.default, "function");
  assert.equal(lazies.length, 2, "a download that worked is kept");
});

test("A29: the lightbox loads on demand, starting when a pointer or the focus reaches the photos, and a failed download only says so", () => {
  const calls = [];
  const lazy = load("components/listing/listing-lazy.tsx", { "@/components/after-page": afterPageStandIn(calls) });
  assert.deepEqual(calls.map((call) => call.target), ["@/components/listing/lightbox", "@/components/listing/listing-questions"]);
  assert.equal(typeof lazy.preloadLightbox, "function");
  assert.match(source("components/listing/listing-lazy.tsx"), /export function preloadLightbox\(\) \{\s*import\("@\/components\/listing\/lightbox"\)\.catch\(\(\) => \{\}\);/);
  assert.match(source("components/listing/listing-gallery.tsx"), /<div className="grid gap-3" onPointerEnter=\{preloadLightbox\} onFocus=\{preloadLightbox\}>/);
  assert.match(source("components/store/store-photos.tsx"), /<ul className="flex flex-wrap gap-2" onPointerEnter=\{preloadLightbox\} onFocus=\{preloadLightbox\}>/);
  // Each press of a photo opens the lightbox anew (a new key), so one whose code failed to download tries again at the
  // photo pressed, instead of the failed note staying with nothing opened.
  for (const file of ["components/listing/listing-gallery.tsx", "components/store/store-photos.tsx"]) {
    assert.match(source(file), /set(?:LightboxAt|OpenAt)\(index\);\s*setOpened\(\(count\) => count \+ 1\);/, file);
    assert.match(source(file), /<Lightbox\s+key=\{opened\}/, file);
  }
  // While it loads, "Abriendo la foto…", shown only past 200 ms; if it fails, a note over the page with "Reintentar",
  // which takes the focus unless the visitor moved it elsewhere meanwhile, and "Cerrar", which closes it as the lightbox
  // would, at the photo it opened on, as Escape does.
  const lightbox = calls[0].parts;
  assert.match(renderToStaticMarkup(lightbox.loading()), /^<p role="status" class="wait-note [^"]*">Abriendo la foto…<\/p>$/);
  assert.match(source("app/globals.css"), /\.wait-note \{\s*animation: menu-fade 120ms ease-out 200ms both;\s*\}/);
  const steps = [];
  const closed = [];
  const focus = (free) => ({ free: () => free, restore: () => steps.push("focus back on the photo") });
  const props = { start: 2, onClose: (index) => closed.push(index) };
  const failed = lightbox.failed(() => steps.push("retry"), props, focus(true));
  const html = renderToStaticMarkup(failed);
  assert.match(html, /^<div role="alert"[^>]*><p[^>]*>No pudimos abrir la foto\.<\/p><button[^>]*>Reintentar<\/button><button[^>]*>Cerrar<\/button><\/div>$/);
  failed.props.close();
  assert.deepEqual(closed, [2]);
  const note = failed.type(failed.props);
  const again = note.props.children[1];
  assert.equal(again.props.autoFocus, true, "Reintentar takes the focus");
  // Reintentar gives the focus back to the photo first, so it doesn't fall to the page while the code downloads again.
  again.props.onClick();
  assert.deepEqual(steps, ["focus back on the photo", "retry"]);
  note.props.onKeyDown({ key: "Enter" });
  note.props.onKeyDown({ key: "Escape" });
  assert.deepEqual(closed, [2, 2], "Escape closes the note; other keys don't");
  const elsewhere = lightbox.failed(() => {}, props, focus(false));
  assert.equal(elsewhere.type(elsewhere.props).props.children[1].props.autoFocus, false, "the focus stays where the visitor took it");
});

test("A29: the questions section's code loads after the page, and the server still sends its heading and loading line", () => {
  const without = (props, ...keys) => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));
  const { ListingQuestions } = load("components/listing/listing-questions.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch"), children) },
    "@/components/marketplace-account-provider": { useMarketplaceAccount: () => ({ ready: false, authenticated: false, admin: false }) },
    "@/components/content-report": { ContentReport: () => null },
  });
  const calls = [];
  const { QuestionsLoading, QuestionsFailed } = load("components/listing/listing-lazy.tsx", { "@/components/after-page": afterPageStandIn(calls) });
  // The section's own first render (before the account check) and the stand-in the server now sends are the same
  // markup; only useId's values may differ.
  const ids = (html) => html.replace(/(id|aria-labelledby)="(?!preguntas")[^"]+"/g, '$1="x"');
  const own = ids(renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: "l1", sold: false, loginHref: "/login" })));
  assert.equal(ids(renderToStaticMarkup(React.createElement(QuestionsLoading))), own);
  assert.match(own, /^<section id="preguntas"[^>]*><h2[^>]*>Preguntas<\/h2><p role="status"[^>]*>Cargando preguntas…<\/p><\/section>$/);
  const questions = calls.find((call) => call.target === "@/components/listing/listing-questions").parts;
  assert.equal(questions.loading().type, QuestionsLoading);
  // A failed download keeps the section and its anchor, says so and offers "Reintentar", instead of app/error.tsx
  // replacing the listing (Codex's first review).
  const failed = questions.failed(() => {});
  assert.equal(failed.type, QuestionsFailed);
  assert.match(
    renderToStaticMarkup(failed),
    /^<section id="preguntas"[^>]*><h2[^>]*>Preguntas<\/h2><div[^>]*><p role="alert"[^>]*>No pudimos cargar las preguntas\.<\/p><button type="button"[^>]*>Reintentar<\/button><\/div><\/section>$/,
  );
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /import \{ ListingQuestions \} from "@\/components\/listing\/listing-lazy";/);
});
