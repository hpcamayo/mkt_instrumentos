// Feature ideas, store-locations batch, run-03 "Boleta electrónica" (docs/feature-ideas/store-locations.md). The pure
// half of the Nubefact connection: amounts, the JSON the provider takes (its API v1, "generar_comprobante",
// "consultar_comprobante" and "generar_anulacion") and how its answers are read. No network here; the server half is
// lib/einvoice/server.ts. Unit-tested in tests/store-locations.test.cjs.

export type ReceiptKind = "boleta" | "factura";
export type IgvAffectation = "gravado" | "exonerado" | "inafecto";
export type CustomerDocType = "none" | "dni" | "ruc" | "ce" | "pasaporte";

export type ReceiptLine = { item_id: string; sku: string; description: string; quantity: number; unit_price_cents: number };

export type ReceiptRecord = {
  id: string;
  kind: ReceiptKind;
  series: string;
  number: number;
  status: "pending" | "accepted" | "rejected" | "error" | "void_pending" | "voided";
  customer_doc_type: CustomerDocType;
  customer_doc_number: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_email: string | null;
  lines: ReceiptLine[];
  igv_affectation: IgvAffectation;
  total_cents: number;
  issue_date: string;
  attempts: number;
  provider_link: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  cdr_url: string | null;
  sunat_accepted: boolean | null;
  sunat_description: string | null;
  error_message: string | null;
  void_reason: string | null;
  voided_at: string | null;
  location_id: string | null;
  sale_key: string;
  created_at: string;
};

export const IGV_RATE_PERCENT = 18;
// SUNAT: a boleta of S/ 700 or more must identify the customer.
export const BOLETA_ID_THRESHOLD_CENTS = 70_000;

export const NUBEFACT_URL = /^https:\/\/api\.nubefact\.com\/api\/v1\/[A-Za-z0-9_-]{8,80}$/;
export const NUBEFACT_TOKEN = /^[A-Za-z0-9]{20,200}$/;

const DOC_TYPE_CODES: Record<CustomerDocType, string> = { none: "-", dni: "1", ruc: "6", ce: "4", pasaporte: "7" };
const IGV_TYPE_CODES: Record<IgvAffectation, number> = { gravado: 1, exonerado: 8, inafecto: 9 };

const money = (cents: number) => Math.round(cents) / 100;

export type LineAmounts = { quantity: number; unitPrice: number; unitValue: number; subtotal: number; igv: number; total: number };
export type ReceiptAmounts = { lines: LineAmounts[]; taxable: number; exempt: number; unaffected: number; igv: number; total: number };

// Prices in Laria include IGV. For "gravado" each line's value without IGV is total / 1.18 rounded to the céntimo and
// the IGV is the rest, so the lines add up exactly to the totals the provider checks.
export function receiptAmounts(lines: Pick<ReceiptLine, "quantity" | "unit_price_cents">[], affectation: IgvAffectation): ReceiptAmounts {
  const computed = lines.map((line) => {
    const totalCents = line.unit_price_cents * line.quantity;
    const subtotalCents = affectation === "gravado" ? Math.round((totalCents * 100) / (100 + IGV_RATE_PERCENT)) : totalCents;
    const unitValue = affectation === "gravado" ? Number((line.unit_price_cents / 100 / (1 + IGV_RATE_PERCENT / 100)).toFixed(10)) : money(line.unit_price_cents);
    return {
      quantity: line.quantity,
      unitPrice: money(line.unit_price_cents),
      unitValue,
      subtotalCents,
      igvCents: totalCents - subtotalCents,
      totalCents,
    };
  });
  const sum = (key: "subtotalCents" | "igvCents" | "totalCents") => computed.reduce((acc, line) => acc + line[key], 0);
  const subtotal = sum("subtotalCents");
  return {
    lines: computed.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, unitValue: line.unitValue, subtotal: money(line.subtotalCents), igv: money(line.igvCents), total: money(line.totalCents) })),
    taxable: affectation === "gravado" ? money(subtotal) : 0,
    exempt: affectation === "exonerado" ? money(subtotal) : 0,
    unaffected: affectation === "inafecto" ? money(subtotal) : 0,
    igv: money(sum("igvCents")),
    total: money(sum("totalCents")),
  };
}

// 2026-11-03 → 03-11-2026, the date format the provider takes.
export function providerDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
}

const blankIfZero = (value: number) => (value > 0 ? value : "");

