// UX-1 color roles (docs/ux-redesign/ux-1-foundations.md, decisions D2 and D3): every declared text and
// background pair meets WCAG AA, control boundaries reach 3:1, and the CSS variables match the Tailwind roles.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const config = require(path.resolve("tailwind.config.ts"));
const colors = (config.default ?? config).theme.extend.colors;

function role(name) {
  const [group, shade = "DEFAULT"] = name.split(".");
  const value = colors[group];
  const hex = typeof value === "string" ? value : value?.[shade];
  assert.ok(hex, `missing color role ${name}`);
  return hex;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(role(a)), luminance(role(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Body and UI text on light surfaces. ink-3 is for placeholders on white only.
const TEXT_ON_LIGHT = [
  ...["surface", "canvas", "subtle", "accent.tint", "warning.tint", "danger.tint"].map((bg) => ["ink", bg]),
  ...["surface", "canvas", "subtle", "accent.tint", "warning.tint", "danger.tint"].map((bg) => ["ink.2", bg]),
  ["ink.3", "surface"],
  ["danger", "surface"],
  ["danger", "danger.tint"],
];
// Text on the black frame (header, footer, Admin chrome). Blue is text only here.
const TEXT_ON_FRAME = [
  ...["frame", "frame.2"].flatMap((bg) => [["surface", bg], ["muted-dark", bg], ["accent", bg]]),
];
// The yellow action carries dark text in both states.
const TEXT_ON_ACTION = [["action.ink", "action"], ["action.ink", "action.hover"]];
// Control borders, focus rings and marks that carry meaning (WCAG 1.4.11).
const NON_TEXT = [
  ["line.strong", "surface"],
  ["line.strong", "canvas"],
  ["ink", "surface"],
  ["accent", "frame"],
  ["action", "frame"],
  ["ink", "accent"],
];

test("text pairs meet 4.5:1", () => {
  for (const [text, background] of [...TEXT_ON_LIGHT, ...TEXT_ON_FRAME, ...TEXT_ON_ACTION]) {
    const ratio = contrast(text, background);
    assert.ok(ratio >= 4.5, `${text} on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

test("control boundaries, focus rings and meaningful marks meet 3:1", () => {
  for (const [mark, background] of NON_TEXT) {
    const ratio = contrast(mark, background);
    assert.ok(ratio >= 3, `${mark} on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

test("decorative lines stay decorative", () => {
  // line-deco may separate content but is never the only boundary of a control.
  assert.ok(contrast("line.deco", "surface") < 3);
  const controls = fs.readFileSync("components/ui/field.tsx", "utf8") + fs.readFileSync("components/ui/button.tsx", "utf8");
  assert.doesNotMatch(controls, /border-line-deco/);
  assert.match(fs.readFileSync("components/ui/field.tsx", "utf8"), /border-line-strong/);
});

test("CSS variables mirror the Tailwind roles", () => {
  const css = fs.readFileSync("app/globals.css", "utf8");
  const variable = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();
  const pairs = {
    frame: "frame", "frame-2": "frame.2", action: "action", "action-hover": "action.hover", accent: "accent",
    "accent-tint": "accent.tint", ink: "ink", "ink-2": "ink.2", "ink-3": "ink.3", "muted-dark": "muted-dark",
    surface: "surface", canvas: "canvas", subtle: "subtle", "line-deco": "line.deco", "line-strong": "line.strong",
    danger: "danger", "danger-tint": "danger.tint", "warning-tint": "warning.tint",
  };
  for (const [cssName, roleName] of Object.entries(pairs)) {
    assert.equal(variable(cssName), role(roleName).toLowerCase(), `--${cssName}`);
  }
});

// Components that only render inside a frame surface without declaring it themselves. None since UX-2: the header,
// footer and Admin navigation each carry surface-frame.
const FRAME_CHILDREN = new Set();

test("light-on-dark text roles are only used on frame surfaces", () => {
  const files = ["app", "components", "components_v0"].flatMap(function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : file.endsWith(".tsx") ? [file] : [];
    });
  });
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!/\btext-(muted-dark|accent)(?![-\w])/.test(source)) continue;
    const onFrame = /surface-frame|bg-frame\b/.test(source) || /onDark:/.test(source) || FRAME_CHILDREN.has(file);
    assert.ok(onFrame, `${file} uses text-muted-dark or text-accent outside a frame surface`);
  }
});
