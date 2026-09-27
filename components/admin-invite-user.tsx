"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { LocationFields } from "@/components/location-fields";
import { normalizePeruRegion } from "@/lib/location";

type InviteAccountType = "seller" | "store_owner";

type InviteResult = {
  email: string;
  accountType: InviteAccountType;
  finalInvitePath: string;
  fullName: string;
  storeName: string;
  notes: string;
};

type InviteResponse = {
  ok: boolean;
  message: string;
  invite?: InviteResult;
};

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function InviteField({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: "email" | "text";
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
      {label}
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none placeholder:text-laria-muted focus-visible:ring-2 focus-visible:ring-laria-blue"
      />
    </label>
  );
}

export function AdminInviteUser() {
  const [accountType, setAccountType] = useState<InviteAccountType>("seller");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    feedbackRef.current?.focus();
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const regionInput = formText(formData, "region");
    const region = regionInput ? normalizePeruRegion(regionInput) : "";

    if (regionInput && !region) {
      setFailed(true);
      setMessage("Selecciona una región válida de Perú.");
      setResult(null);
      return;
    }

    setBusy(true);
    setMessage("");
    setFailed(false);
    setResult(null);

    try {
      const response = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formText(formData, "email"),
          fullName: formText(formData, "fullName"),
          phone: formText(formData, "phone"),
          accountType,
          city: formText(formData, "city"),
          region,
          storeName: formText(formData, "storeName"),
          notes: formText(formData, "notes"),
        }),
      });
      const payload = (await response.json().catch(() => ({
        ok: false,
        message: "No se pudo procesar la respuesta del servidor.",
      }))) as InviteResponse;

      setFailed(!response.ok || !payload.ok);
      setMessage(payload.message);
      if (response.ok && payload.ok) {
        setResult(payload.invite ?? null);
        form.reset();
        setAccountType("seller");
      }
    } catch {
      setFailed(true);
      setMessage("No pudimos enviar la invitación. Revisa la conexión y vuelve a intentar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-laria-fog bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-blue">Acceso</p>
        <h2 className="mt-1 text-xl font-black text-laria-ink">Invitar usuario</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-laria-text-soft">
          Envía el flujo de activación existente para una cuenta Particular o Store Owner. Laria no crea ni muestra contraseñas temporales.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <InviteField label="Correo" name="email" type="email" required placeholder="persona@email.com" />
        <InviteField label="Nombre completo" name="fullName" required placeholder="Nombre de contacto" />
        <InviteField label="WhatsApp" name="phone" required placeholder="+51 999 999 999" />
        <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
          Tipo de cuenta
          <select
            value={accountType}
            onChange={(event) => setAccountType(event.target.value as InviteAccountType)}
            className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-sm font-semibold text-laria-ink outline-none focus-visible:ring-2 focus-visible:ring-laria-blue"
          >
            <option value="seller">Particular</option>
            <option value="store_owner">Store Owner</option>
          </select>
        </label>
        <LocationFields required={false} />
        {accountType === "store_owner" ? (
          <InviteField label="Nombre de tienda" name="storeName" placeholder="Nombre comercial" />
        ) : null}
        <label className="grid gap-2 text-sm font-bold text-laria-text-soft lg:col-span-2">
          Notas internas
          <textarea
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="Origen del contacto o seguimiento pendiente"
            className="rounded-md border border-laria-steel bg-white px-3 py-2 text-sm font-semibold text-laria-ink outline-none placeholder:text-laria-muted focus-visible:ring-2 focus-visible:ring-laria-blue"
          />
        </label>

        <div className="grid gap-3 lg:col-span-2">
          {message ? (
            <div
              ref={feedbackRef}
              tabIndex={-1}
              role={failed ? "alert" : "status"}
              className={failed
                ? "rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800 outline-none focus-visible:ring-2 focus-visible:ring-laria-blue"
                : "rounded-md border border-laria-blue/25 bg-laria-blue/10 p-3 text-sm font-bold text-laria-ink outline-none focus-visible:ring-2 focus-visible:ring-laria-blue"}
            >
              <p>{message}</p>
              {result ? (
                <div className="mt-2 font-medium leading-6 text-laria-text-soft">
                  <p>{result.fullName} · {result.email}</p>
                  <p>Tipo: {result.accountType === "seller" ? "Particular" : "Store Owner"}</p>
                  <p>Destino: {result.finalInvitePath}</p>
                  {result.storeName ? <p>Tienda: {result.storeName}</p> : null}
                  {result.notes ? <p>Notas: {result.notes}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="submit" disabled={busy} className="laria-button-secondary min-h-11 w-fit px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Enviando…" : "Enviar invitación"}
          </button>
        </div>
      </form>
    </section>
  );
}
