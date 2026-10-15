// Writes a synthetic 2,000-row inventory spreadsheet for the indicative import benchmark (design §14.5):
//   node --experimental-strip-types scripts/prototype/make-bench-import.mjs /tmp/bench-import.xlsx [rows]
// Rows: SKU, name, brand, model, category, price, stock, condition, description, all new SKUs. Synthetic data only.
import { writeFileSync } from "node:fs";
import { writeXlsx } from "../../lib/spreadsheet/xlsx-write.ts";

const [, , out = "bench-import.xlsx", count = "2000"] = process.argv;
const brands = ["Boss", "Fender", "Yamaha", "Shure", "Ibanez", "Roland", "Korg", "Vic Firth"];
const categories = ["Pedales", "Guitarras", "Amplificadores", "Micrófonos", "Bajos", "Teclados", "Percusión", "Audio"];
const rows = [["SKU", "Nombre", "Marca", "Modelo", "Categoría", "Precio (PEN)", "Stock", "Condición", "Descripción"]];
for (let n = 1; n <= Number(count); n++) {
  const brand = brands[n % brands.length];
  rows.push([`BI-${String(n).padStart(5, "0")}`, `${brand} modelo de prueba ${n}`, brand, `M-${n}`, categories[n % categories.length],
    100 + (n % 900), n % 40, "Nuevo", `Producto sintético ${n} para la prueba de rendimiento del importador de Laria.`]);
}
writeFileSync(out, writeXlsx([{ name: "Inventario", rows, textColumns: [0] }]));
console.log(`wrote ${out}: ${rows.length - 1} rows`);
