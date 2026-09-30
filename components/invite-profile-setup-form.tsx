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
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

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
      setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }

    if (!fullName || !phone || !city) {
      setState("error");
      setMessage("Completa todos los campos para continuar.");
      return;
    }

    if (!region) {
      setState("error");
      setMessage("Selecciona una región válida de Perú.");
      return;
    }

    const { data, error: userError } = await supabase.auth.getUser();

    if (userError || !data.user) {
      setState("error");
      setMessage("Tu sesión expiró. Vuelve a abrir el enlace de invitación.");
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
      <div className="rounded-panel bg-canvas px-3 py-2 t-ui text-ink-2">
        <span className="font-semibold text-ink">Tipo de cuenta:</span>{" "}
        {content.accountLabel}
        {email ? (
          <>
            {" "}
            <span className="text-ink-3">/</span> {email}
          </>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="invite-full-name" label={content.nameLabel} className="sm:col-span-2">
          <Input
            name="fullName"
            required
            autoComplete="name"
            defaultValue={initialValues.fullName}
            placeholder={mode === "store" ? "Nombre de la persona responsable" : "Tu nombre"}
          />
        </Field>

        <Field id="invite-phone" label="WhatsApp">
          <Input type="tel" name="phone" required autoComplete="tel" defaultValue={initialValues.phone} placeholder="+51 999 999 999" />
        </Field>

        <LocationFields
          defaultCity={initialValues.city}
          defaultRegion={initialValues.region}
        />
      </div>

      {message ? <Notice tone="warning">{message}</Notice> : null}

      <Button type="submit" block loading={state === "submitting"} loadingLabel="Guardando...">
        {content.submitLabel}
      </Button>
    </form>
  );
}
