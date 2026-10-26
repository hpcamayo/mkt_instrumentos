// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-06 "Lo que buscan en Laria". Unit
// checks for the report's parsing and wording; the database rules are in tests/store-reach-demand.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const load = Module._load;
Module._load = function stubServerOnly(request, ...rest) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const {
  parseDemandReport,
  parseDemandMonth,
  demandMonthLabel,
  demandMonthChipLabel,
  demandPeriodLabel,
  demandCount,
  demandCities,
  demandRowsFor,
  demandRowLabel,
  demandRowPath,
  demandPagePath,
} = require("@/lib/demand-report");
const { DemandLimits, DemandSectionTable, DemandMethod } = require("@/components/demand/demand-report");

const RAW = {
  months: ["2026-09-01", "2026-08-01", "nope"],
  report: {
    month: "2026-09-01",
    period_start: "2026-09-01T05:00:00+00:00",
    period_end: "2026-10-01T05:00:00+00:00",
    built_at: "2026-10-01T10:30:00+00:00",
    threshold: 5,
    searchers: 26,
    searchers_with_city: 11,
    searchers_in_lima: null,
    alert_holders: 6,
    rows: [
      { section: "brand", position: 1, city: null, filters: { brand: "Yamaha" }, people: 11, listed: 2, mine: 1 },
      { section: "brand", position: 2, city: "Lima", filters: { brand: "Yamaha" }, people: 5, listed: 1, mine: 1 },
      { section: "query", position: 1, city: null, filters: { query: "yamaha pacifica" }, people: 5, listed: 1, mine: 0 },
      { section: "type", position: 1, city: null, filters: { category: "keyboards" }, people: 7, listed: 3, mine: 0 },
      { section: "type", position: 2, city: "Cusco", filters: { category: "winds" }, people: 9, listed: 0, mine: 0 },
      { section: "no_results", position: 1, city: "Cusco", filters: { category: "winds", instrument_type: "theremin" }, people: 5, listed: 0, mine: 0 },
      // Never trusted: an unknown section, a key outside the report's shape, a negative count.
      { section: "people", position: 1, city: null, filters: { brand: "X" }, people: 5, listed: 0, mine: 0 },
      { section: "brand", position: 3, city: null, filters: { user: "x" }, people: 5, listed: 0, mine: 0 },
      { section: "brand", position: 4, city: null, filters: { brand: "Y" }, people: -1, listed: 0, mine: 0 },
    ],
  },
};

test("reach-06: the report parses strictly and drops anything outside its shape", () => {
  const result = parseDemandReport(RAW);
  assert.deepEqual(result.months, ["2026-09-01", "2026-08-01"]);
  assert.equal(result.report.rows.length, 6);
  assert.equal(result.report.searchersInLima, null);
  assert.deepEqual(result.report.rows[0], { section: "brand", position: 1, city: null, filters: { brand: "Yamaha" }, people: 11, listed: 2, mine: 1 });
  assert.deepEqual(parseDemandReport({ months: [], report: null }), { months: [], report: null });
  assert.equal(parseDemandReport({ months: [], report: { month: "2026-09-15", threshold: 5 } }), null);
  assert.equal(parseDemandReport(null), null);
});

test("reach-06: months, periods and counts read in Spanish, and small totals never show a number", () => {
  assert.equal(parseDemandMonth("2026-09"), "2026-09-01");
  assert.equal(parseDemandMonth("2026-13"), null);
  assert.equal(parseDemandMonth("2026-09-01"), null);
  assert.equal(parseDemandMonth(undefined), null);
  assert.equal(demandMonthLabel("2026-09-01"), "septiembre de 2026");
  assert.equal(demandMonthChipLabel("2026-09-01"), "Septiembre 2026");
  assert.equal(demandPeriodLabel("2026-09-01"), "del 1 al 30 de septiembre de 2026");
  assert.equal(demandPeriodLabel("2028-02-01"), "del 1 al 29 de febrero de 2028");
  assert.equal(demandCount(null, 5), "menos de 5");
  assert.equal(demandCount(1234, 5), new Intl.NumberFormat("es-PE").format(1234));
  assert.equal(demandCount(0, 5), "0");
});

