import type { WeeklyStatistics } from "@/lib/account-analytics";

const numbers = new Intl.NumberFormat("es-PE");
const weekLabel = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });

// "YYYY-MM-DD" is the Lima Monday the RPC computed; reading it at UTC noon keeps the same calendar day.
export function formatWeek(weekStart: string) {
  return weekLabel.format(new Date(`${weekStart}T12:00:00Z`));
}

// A clean upper bound for the axis: 1, 2 or 5 times a power of ten, never below 1.
export function niceMax(value: number) {
  if (value <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].map((step) => step * power).find((candidate) => candidate >= value)) ?? 10 * power;
}

type Measure = "views" | "contacts";

const WIDTH = 360;
const HEIGHT = 140;
const PAD = { top: 18, right: 14, bottom: 22, left: 34 };

// One single-series line per measure (small multiples, not a dual axis: views and contacts differ by orders of
// magnitude). Ink line, accent wash, hairline grid; each week has a hover title, the table below has every value.
function TrendChart({ weekly, measure, title, unit }: { weekly: WeeklyStatistics[]; measure: Measure; title: string; unit: [string, string] }) {
  const values = weekly.map((week) => week[measure]);
  const max = niceMax(Math.max(0, ...values));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (weekly.length > 1 ? (index * plotWidth) / (weekly.length - 1) : plotWidth / 2);
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  const baseline = PAD.top + plotHeight;
  const total = values.reduce((sum, value) => sum + value, 0);
  const last = values.at(-1) ?? 0;
  const id = `tendencia-${measure}`;
  const label = (value: number) => `${numbers.format(value)} ${value === 1 ? unit[0] : unit[1]}`;
  const ticks = [0, max / 2, max].filter((tick, index, all) => Number.isInteger(tick) && all.indexOf(tick) === index);
  const xLabels = [0, Math.floor((weekly.length - 1) / 2), weekly.length - 1].filter((index, position, all) => index >= 0 && all.indexOf(index) === position);

  return (
    <figure className="rounded-panel border border-subtle bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="t-ui font-semibold text-ink">{title}</span>
        <span className="t-meta text-ink-2">12 semanas: {label(total)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-3 h-auto w-full" role="img" aria-labelledby={`${id}-titulo`}>
        <title id={`${id}-titulo`}>{`${title}, últimas 12 semanas: ${label(total)} en total, ${label(last)} en la semana en curso.`}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-line-deco" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="fill-ink-2 text-[11px] tabular-nums">{numbers.format(tick)}</text>
          </g>
        ))}
        {weekly.length ? (
          <>
            <polygon points={`${x(0)},${baseline} ${points.join(" ")} ${x(weekly.length - 1)},${baseline}`} className="fill-accent/15" />
            <polyline points={points.join(" ")} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(weekly.length - 1)} cy={y(last)} r={4} className="fill-ink stroke-surface" strokeWidth={2} />
            <text x={x(weekly.length - 1) - 8} y={Math.max(y(last) - 8, 11)} textAnchor="end" className="fill-ink text-[11px] font-semibold tabular-nums">{numbers.format(last)}</text>
          </>
        ) : null}
        {xLabels.map((index) => (
          <text key={index} x={x(index)} y={HEIGHT - 6} textAnchor={index === 0 ? "start" : index === weekly.length - 1 ? "end" : "middle"} className="fill-ink-2 text-[11px]">{formatWeek(weekly[index].week_start)}</text>
        ))}
        {/* Hover targets wider than the line: one per week, with its value as the native tooltip. */}
        {weekly.map((week, index) => (
          <rect key={week.week_start} x={x(index) - plotWidth / Math.max(weekly.length - 1, 1) / 2} y={PAD.top} width={plotWidth / Math.max(weekly.length - 1, 1)} height={plotHeight} fill="transparent" aria-hidden>
            <title>{`Semana del ${formatWeek(week.week_start)}: ${label(week[measure])}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}

// The last 12 weeks of views and WhatsApp contacts, with a table of every week (the chart's text alternative).
export function WeeklyTrend({ weekly, purchaseRequests = false }: { weekly: WeeklyStatistics[]; purchaseRequests?: boolean }) {
  return (
    <section aria-labelledby="tendencia-semanal" className="space-y-3">
      <div>
        <h2 id="tendencia-semanal" className="t-section text-ink">Últimas 12 semanas</h2>
        <p className="mt-1 t-meta text-ink-2">Cada punto es una semana, de lunes a domingo. La última está en curso.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart weekly={weekly} measure="views" title="Vistas por semana" unit={["vista", "vistas"]} />
        <TrendChart weekly={weekly} measure="contacts" title="Contactos por WhatsApp por semana" unit={["contacto", "contactos"]} />
      </div>
      <details className="rounded-panel border border-subtle bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 t-ui font-semibold text-ink">Ver los datos por semana</summary>
        <div className="border-t border-subtle px-4 pb-4">
          <table className="w-full text-left t-ui">
            <caption className="sr-only">Vistas y contactos por semana, últimas 12 semanas</caption>
            <thead className="t-meta text-ink-2">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">Semana del</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Vistas</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Contactos</th>
                {purchaseRequests ? <th scope="col" className="py-2 text-right font-semibold">Solicitudes de compra</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle tabular-nums text-ink">
              {weekly.map((week) => (
                <tr key={week.week_start}>
                  <th scope="row" className="py-2 pr-3 font-normal">{formatWeek(week.week_start)}</th>
                  <td className="py-2 pr-3 text-right">{numbers.format(week.views)}</td>
                  <td className="py-2 pr-3 text-right">{numbers.format(week.contacts)}</td>
                  {purchaseRequests ? <td className="py-2 text-right">{numbers.format(week.purchase_requests)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
