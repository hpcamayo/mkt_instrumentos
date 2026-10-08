// UX-1 acceptance criterion 4 (docs/ux-redesign/ux-1-foundations.md): the shared primitives in components/ui
// are the one implementation the product uses, so each has consumers and the hand-rolled copies stay gone.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOTS = ["app", "components", "components_v0"];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

const SOURCES = ROOTS.flatMap(files)
  .filter((file) => !file.startsWith(`components${path.sep}ui${path.sep}`))
  .map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));

function importers(name) {
  const pattern = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "@/components/ui/`);
  return SOURCES.filter(({ text }) => pattern.test(text)).map(({ file }) => file);
}

// Chip (the toggle button) waits for the filter redesign in UX-3. Radio has no product surface yet: the only
// radios are the Admin legacy-link choices, whose markup tests/sprint-8.test.cjs pins. Skeleton lost its only
// consumer with app/listados/loading.tsx (UX-3 Q1 A: the catalog keeps its results on screen while it loads); the
// listing page's streamed sections (UX-4) are its next candidate.
const NOT_YET_USED = new Set(["Chip", "Radio", "Skeleton"]);

test("every shared primitive has a consumer outside components/ui", () => {
  const primitives = [
    "Button", "buttonClasses", "IconButton", "Field", "Input", "Select", "Textarea", "FileInput", "Checkbox",
    "Tag", "StatusTag", "StatusEntryTag", "CountBadge", "ChipLink", "AppliedChip", "Notice", "EmptyState",
    "PageHeader", "Price", "VerifiedMark", "VerifiedIcon", "Skeleton", "WhatsAppGlyph",
  ];
  const unused = primitives.filter((name) => !NOT_YET_USED.has(name) && importers(name).length === 0);
  assert.deepEqual(unused, []);
  assert.ok(importers("PageHeader").length >= 20, "page titles use PageHeader");
  assert.ok(importers("EmptyState").length >= 10, "empty states use EmptyState");
});

test("hand-rolled copies of the primitives do not come back", () => {
  const offenders = (pattern) => SOURCES.filter(({ text }) => pattern.test(text)).map(({ file }) => file);
  // Error boxes are Notice (or noticeClassName where a ref moves focus).
  assert.deepEqual(offenders(/rounded-(panel|control) bg-danger-tint/), []);
  // Loading placeholders are Skeleton.
  assert.deepEqual(offenders(/animate-pulse/), []);
  // Prices are Price; formatPrice stays only inside running text.
  assert.deepEqual(offenders(/t-(card-price|price-detail)/), []);
  // Counts on navigation items are CountBadge.
  assert.deepEqual(offenders(/rounded-full bg-action/), []);
});