export function issuePayload(receipt: ReceiptRecord, { emailCustomer }: { emailCustomer: boolean }) {
  const amounts = receiptAmounts(receipt.lines, receipt.igv_affectation);
  const igvType = IGV_TYPE_CODES[receipt.igv_affectation];
  return {
    operacion: "generar_comprobante",
    tipo_de_comprobante: receipt.kind === "factura" ? 1 : 2,
    serie: receipt.series,
    numero: receipt.number,
    sunat_transaction: 1,
    cliente_tipo_de_documento: DOC_TYPE_CODES[receipt.customer_doc_type],
    cliente_numero_de_documento: receipt.customer_doc_number ?? "-",
    cliente_denominacion: receipt.customer_name ?? "Clientes varios",
    cliente_direccion: receipt.customer_address ?? "",
    cliente_email: receipt.customer_email ?? "",
    cliente_email_1: "",
    cliente_email_2: "",
    fecha_de_emision: providerDate(receipt.issue_date),
    fecha_de_vencimiento: "",
    moneda: 1,
    tipo_de_cambio: "",
    porcentaje_de_igv: receipt.igv_affectation === "gravado" ? IGV_RATE_PERCENT : 0,
    descuento_global: "",
    total_descuento: "",
    total_anticipo: "",
    total_gravada: blankIfZero(amounts.taxable),
    total_inafecta: blankIfZero(amounts.unaffected),
    total_exonerada: blankIfZero(amounts.exempt),
    total_igv: amounts.igv,
    total_gratuita: "",
    total_otros_cargos: "",
    total: amounts.total,
    percepcion_tipo: "",
    percepcion_base_imponible: "",
    total_percepcion: "",
    total_incluido_percepcion: "",
    detraccion: false,
    observaciones: "",
    documento_que_se_modifica_tipo: "",
    documento_que_se_modifica_serie: "",
    documento_que_se_modifica_numero: "",
    tipo_de_nota_de_credito: "",
    tipo_de_nota_de_debito: "",
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: Boolean(emailCustomer && receipt.customer_email),
    codigo_unico: receipt.id,
    condiciones_de_pago: "",
    medio_de_pago: "",
    placa_vehiculo: "",
    orden_compra_servicio: "",
    tabla_personalizada_codigo: "",
    formato_de_pdf: "",
    items: receipt.lines.map((line, index) => ({
      unidad_de_medida: "NIU",
      codigo: line.sku.slice(0, 30),
      descripcion: line.description.slice(0, 250),
      cantidad: line.quantity,
      valor_unitario: amounts.lines[index].unitValue,
      precio_unitario: amounts.lines[index].unitPrice,
      descuento: "",
      subtotal: amounts.lines[index].subtotal,
      tipo_de_igv: igvType,
      igv: amounts.lines[index].igv,
      total: amounts.lines[index].total,
      anticipo_regularizacion: false,
      anticipo_documento_serie: "",
      anticipo_documento_numero: "",
    })),
  };
}

export function lookupPayload(receipt: Pick<ReceiptRecord, "kind" | "series" | "number">) {
  return { operacion: "consultar_comprobante", tipo_de_comprobante: receipt.kind === "factura" ? 1 : 2, serie: receipt.series, numero: receipt.number };
}

export function voidPayload(receipt: Pick<ReceiptRecord, "kind" | "series" | "number" | "id">, reason: string) {
  return {
    operacion: "generar_anulacion",
    tipo_de_comprobante: receipt.kind === "factura" ? 1 : 2,
    serie: receipt.series,
    numero: receipt.number,
    motivo: reason.slice(0, 100),
    codigo_unico: receipt.id,
  };
}

// The provider's documented error codes that matter here.
export const NUBEFACT_CODES = {
  badToken: 10,
  badRoute: 11,
  alreadyExists: 23,
  notFound: 24,
  suspended: [50, 51],
} as const;

export type ProviderOutcome =
  | { kind: "issued"; link: string | null; pdf: string | null; xml: string | null; cdr: string | null; sunatAccepted: boolean | null; sunatDescription: string | null }
  | { kind: "refused"; code: number | null; message: string }
  | { kind: "credentials"; message: string }
  | { kind: "exists" }
  | { kind: "not_found" }
  | { kind: "unreachable"; message: string };

const https = (value: unknown) => (typeof value === "string" && /^https:\/\/[A-Za-z0-9.-]+(\/\S*)?$/.test(value) ? value : null);
const text = (value: unknown, max = 500) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

// Reads an answer: HTTP status plus the JSON body (or null when the body was not JSON).
export function readProviderAnswer(status: number, body: unknown): ProviderOutcome {
  const data = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (status === 401 || status === 403) return { kind: "credentials", message: "Nubefact no aceptó la ruta o el token." };
  if (!data) return { kind: "unreachable", message: status >= 500 ? "Nubefact no respondió bien." : "Respuesta inesperada de Nubefact." };
  if (data.errors !== undefined && data.errors !== null && data.errors !== "") {
    const code = typeof data.codigo === "number" ? data.codigo : Number.parseInt(String(data.codigo ?? ""), 10) || null;
    const message = text(Array.isArray(data.errors) ? data.errors.join(" ") : data.errors) ?? "Nubefact rechazó el comprobante.";
    if (code === NUBEFACT_CODES.badToken || code === NUBEFACT_CODES.badRoute) return { kind: "credentials", message };
    if (code === NUBEFACT_CODES.alreadyExists) return { kind: "exists" };
    if (code === NUBEFACT_CODES.notFound) return { kind: "not_found" };
    if (code !== null && (NUBEFACT_CODES.suspended as readonly number[]).includes(code)) return { kind: "credentials", message };
    if (status >= 500 || code === 40) return { kind: "unreachable", message };
    return { kind: "refused", code, message };
  }
  if (status >= 500) return { kind: "unreachable", message: "Nubefact no respondió bien." };
  if (status >= 400) return { kind: "refused", code: null, message: "Nubefact rechazó la solicitud." };
  return {
    kind: "issued",
    link: https(data.enlace),
    pdf: https(data.enlace_del_pdf),
    xml: https(data.enlace_del_xml),
    cdr: https(data.enlace_del_cdr),
    sunatAccepted: typeof data.aceptada_por_sunat === "boolean" ? data.aceptada_por_sunat : null,
    sunatDescription: text(data.sunat_description) ?? text(data.sunat_note) ?? text(data.sunat_soap_error),
  };
}

