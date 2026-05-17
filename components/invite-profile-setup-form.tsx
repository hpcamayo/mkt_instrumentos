"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LocationFields } from "@/components/location-fields";
import {
  upsertSellerProfile,
  upsertStoreOwnerProfile,
} from "@/lib/auth/profile";
import { normalizePeruRegion } from "@/lib/location";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type InviteMode = "seller" | "store";
type FormState = "idle" | "submitting" | "error";

type InviteProfileSetupFormProps = {
  mode: InviteMode;
  email: string | null;
  initialValues: {
    fullName: string;
    phone: string;
    city: string;
    region: string;
  };
};

const modeContent = {
  seller: {
    accountLabel: "Particular",
    nameLabel: "Nombre completo",
    submitLabel: "Continuar para publicar",
    successPath: "/vender",
  },
  store: {
    accountLabel: "Tienda",
    nameLabel: "Persona de contacto",
    submitLabel: "Continuar a solicitud de tienda",
    successPath: "/registrar-tienda",
  },
} satisfies Record<
  InviteMode,
  {
    accountLabel: string;
    nameLabel: string;
    submitLabel: string;
    successPath: string;
  }
>;

export function InviteProfileSetupForm({
  mode,
  email,
  initialValues,
}: InviteProfileSetupFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const content = modeContent[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const region = normalizePeruRegion(
      String(formData.get("region") ?? "").trim(),
    );
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setState("error");
      setMessage("Supabase no esta configurado.");
      return;
    }

    if (!fullName || !phone || !city) {
      setState("error");
      setMessage("Completa todos los campos para continuar.");
      return;
    }

    if (!region) {
      setState("error");
      setMessage("Selecciona una region valida de Peru.");
      return;
    }

    const { data, error: userError } = await supabase.auth.getUser();

    if (userError || !data.user) {
      setState("error");
      setMessage("Tu sesion expiro. Vuelve a abrir el enlace de invitacion.");
      return;
    }

    const result =
      mode === "seller"
        ? await upsertSellerProfile(supabase, data.user.id, {
            fullName,
            phone,
            city,
            region,
          })
        : await upsertStoreOwnerProfile(supabase, data.user.id, {
            fullName,
            phone,
            city,
            region,
          });

    if (!result.ok) {
      setState("error");
      setMessage(result.message);
      return;
    }

    router.push(content.successPath);
    router.refresh();
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span className="font-semibold text-ink">Tipo de cuenta:</span>{" "}
        {content.accountLabel}
        {email ? (
          <>
            {" "}
            <span className="text-slate-400">/</span> {email}
          </>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-ink">
            {content.nameLabel}
          </span>
          <input
            name="fullName"
            required
            autoComplete="name"
            defaultValue={initialValues.fullName}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
            placeholder={
              mode === "store" ? "Nombre de la persona responsable" : "Tu nombre"
            }
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">WhatsApp</span>
          <input
            type="tel"
            name="phone"
            required
            autoComplete="tel"
            defaultValue={initialValues.phone}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
            placeholder="+51 999 999 999"
          />
        </label>

        <LocationFields
          defaultCity={initialValues.city}
          defaultRegion={initialValues.region}
        />
      </div>

      {message ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "submitting" ? "Guardando..." : content.submitLabel}
      </button>
    </form>
  );
}
