import type { ReactNode } from "react";
import {
  COMPLAINTS_BOOK_ANSWER_TERM,
  COMPLAINTS_BOOK_PROVIDER,
  documentTypeLabel,
  formatClaimedAmount,
  formatSheetDate,
  type ComplaintsBookEntry,
} from "@/lib/complaints-book";

// Wording of the Reglamento del Libro de Reclamaciones (D.S. 011-2011-PCM, art. 2 and Anexo I) and Ley 29571, art. 24
// as amended by Ley 31435. PENDIENTE DE REVISIÓN LEGAL ANTES DE PRODUCCIÓN.
export const COMPLAINT_TYPE_DEFINITIONS = {
  reclamo: "Disconformidad relacionada a los productos o servicios.",
  queja: "Disconformidad no relacionada a los productos o servicios; o malestar o descontento respecto a la atención al público.",
} as const;

export const ITEM_TYPE_LABELS = { producto: "Producto", servicio: "Servicio" } as const;
export const COMPLAINT_TYPE_LABELS = { reclamo: "Reclamo", queja: "Queja" } as const;

export const COMPLAINTS_BOOK_NOTES = [
  `El proveedor deberá dar respuesta al reclamo en un plazo no mayor a ${COMPLAINTS_BOOK_ANSWER_TERM}.`,
  "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.",
] as const;

export function ProviderBlock() {
  return (
    <section aria-labelledby="libro-proveedor" className="rounded-panel border border-subtle bg-canvas p-4">
      <h2 id="libro-proveedor" className="t-micro text-ink-2">Proveedor</h2>
      <dl className="mt-2 grid gap-1 t-ui text-ink sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        {/* Bracketed values are stand-ins until legal confirms Laria's entity (lib/complaints-book.ts). */}
        <dt className="font-semibold">Razón social</dt>
        <dd>{COMPLAINTS_BOOK_PROVIDER.businessName}</dd>
        <dt className="font-semibold">RUC</dt>
        <dd>{COMPLAINTS_BOOK_PROVIDER.ruc}</dd>
        <dt className="font-semibold">Domicilio</dt>
        <dd>{COMPLAINTS_BOOK_PROVIDER.address}</dd>
      </dl>
    </section>
  );
}

export function ComplaintsBookNotes() {
  return (
    <ul className="grid list-disc gap-1.5 pl-5 t-ui text-ink-2">
      {COMPLAINTS_BOOK_NOTES.map((note) => <li key={note}>{note}</li>)}
    </ul>
  );
}

// Printing shows only the sheet: the header, footer and legal navigation are hidden, and the print: classes on the
// section move it to the top of the page.
const PRINT_STYLES = `@media print {
  body * { visibility: hidden !important; }
  #hoja-libro, #hoja-libro * { visibility: visible !important; }
  #hoja-libro [data-print-hidden] { display: none !important; }
}`;

// The filed sheet: its number, date and a copy of what was registered, in the order of the Indecopi sheet.
export function FiledSheet({
  sheetNumber,
  filedAt,
  entry,
  actions,
}: {
  sheetNumber: string;
  filedAt: string;
  entry: ComplaintsBookEntry;
  actions: ReactNode;
}) {
  return (
    <section id="hoja-libro" aria-labelledby="hoja-titulo" tabIndex={-1} className="grid gap-5 rounded-panel border border-subtle bg-surface p-4 sm:p-6 print:absolute print:inset-x-0 print:top-0 print:border-0 print:p-0">
      <style>{PRINT_STYLES}</style>
      <header className="grid gap-1">
        <p className="t-micro text-ink-2">Libro de Reclamaciones</p>
        <h2 id="hoja-titulo" className="t-section text-ink">Hoja de reclamación N.° {sheetNumber}</h2>
        <p className="t-ui text-ink-2">Fecha de registro: {formatSheetDate(filedAt)} (hora de Lima)</p>
      </header>
      <ProviderBlock />
      <SheetSection title="1. Identificación del consumidor reclamante">
        <Row label="Nombre completo" value={entry.consumerName} />
        <Row label="Documento" value={`${documentTypeLabel(entry.documentType)} ${entry.documentNumber}`} />
        <Row label="Domicilio" value={entry.address} />
        <Row label="Teléfono" value={entry.phone} />
        <Row label="Correo electrónico" value={entry.email} />
        {entry.isMinor ? <Row label="Padre, madre o apoderado" value={entry.guardianName ?? ""} /> : null}
      </SheetSection>
      <SheetSection title="2. Identificación del bien contratado">
        <Row label="Tipo" value={ITEM_TYPE_LABELS[entry.itemType]} />
        <Row label="Monto reclamado" value={formatClaimedAmount(entry.claimedAmount)} />
        <Row label="Descripción" value={entry.itemDescription} />
      </SheetSection>
      <SheetSection title="3. Detalle de la reclamación y pedido del consumidor">
        <Row label="Tipo" value={`${COMPLAINT_TYPE_LABELS[entry.complaintType]}: ${COMPLAINT_TYPE_DEFINITIONS[entry.complaintType]}`} />
        <Row label="Detalle" value={entry.detail} />
        <Row label="Pedido" value={entry.request} />
      </SheetSection>
      <SheetSection title="4. Observaciones y acciones adoptadas por el proveedor">
        <Row label="Estado" value="Recibida. La respuesta llegará al correo que indicaste." />
      </SheetSection>
      <ComplaintsBookNotes />
      <div data-print-hidden className="flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="t-ui font-semibold text-ink">{title}</h3>
      <dl className="grid gap-2 t-ui">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className="whitespace-pre-line break-words text-ink">{value}</dd>
    </div>
  );
}
