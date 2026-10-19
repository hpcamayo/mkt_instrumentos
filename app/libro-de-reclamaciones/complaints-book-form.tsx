"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useFormErrors } from "@/components/use-form-errors";
import {
  COMPLAINT_TYPE_DEFINITIONS,
  COMPLAINT_TYPE_LABELS,
  ComplaintsBookNotes,
  FiledSheet,
  ITEM_TYPE_LABELS,
} from "@/app/libro-de-reclamaciones/complaints-book-sheet";
import {
  COMPLAINTS_BOOK_LIMITS,
  DOCUMENT_TYPES,
  complaintsBookErrorMessage,
  complaintsBookErrors,
  complaintsBookRpcArgs,
  toComplaintsBookEntry,
  type ComplaintsBookEntry,
  type ComplaintsBookInput,
} from "@/lib/complaints-book";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// PENDIENTE DE REVISIÓN LEGAL ANTES DE PRODUCCIÓN (see app/libro-de-reclamaciones/page.tsx).
// The sheet is filed through submit_complaints_book_entry, which assigns the correlative number and date and
// enforces the same checks as complaintsBookErrors. No e-mail copy is sent yet: the visitor prints or saves the sheet.

const PREFIX = "libro";
const id = (name: string) => `${PREFIX}-${name}`;

type Filed = { sheetNumber: string; filedAt: string; entry: ComplaintsBookEntry };

function readInput(form: HTMLFormElement): ComplaintsBookInput {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? "");
  return {
    consumerName: text("consumerName"),
    documentType: text("documentType"),
    documentNumber: text("documentNumber"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    isMinor: data.get("isMinor") === "on",
    guardianName: text("guardianName"),
    itemType: text("itemType"),
    claimedAmount: text("claimedAmount"),
    itemDescription: text("itemDescription"),
    listingSlug: text("listingSlug"),
    complaintType: text("complaintType"),
    detail: text("detail"),
    request: text("request"),
    declaration: data.get("declaration") === "on",
  };
}

