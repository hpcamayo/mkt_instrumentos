"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { QrGlyph } from "@/components/store-floor/label-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { qrModules } from "@/lib/labels/qr";
import { wrapText } from "@/lib/labels/sheets";

// reach-10: the counter poster "Encuéntranos en Laria" with the store's QR, so walk-in visitors find the catalog,
// save what they liked and follow the store. A4 or A5, drawn as SVG like the labels.

const SIZES = {
  a4: { name: "A4 (para pared o vitrina)", width: 210, height: 297 },
  a5: { name: "A5 (para el mostrador)", width: 148, height: 210 },
} as const;

type Size = keyof typeof SIZES;
const PRINT_ROOT = "cartel-tienda";

export function StorePoster({ storeName, url, displayUrl, tryouts }: { storeName: string; url: string; displayUrl: string; tryouts: boolean }) {
  const [size, setSize] = useState<Size>("a4");
  const [showTryouts, setShowTryouts] = useState(tryouts);
  const modules = useMemo(() => qrModules(url), [url]);
  const page = SIZES[size];
  const scale = page.width / 210;
  const qrSize = 120 * scale;
  const nameLines = wrapText(storeName, page.width - 30 * scale, 13 * scale, 2, 0.6);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <style>{`@page { size: ${page.width}mm ${page.height}mm; margin: 0; }
@media print {
  body * { visibility: hidden !important; }
  #${PRINT_ROOT}, #${PRINT_ROOT} * { visibility: visible !important; }
  #${PRINT_ROOT} { position: absolute; left: 0; top: 0; width: ${page.width}mm !important; height: ${page.height}mm !important; max-width: none !important; border: 0 !important; box-shadow: none !important; }
}`}</style>
      <form className="grid gap-5 rounded-panel border border-subtle bg-white p-5" onSubmit={(event) => { event.preventDefault(); window.print(); }}>
        <Field id="cartel-tamano" label="Tamaño">
          <Select value={size} onChange={(event) => setSize(event.target.value as Size)}>
            {(Object.keys(SIZES) as Size[]).map((key) => <option key={key} value={key}>{SIZES[key].name}</option>)}
          </Select>
        </Field>
        {tryouts ? (
          <Checkbox checked={showTryouts} onChange={(event) => setShowTryouts(event.target.checked)} label="Contar que se puede reservar una prueba" />
        ) : null}
        <Button type="submit" icon={<Printer aria-hidden />}>Imprimir</Button>
        <p className="t-meta">El QR lleva a tu página de tienda en Laria. Escanéalo con tu celular antes de pegarlo.</p>
      </form>

      <svg
        id={PRINT_ROOT}
        role="img"
        aria-label={`Cartel: Encuéntranos en Laria, ${storeName}`}
        viewBox={`0 0 ${page.width} ${page.height}`}
        className="w-full max-w-xl rounded-control border border-subtle bg-white shadow-sm"
        fontFamily="var(--font-archivo), Arial, Helvetica, sans-serif"
        textAnchor="middle"
        fill="#050608"
      >
        <rect width={page.width} height={page.height} fill="#fff" />
        <text x={page.width / 2} y={26 * scale} fontSize={9 * scale} fontWeight={600}>Encuéntranos en Laria</text>
        <text fontSize={13 * scale} fontWeight={800}>
          {nameLines.map((line, index) => <tspan key={index} x={page.width / 2} y={(44 + index * 15) * scale}>{line}</tspan>)}
        </text>
        <QrGlyph modules={modules} x={(page.width - qrSize) / 2} y={(nameLines.length > 1 ? 66 : 54) * scale} size={qrSize} quiet={3} />
        <text x={page.width / 2} y={(nameLines.length > 1 ? 200 : 188) * scale} fontSize={6 * scale} fontWeight={600}>Escanea con la cámara de tu celular</text>
        <text fontSize={5 * scale} fill="#3a3f47">
          <tspan x={page.width / 2} y={(nameLines.length > 1 ? 214 : 202) * scale}>Mira todo nuestro catálogo, guarda lo que te guste</tspan>
          <tspan x={page.width / 2} y={(nameLines.length > 1 ? 222 : 210) * scale}>y síguenos para enterarte de lo nuevo.</tspan>
          {showTryouts ? <tspan x={page.width / 2} y={(nameLines.length > 1 ? 234 : 222) * scale} fontWeight={600} fill="#050608">¿Quieres probar algo? Reserva una prueba desde la publicación.</tspan> : null}
        </text>
        <text x={page.width / 2} y={page.height - 18 * scale} fontSize={5.5 * scale} fontWeight={700}>{displayUrl}</text>
      </svg>
    </div>
  );
}