test("reach-06: rows group by city, order by people only and link to the catalog search they describe", () => {
  const { report } = parseDemandReport(RAW);
  assert.deepEqual(demandCities(report.rows), ["Cusco", "Lima"]);
  assert.deepEqual(demandRowsFor(report.rows, "type", null).map((row) => row.filters.category), ["keyboards"]);
  assert.deepEqual(demandRowsFor(report.rows, "type", "Cusco").map((row) => row.filters.category), ["winds"]);
  assert.equal(demandRowLabel(report.rows[0]), "Yamaha");
  assert.equal(demandRowLabel(report.rows[2]), "“yamaha pacifica”");
  assert.equal(demandRowPath(report.rows[1]), "/listados?location=Lima&brand=Yamaha");
  assert.equal(demandRowPath(report.rows[2]), "/listados?q=yamaha+pacifica");
  assert.equal(demandPagePath({ month: "2026-09-01", city: "Lima" }), "/mi-cuenta/tienda/demanda?mes=2026-09&ciudad=Lima");
  assert.equal(demandPagePath({}), "/mi-cuenta/tienda/demanda");
});

test("reach-06: the page states its limits next to the data and never gives advice", () => {
  const { report } = parseDemandReport(RAW);
  const limits = renderToStaticMarkup(React.createElement(DemandLimits, { report }));
  for (const expected of [
    "Qué no te dice este reporte",
    "Una búsqueda no es una venta.",
    "Son números pequeños.",
    "La mayoría de los datos es de Lima.",
    "Una persona puede contar más de una vez.",
    "No hay precios, márgenes ni costos.",
    "Ningún modelo predice la demanda.",
  ]) assert.ok(limits.includes(expected), expected);
  // The Lima total under the floor reads "menos de 5", never a number.
  assert.match(limits, /eligieron una ciudad y menos de 5 eligieron Lima/);

  const table = renderToStaticMarkup(React.createElement(DemandSectionTable, { report, section: "brand", city: null, monthLabel: "septiembre de 2026" }));
  assert.match(table, /del 1 al 30 de septiembre de 2026, en todo el Perú\. Solo filas con 5 o más\./);
  for (const header of ["Búsqueda", "Personas", "Publicaciones activas", "De tu tienda"]) assert.ok(table.includes(header), header);
  const alerts = renderToStaticMarkup(React.createElement(DemandSectionTable, { report, section: "alert", city: null, monthLabel: "septiembre de 2026" }));
  assert.match(alerts, /Ninguna alerta llegó al mínimo de cuentas\./);
  const method = renderToStaticMarkup(React.createElement(DemandMethod, { report }));
  assert.match(method, /Las búsquedas de cuentas de tienda y de Admin no se cuentan\./);

  // Counts, never advice (Henri's note on reach-06): no recommendation, opportunity or urgency words anywhere.
  const copy = [read("components/demand/demand-report.tsx"), read("app/mi-cuenta/tienda/demanda/page.tsx")].join("\n");
  assert.doesNotMatch(copy, /te recomendamos|recomendado|oportunidad|deber[ií]as|conviene (tener|stockear|comprar)|abastec|stock(ea|éa)|tendencia|en alza|caliente|top \d|más vendid|demanda alta|alta demanda/i);
  assert.match(copy, /Son conteos, no recomendaciones/);
});

test("reach-06: the report is store-only and its job is protected", () => {
  const page = read("app/mi-cuenta/tienda/demanda/page.tsx");
  assert.match(page, /if \(profile\?\.account_type !== "store_owner"\) redirect\("\/mi-cuenta"\);/);
  assert.match(page, /rpc\("get_demand_report"/);
  const route = read("app/api/internal/jobs/demand-report/route.ts");
  assert.match(route, /if \(!cronAuthorized\(request\)\) return NextResponse\.json\(\{ message: "No autorizado\." \}, \{ status: 401 \}\);/);
  assert.match(route, /rpc\("run_demand_report_job"\)/);
  const migration = read("supabase/migrations/20261205120000_feat_store_reach_demand.sql");
  assert.match(migration, /people\s+integer not null check \(people >= 5\)/);
  assert.match(migration, /grant execute on function public\.run_demand_report_job\(\) to service_role;/);
  assert.doesNotMatch(migration, /grant [^;]* on (table )?public\.demand_report/);
});