export function ComplaintsBookForm({ listingSlug, initialItemDescription }: { listingSlug: string; initialItemDescription: string }) {
  const [errors, summary] = useFormErrors(PREFIX, "registrar la hoja");
  const [documentType, setDocumentType] = useState("dni");
  const [isMinor, setIsMinor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [filed, setFiled] = useState<Filed | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filed) return;
    const sheet = sheetRef.current?.querySelector<HTMLElement>("#hoja-libro");
    sheet?.focus({ preventScroll: true });
    sheet?.scrollIntoView({ block: "start" });
  }, [filed]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const input = readInput(form);
    setFailure("");
    if (!errors.validate(form, complaintsBookErrors(input))) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFailure(complaintsBookErrorMessage(""));
      return;
    }
    const entry = toComplaintsBookEntry(input);
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_complaints_book_entry", complaintsBookRpcArgs(entry));
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) {
      setFailure(complaintsBookErrorMessage(error?.message ?? ""));
      return;
    }
    setFiled({ sheetNumber: row.sheet_number, filedAt: row.filed_at, entry });
  }

  if (filed) {
    return (
      <div ref={sheetRef} className="grid gap-4">
        <Notice tone="success" title={`Registramos tu hoja N.° ${filed.sheetNumber}`}>
          <p>Guarda o imprime esta hoja: es tu constancia. Te responderemos al correo {filed.entry.email}.</p>
        </Notice>
        <FiledSheet
          {...filed}
          actions={
            <>
              <Button type="button" variant="primary" onClick={() => window.print()}>
                <Printer aria-hidden />
                Imprimir o guardar como PDF
              </Button>
              <Button type="button" variant="secondary" onClick={() => setFiled(null)}>
                Registrar otra hoja
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const documentHint = DOCUMENT_TYPES.find((type) => type.value === documentType)?.hint;
  return (
    <form noValidate onSubmit={submit} onChange={errors.onChange} className="grid gap-7" aria-describedby="libro-ayuda">
      <p id="libro-ayuda" className="t-ui text-ink-2">Todos los datos son obligatorios salvo los marcados como opcionales.</p>
      {summary}
      <input type="hidden" name="listingSlug" value={listingSlug} />

      <FormSection title="1. Identificación del consumidor reclamante">
        <Field id={id("consumerName")} label="Nombre completo" error={errors.errorFor("consumerName")}>
          <Input name="consumerName" autoComplete="name" required maxLength={COMPLAINTS_BOOK_LIMITS.consumerName[1]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field id={id("documentType")} label="Tipo de documento" error={errors.errorFor("documentType")}>
            <Select name="documentType" value={documentType} onChange={(event) => setDocumentType(event.target.value)} required>
              {DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </Select>
          </Field>
          <Field id={id("documentNumber")} label="Número de documento" hint={documentHint} error={errors.errorFor("documentNumber")}>
            <Input name="documentNumber" required maxLength={14} autoComplete="off" inputMode={documentType === "dni" || documentType === "ruc" ? "numeric" : "text"} />
          </Field>
        </div>
        <Field id={id("address")} label="Domicilio" hint="Dirección, distrito, provincia y departamento." error={errors.errorFor("address")}>
          <Input name="address" autoComplete="street-address" required maxLength={COMPLAINTS_BOOK_LIMITS.address[1]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field id={id("phone")} label="Teléfono" error={errors.errorFor("phone")}>
            <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" required maxLength={20} />
          </Field>
          <Field id={id("email")} label="Correo electrónico" hint="Aquí recibirás la respuesta." error={errors.errorFor("email")}>
            <Input name="email" type="email" autoComplete="email" required maxLength={254} />
          </Field>
        </div>
        <Checkbox
          name="isMinor"
          checked={isMinor}
          onChange={(event) => setIsMinor(event.target.checked)}
          label="Soy menor de edad"
          description="Si eres menor de edad, la hoja la registra tu padre, madre o apoderado."
        />
        {isMinor ? (
          <Field id={id("guardianName")} label="Nombre del padre, madre o apoderado" error={errors.errorFor("guardianName")}>
            <Input name="guardianName" required maxLength={COMPLAINTS_BOOK_LIMITS.guardianName[1]} />
          </Field>
        ) : null}
      </FormSection>

      <FormSection title="2. Identificación del bien contratado">
        <ChoiceGroup name="itemType" legend="¿Es un producto o un servicio?" error={errors.errorFor("itemType")}>
          {(Object.keys(ITEM_TYPE_LABELS) as (keyof typeof ITEM_TYPE_LABELS)[]).map((value, index) => (
            <Radio key={value} id={index === 0 ? id("itemType") : undefined} name="itemType" value={value} required label={ITEM_TYPE_LABELS[value]} />
          ))}
        </ChoiceGroup>
        <Field id={id("claimedAmount")} label="Monto reclamado en soles" optional hint="Solo si tu reclamo es por un monto, por ejemplo 1500.50." error={errors.errorFor("claimedAmount")}>
          <Input name="claimedAmount" inputMode="decimal" autoComplete="off" maxLength={14} />
        </Field>
        <Field id={id("itemDescription")} label="Descripción" error={errors.errorFor("itemDescription")}>
          <Textarea name="itemDescription" required rows={3} defaultValue={initialItemDescription} maxLength={COMPLAINTS_BOOK_LIMITS.itemDescription[1]} />
        </Field>
      </FormSection>

      <FormSection title="3. Detalle de la reclamación y pedido del consumidor">
        <ChoiceGroup name="complaintType" legend="¿Es un reclamo o una queja?" error={errors.errorFor("complaintType")}>
          {(Object.keys(COMPLAINT_TYPE_LABELS) as (keyof typeof COMPLAINT_TYPE_LABELS)[]).map((value, index) => (
            <Radio
              key={value}
              id={index === 0 ? id("complaintType") : undefined}
              name="complaintType"
              value={value}
              required
              label={COMPLAINT_TYPE_LABELS[value]}
              description={COMPLAINT_TYPE_DEFINITIONS[value]}
            />
          ))}
        </ChoiceGroup>
        <Field id={id("detail")} label="Detalle" hint="Qué pasó, cuándo y con quién." error={errors.errorFor("detail")}>
          <Textarea name="detail" required rows={5} maxLength={COMPLAINTS_BOOK_LIMITS.detail[1]} />
        </Field>
        <Field id={id("request")} label="Pedido" hint="Qué solicitas para resolverlo." error={errors.errorFor("request")}>
          <Textarea name="request" required rows={3} maxLength={COMPLAINTS_BOOK_LIMITS.request[1]} />
        </Field>
      </FormSection>

      <FormSection title="4. Información importante">
        <ComplaintsBookNotes />
        <div>
          <Checkbox
            id={id("declaration")}
            name="declaration"
            required
            data-error-label="Declaración"
            aria-describedby={errors.errorFor("declaration") ? id("declaration-error") : undefined}
            aria-invalid={errors.errorFor("declaration") ? true : undefined}
            label="Declaro que los datos de esta hoja son verdaderos."
            description={<>Laria usará estos datos solo para atender tu reclamo o queja, según la <Link href="/privacidad" className="link">Política de privacidad</Link>.</>}
          />
          <FieldError id={id("declaration-error")} message={errors.errorFor("declaration")} />
        </div>
      </FormSection>

      {failure ? <Notice tone="danger">{failure}</Notice> : null}
      <div>
        <Button type="submit" variant="primary" loading={busy} loadingLabel="Registrando…">
          Enviar hoja de reclamación
        </Button>
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-4">
      <h2 className="t-section text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ChoiceGroup({ name, legend, error, children }: { name: string; legend: string; error?: string; children: ReactNode }) {
  const errorId = error ? id(`${name}-error`) : undefined;
  return (
    <fieldset className="grid min-w-0 gap-0" aria-describedby={errorId} aria-invalid={error ? true : undefined}>
      <legend className="t-ui font-semibold text-ink">{legend}</legend>
      {children}
      <FieldError id={id(`${name}-error`)} message={error} />
    </fieldset>
  );
}

function FieldError({ id: errorId, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId} className="flex items-start gap-1.5 t-ui font-semibold text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