// ------------------------------------------------------------------ copy shared by the screens

export function receiptCode(receipt: Pick<ReceiptRecord, "series" | "number">) {
  return `${receipt.series}-${receipt.number}`;
}

export const KIND_LABELS: Record<ReceiptKind, string> = { boleta: "Boleta", factura: "Factura" };

export const DOC_TYPE_LABELS: Record<CustomerDocType, string> = {
  none: "Sin documento",
  dni: "DNI",
  ruc: "RUC",
  ce: "Carné de extranjería",
  pasaporte: "Pasaporte",
};

export function receiptStatus(receipt: Pick<ReceiptRecord, "status" | "sunat_accepted">): { label: string; tone: "accent" | "warning" | "danger" | "neutral" } {
  switch (receipt.status) {
    case "accepted":
      return receipt.sunat_accepted === false || receipt.sunat_accepted === null
        ? { label: "Emitida · SUNAT en proceso", tone: "accent" }
        : { label: "Aceptada por SUNAT", tone: "accent" };
    case "pending":
      return { label: "Por enviar", tone: "warning" };
    case "error":
      return { label: "No se pudo enviar", tone: "danger" };
    case "rejected":
      return { label: "Rechazada", tone: "danger" };
    case "void_pending":
      return { label: "Anulación en proceso", tone: "warning" };
    case "voided":
      return { label: "Anulada", tone: "neutral" };
  }
}

export function canRetry(receipt: Pick<ReceiptRecord, "status">) {
  return receipt.status === "pending" || receipt.status === "error";
}

// A copy for the customer by WhatsApp: the store's own phone opens WhatsApp with the PDF link; Laria sends nothing.
export function receiptWhatsAppHref(phone: string, receipt: Pick<ReceiptRecord, "kind" | "series" | "number" | "pdf_url" | "provider_link">, storeName: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length === 9 && digits.startsWith("9") ? `51${digits}` : digits;
  if (!/^\d{11,15}$/.test(number)) return null;
  const link = receipt.pdf_url ?? receipt.provider_link;
  if (!link) return null;
  const message = `Hola, te enviamos tu ${KIND_LABELS[receipt.kind].toLowerCase()} ${receiptCode(receipt)} de ${storeName}: ${link}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// Mostrador's receipt form, checked before the sale is sent, with the same rules the database applies.
export type ReceiptRequest = {
  kind: ReceiptKind;
  customer: { doc_type: CustomerDocType; doc_number?: string; name?: string; address?: string; email?: string };
  lines?: { item_id: string; unit_price_cents: number | null }[];
};

export function receiptProblem(request: ReceiptRequest, totalCents: number | null): string | null {
  const { customer } = request;
  const doc = (customer.doc_number ?? "").replace(/\s/g, "").toUpperCase();
  const name = (customer.name ?? "").trim();
  if (request.kind === "factura" && (customer.doc_type !== "ruc" || !name)) return "La factura necesita el RUC y la razón social del cliente.";
  if (customer.doc_type === "dni" && !/^\d{8}$/.test(doc)) return "El DNI tiene 8 dígitos.";
  if (customer.doc_type === "ruc" && !/^(10|15|17|20)\d{9}$/.test(doc)) return "El RUC tiene 11 dígitos y empieza con 10, 15, 17 o 20.";
  if ((customer.doc_type === "ce" || customer.doc_type === "pasaporte") && !/^[A-Z0-9-]{4,15}$/.test(doc)) return "Revisa el número de documento.";
  if (customer.doc_type !== "none" && name.length < 2) return "Escribe el nombre del cliente.";
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email.trim())) return "Revisa el correo del cliente.";
  if (request.kind === "boleta" && customer.doc_type === "none" && totalCents !== null && totalCents >= BOLETA_ID_THRESHOLD_CENTS) {
    return "Para una boleta de S/ 700 o más, escribe el documento y el nombre del cliente.";
  }
  if (request.lines?.some((line) => line.unit_price_cents === null || line.unit_price_cents <= 0)) return "Escribe el precio de cada SKU.";
  return null;
}
