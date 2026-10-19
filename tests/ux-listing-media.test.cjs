// Effortless Laria, listing media (docs/ux-effortless/listing.md): zoom in the photo lightbox (list-01), "Compartir"
// with its fallback menu (list-08) and the share images for link previews and WhatsApp Status (list-09).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const zoom = require("@/lib/photo-zoom.ts");

const stage = { width: 400, height: 300 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("list-01: the scale stays between 1x and 4x", () => {
  assert.equal(zoom.clampScale(0.5), 1);
  assert.equal(zoom.clampScale(9), zoom.MAX_ZOOM);
  assert.equal(zoom.MAX_ZOOM, 4);
  assert.equal(zoom.clampScale(Number.NaN), 1);
  assert.equal(zoom.wheelScale(4, -500), 4);
  assert.ok(zoom.wheelScale(1, -100) > 1);
  assert.ok(zoom.wheelScale(2, 100) < 2);
  // A trackpad pinch (ctrlKey) moves faster per pixel than a wheel notch.
  assert.ok(zoom.wheelScale(1, -10, true) > zoom.wheelScale(1, -10));
});

test("list-01: a zoom keeps the point under the finger where it is", () => {
  const at = { x: 100, y: -50 };
  const next = zoom.zoomAt(zoom.IDENTITY, 2, at, stage);
  assert.equal(next.scale, 2);
  // The photo point under `at` before the zoom (at itself at 1x) is still under it: x + scale * q = at.
  near(next.x + 2 * at.x, at.x);
  near(next.y + 2 * at.y, at.y);
  // Back to 1x is always centred.
  assert.deepEqual(zoom.zoomAt(next, 1, at, stage), zoom.IDENTITY);
});

test("list-01: panning stops at the photo's edges and a smaller axis stays centred", () => {
  const zoomed = { scale: 2, x: 0, y: 0 };
  // A 400x300 stage at 2x may move 200 px sideways and 150 px up or down.
  assert.deepEqual(zoom.panZoom(zoomed, 1000, -1000, stage), { scale: 2, x: 200, y: -150 });
  // A tall photo fitted in the stage (225 px wide) at 2x is 450 wide: it may move only 25 px sideways.
  const photo = zoom.fittedSize(stage, { width: 600, height: 800 });
  assert.deepEqual(photo, { width: 225, height: 300 });
  assert.deepEqual(zoom.panZoom(zoomed, 1000, 0, stage, photo), { scale: 2, x: 25, y: 0 });
  // At 1.2x the same photo is narrower than the stage: no sideways movement at all.
  assert.equal(zoom.panZoom({ scale: 1.2, x: 0, y: 0 }, 80, 0, stage, photo).x, 0);
});

test("list-01: double tap toggles 1x and 2.5x at the tapped point; buttons step 1x, 2x, 3x, 4x", () => {
  const tapped = zoom.toggleZoom(zoom.IDENTITY, { x: 40, y: 20 }, stage);
  assert.equal(tapped.scale, zoom.DOUBLE_TAP_ZOOM);
  assert.equal(zoom.DOUBLE_TAP_ZOOM, 2.5);
  near(tapped.x, 40 - 40 * 2.5);
  assert.deepEqual(zoom.toggleZoom(tapped, { x: 0, y: 0 }, stage), zoom.IDENTITY);
  let current = zoom.IDENTITY;
  const steps = [];
  for (let n = 0; n < 4; n += 1) {
    current = zoom.stepZoom(current, 1, stage);
    steps.push(current.scale);
  }
  assert.deepEqual(steps, [2, 3, 4, 4]);
  // From an in-between zoom (a pinch or the wheel) the buttons snap to the next whole step.
  assert.equal(zoom.stepZoom({ scale: 2.5, x: 0, y: 0 }, -1, stage).scale, 2);
  assert.equal(zoom.stepZoom({ scale: 2.5, x: 0, y: 0 }, 1, stage).scale, 3);
  assert.deepEqual(zoom.stepZoom({ scale: 2, x: 0, y: 0 }, -1, stage), zoom.IDENTITY);
});

test("list-01: a pinch scales by the fingers' spread and follows their midpoint", () => {
  const start = zoom.IDENTITY;
  const mid = { x: 0, y: 0 };
  const pinched = zoom.pinchZoom(start, mid, { x: 10, y: 0 }, 2, stage);
  assert.equal(pinched.scale, 2);
  assert.equal(pinched.x, 10);
  // Closing the fingers past 1x settles at 1x, centred.
  assert.deepEqual(zoom.pinchZoom({ scale: 2, x: 50, y: 0 }, mid, mid, 0.3, stage), zoom.IDENTITY);
  assert.equal(zoom.distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(zoom.midpoint({ x: 0, y: 0 }, { x: 4, y: 8 }), { x: 2, y: 4 });
});

test("list-01: the lightbox wires every gesture to a button, resets on photo change and preloads its neighbours", () => {
  const lightbox = source("components/listing/lightbox.tsx");
  for (const rule of [
    /label="Acercar"/, /label="Alejar"/, /event\.key === "\+"/, /event\.key === "-"/, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/,
    /onPointerDown=\{onPointerDown\}/, /kind: "pinch"/, /toggleZoom\(/, /touch-none/, /aria-live="polite" className="sr-only"/,
  ]) assert.match(lightbox, rule);
  // A sideways swipe only changes photo at 1x: the swipe gesture exists only when not zoomed.
  assert.match(lightbox, /zoomRef\.current\.scale > MIN_ZOOM\s*\? \{ kind: "pan"[\s\S]*?: \{ kind: "swipe"/);
  // Moving resets the zoom.
  assert.match(lightbox, /const move = \(step: number\) => \{[\s\S]*?setZoomState\(IDENTITY\)/);
  // The next and previous photos load hidden at the lightbox's size.
  assert.match(lightbox, /neighbours\.map[\s\S]*?invisible[\s\S]*?sizes="100vw"[\s\S]*?loading="eager"/);
  assert.doesNotMatch(lightbox, /touch-pan-y/);
  const css = source("app/globals.css");
  assert.match(css, /\.lightbox-photo\[data-animate\] \{\s*transition: transform 160ms ease-out;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.lightbox-photo\[data-animate\] \{\s*transition: none;/);
});

const share = require("@/components/listing/share-button.tsx");

test("list-08: the share text names the title and price, and WhatsApp gets text and link", () => {
  assert.equal(share.shareText("Boss DS-1", "S/ 299"), "Boss DS-1 a S/ 299 en Laria");
  assert.equal(share.shareText("Boss DS-1", null), "Boss DS-1 en Laria");
  const url = share.whatsAppShareUrl("Boss DS-1 a S/ 299 en Laria", "https://laria.audio/instrumentos/boss");
  assert.equal(url, `https://wa.me/?text=${encodeURIComponent("Boss DS-1 a S/ 299 en Laria https://laria.audio/instrumentos/boss")}`);
  assert.equal(share.storyFileName("/instrumentos/boss-ds-1/historia"), "laria-boss-ds-1.png");
});

test("list-08: before hydration (and without a share sheet) Compartir is a disclosure button with a full-width module form", () => {
  const props = { url: "https://laria.audio/instrumentos/boss", title: "Boss DS-1", priceLabel: "S/ 299", storyImageUrl: "/instrumentos/boss/historia" };
  const moduleMarkup = renderToStaticMarkup(React.createElement(share.ShareListing, { ...props, variant: "module" }));
  assert.match(moduleMarkup, /<button type="button" aria-expanded="false" aria-controls="[^"]+" class="[^"]*w-full[^"]*">.*Compartir<\/button>/);
  assert.match(moduleMarkup, /role="status" aria-live="polite"/);
  // The menu renders only while open; "Compartir imagen" only where files can be shared (after hydration).
  assert.doesNotMatch(moduleMarkup, /Copiar enlace|Compartir imagen/);
  const iconMarkup = renderToStaticMarkup(React.createElement(share.ShareListing, { ...props, variant: "icon" }));
  assert.match(iconMarkup, /aria-label="Compartir" title="Compartir"/);
  assert.match(iconMarkup, /h-11 w-11/);
});

test("list-08: the fallback menu copies, opens WhatsApp and downloads the story image, each row 44 px", () => {
  const markup = renderToStaticMarkup(
    React.createElement(share.ShareOptions, {
      url: "https://laria.audio/instrumentos/boss",
      text: "Boss DS-1 a S/ 299 en Laria",
      storyImageUrl: "/instrumentos/boss/historia",
      onCopy() {},
      onChoose() {},
    }),
  );
  assert.match(markup, /role="group" aria-label="Opciones para compartir"/);
  assert.match(markup, /<button type="button" class="[^"]*min-h-11[^"]*">.*Copiar enlace<\/button>/);
  assert.match(markup, /<a href="https:\/\/wa\.me\/\?text=Boss%20DS-1%20a%20S%2F%20299%20en%20Laria%20https%3A%2F%2Flaria\.audio%2Finstrumentos%2Fboss" target="_blank" rel="noopener noreferrer"/);
  assert.match(markup, /<a href="\/instrumentos\/boss\/historia" download="laria-boss.png" class="[^"]*min-h-11[^"]*">.*Descargar imagen para estados<\/a>/);
  const component = source("components/listing/share-button.tsx");
  assert.match(component, /navigator\.share\(\{ title, text, url \}\)/);
  assert.match(component, /navigator\.canShare\(\{ files: \[probe\] \}\)/);
  assert.match(component, /"Enlace copiado"/);
  assert.match(component, /useDisclosure\(/);
});

test("list-09: the share images exist with their sizes, fall back to the Laria card and 404 a missing story", () => {
  const root = source("app/opengraph-image.tsx");
  assert.match(root, /export const size = OG_SIZE/);
  assert.match(root, /export const contentType = "image\/png"/);
  assert.match(root, /export const alt = /);
  const listing = source("app/instrumentos/[slug]/opengraph-image.tsx");
  assert.match(listing, /getCategoryLandingBySlug\(slug\)/);
  assert.match(listing, /<CategoryCard landing=\{landing\} \/>/);
  assert.match(listing, /<ListingCard listing=\{listing\} \/>/);
  assert.match(listing, /return renderShareImage\(<GenericCard \/>, OG_SIZE\);\s*\}$/m);
  const story = source("app/instrumentos/[slug]/historia/route.tsx");
  assert.match(story, /status: 404/);
  assert.match(story, /"public, max-age=300"/);
  const lib = source("lib/share-image.tsx");
  assert.match(lib, /OG_SIZE = \{ width: 1200, height: 630 \}/);
  assert.match(lib, /STORY_SIZE = \{ width: 1080, height: 1920 \}/);
  assert.match(lib, /\.rpc\("listing_is_public"/);
  assert.match(lib, /Tienda verificada/);
  assert.match(lib, /Vendido/);
  assert.match(lib, /\/_next\/image\?url=/);
});
