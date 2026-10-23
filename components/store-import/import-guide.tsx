import { Download, FileSpreadsheet } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { categoryOptions } from "@/lib/listings";
import { IMPORT_COLUMN_GROUPS, IMPORT_FILE_RULES, columnGuideLabel } from "@/lib/store-import/columns-guide";

// Import start (review fix B1): the template first, then what the file must look like and which columns are needed.
// Plain links and a GET form, so it works before the page hydrates.

export function ImportTemplatePanel() {
  return (
    <form action="/api/store/imports/template" method="get" className="grid gap-4 rounded-panel bg-canvas p-4 sm:p-5" aria-labelledby="plantilla-titulo">
      <div className="flex items-start gap-3">
        <FileSpreadsheet aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-ink" />
        <div className="grid gap-1">
          <h2 id="plantilla-titulo" className="t-section">Descarga la plantilla</h2>
          <p className="max-w-[68ch] t-body text-ink-2">
            Trae las columnas de Laria en orden, dos filas de ejemplo, una hoja de instrucciones y los valores aceptados de
            categoría, tipo y condición. Llénala y súbela aquí. También puedes subir tu propio archivo.
          </p>
        </div>
      </div>
      <Field
        id="plantilla-categoria"
        label="Columnas de atributos para"
        optional
        hint="Agrega las columnas de atributos de una categoría, por ejemplo Tipo de cuerpo para guitarras."
        className="max-w-md"
      >
        <Select name="category" defaultValue="">
          <option value="">Sin atributos</option>
          {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="format" value="xlsx" className={buttonClasses({ variant: "secondary" })}><Download aria-hidden />Descargar plantilla Excel (.xlsx)</button>
        <button type="submit" name="format" value="csv" className={buttonClasses({ variant: "quiet" })}>Descargar plantilla CSV</button>
      </div>
    </form>
  );
}

export function ImportFileGuide() {
  return (
    <section className="grid gap-5" aria-labelledby="archivo-requisitos">
      <div className="grid gap-2">
        <h2 id="archivo-requisitos" className="t-section">Qué debe tener tu archivo</h2>
        <ul className="grid max-w-[68ch] list-disc gap-1.5 pl-5 t-body text-ink">
          {IMPORT_FILE_RULES.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {IMPORT_COLUMN_GROUPS.map((group) => (
          <section key={group.requirement} className="grid content-start gap-3 rounded-panel border border-subtle p-4" aria-labelledby={`columnas-${group.requirement}`}>
            <div className="grid gap-1">
              <h3 id={`columnas-${group.requirement}`} className="t-body font-semibold">{group.title}</h3>
              <p className="t-meta">{group.summary}</p>
            </div>
            <dl className="grid gap-2.5">
              {group.columns.map((column) => (
                <div key={column.key} className="grid gap-0.5">
                  <dt className="t-ui font-semibold text-ink">{columnGuideLabel(column)}</dt>
                  <dd className="t-ui text-ink-2">{column.note}</dd>
                </div>
              ))}
            </dl>
            {group.extra ? <p className="border-t border-subtle pt-2.5 t-ui text-ink-2">{group.extra}</p> : null}
          </section>
        ))}
      </div>
    </section>
  );
}
