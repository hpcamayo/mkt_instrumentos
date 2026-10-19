// Effortless Laria, batch "find" (docs/ux-effortless/find.md): search, browse, the home and the catalog.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

// FIX 07: choosing a filter keeps the page where it is; the results come into view only when they are off-screen.
test("FIX 07: catalog navigations do not jump to the top", () => {
  const navigation = source("components/catalog-navigation.tsx");
  assert.match(navigation, /router\.push\(href, \{ scroll: false \}\)/);
  assert.match(navigation, /id=\{RESULTS_REGION_ID\}/);
  assert.match(source("components/pagination.tsx"), /resultsScroll="start"/);
});

test("FIX 07: the results scroll target", () => {
  const { resultsScrollTarget } = require("@/components/catalog-navigation");
  // A filter low in the column: the results are still on screen, so nothing moves.
  assert.equal(resultsScrollTarget({ top: -900, bottom: 1400 }, 800, "visible"), null);
  // The new results are shorter and end above the screen: their top comes into view.
  assert.equal(resultsScrollTarget({ top: -1200, bottom: -100 }, 800, "visible"), -1216);
  // Below the screen (phones, after the sheet): brought up.
  assert.equal(resultsScrollTarget({ top: 900, bottom: 2000 }, 800, "visible"), 884);
  // A page link at the end of the grid: the first row comes back up.
  assert.equal(resultsScrollTarget({ top: -2000, bottom: 300 }, 800, "start"), -2016);
  assert.equal(resultsScrollTarget({ top: 120, bottom: 2000 }, 800, "start"), null);
});
