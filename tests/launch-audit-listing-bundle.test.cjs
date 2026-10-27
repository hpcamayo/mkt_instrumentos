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

// next/dynamic stand-in: records what each lazy part loads and with which options, and renders a marker.
function lazyStandIn(calls) {
  return {
    __esModule: true,
    default: (loader, options) => {
      const target = /import\("([^"]+)"\)/.exec(String(loader))?.[1] ?? /require\("([^"]+)"\)/.exec(String(loader))?.[1];
      calls.push({ target, options });
      return (props) => React.createElement("i", { "data-lazy": target, "data-listing": props.listingId });
    },
  };
}

test("A29: '¿Cómo te fue?' and its Supabase client load only for a signed-in visitor", () => {
  const calls = [];
  const render = (account) => {
    const { PurchaseCheckin } = load("components/purchase-checkin.tsx", {
      "next/dynamic": lazyStandIn(calls),
      "@/components/marketplace-account-provider": { useMarketplaceAccount: () => account },
    });
    return renderToStaticMarkup(React.createElement(PurchaseCheckin, { listingId: "l1" }));
  };
  // Hydrating (the server's state), still checking, signed out: nothing, so nothing loads.
  assert.equal(render({ settled: false, ready: false, authenticated: false }), "");
  assert.equal(render({ settled: false, ready: false, authenticated: true }), "");
  assert.equal(render({ settled: true, ready: true, authenticated: false }), "");
  // Signed in, also while the account is checked again on focus (ready false, settled and authenticated kept).
  assert.equal(render({ settled: true, ready: true, authenticated: true }), '<i data-lazy="@/components/purchase-checkin-question" data-listing="l1"></i>');
  assert.equal(render({ settled: true, ready: false, authenticated: true }), '<i data-lazy="@/components/purchase-checkin-question" data-listing="l1"></i>');
  assert.ok(calls.every((call) => call.target === "@/components/purchase-checkin-question" && call.options.ssr === false));
  // The question itself is big-08's, unchanged.
  const question = source("components/purchase-checkin-question.tsx");
  assert.match(question, /export default function PurchaseCheckinQuestion/);
  assert.match(question, /getSupabaseBrowserClient/);
});

test("A29: the lightbox loads on demand, starting when a pointer or the focus reaches the photos", () => {
  const calls = [];
  const lazy = load("components/listing/listing-lazy.tsx", { "next/dynamic": lazyStandIn(calls) });
  assert.deepEqual(calls.map((call) => [call.target, call.options.ssr]), [
    ["@/components/listing/lightbox", false],
    ["@/components/listing/listing-questions", false],
  ]);
  assert.equal(typeof lazy.preloadLightbox, "function");
  assert.match(source("components/listing/listing-lazy.tsx"), /export function preloadLightbox\(\) \{\s*void import\("@\/components\/listing\/lightbox"\);/);
  assert.match(source("components/listing/listing-gallery.tsx"), /<div className="grid gap-3" onPointerEnter=\{preloadLightbox\} onFocus=\{preloadLightbox\}>/);
  assert.match(source("components/store/store-photos.tsx"), /<ul className="flex flex-wrap gap-2" onPointerEnter=\{preloadLightbox\} onFocus=\{preloadLightbox\}>/);
});

test("A29: the questions section's code loads after the page, and the server still sends its heading and loading line", () => {
  const without = (props, ...keys) => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));
  const { ListingQuestions } = load("components/listing/listing-questions.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", without(props, "prefetch"), children) },
    "@/components/marketplace-account-provider": { useMarketplaceAccount: () => ({ ready: false, authenticated: false, admin: false }) },
    "@/components/content-report": { ContentReport: () => null },
  });
  const calls = [];
  const { QuestionsLoading } = load("components/listing/listing-lazy.tsx", { "next/dynamic": lazyStandIn(calls) });
  // The section's own first render (before the account check) and the stand-in the server now sends are the same
  // markup; only useId's values may differ.
  const ids = (html) => html.replace(/(id|aria-labelledby)="(?!preguntas")[^"]+"/g, '$1="x"');
  const own = ids(renderToStaticMarkup(React.createElement(ListingQuestions, { listingId: "l1", sold: false, loginHref: "/login" })));
  assert.equal(ids(renderToStaticMarkup(React.createElement(QuestionsLoading))), own);
  assert.match(own, /^<section id="preguntas"[^>]*><h2[^>]*>Preguntas<\/h2><p role="status"[^>]*>Cargando preguntas…<\/p><\/section>$/);
  assert.equal(calls.find((call) => call.target === "@/components/listing/listing-questions").options.loading().type, QuestionsLoading);
  assert.match(source("app/instrumentos/[slug]/page.tsx"), /import \{ ListingQuestions \} from "@\/components\/listing\/listing-lazy";/);
});
