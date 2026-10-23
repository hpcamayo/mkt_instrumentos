"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LocationFields } from "@/components/location-fields";
import { profileFieldErrors } from "@/lib/form-validation";
import { PageNotice } from "@/components/page-notice";
import { saveOptionalSellerProfile, upsertSellerProfile, upsertStoreOwnerProfile } from "@/lib/auth/profile";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";

export function ProfileEditForm({
  userId,
  profile,
  accountType = "seller",
}: {
  userId: string;
  profile: { fullName: string; phone: string; city: string; region: string };
  accountType?: "seller" | "store_owner";
}) {
  const router = useRouter();
  const [validation, errorSummary] = useFormErrors("perfil", "guardar tu perfil");
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // auth-02: a Particular may leave WhatsApp and city empty, unless they came here to publish.
  const contactOptional = accountType === "seller" && searchParams.get("next") !== "/mi-cuenta/publicar";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const profileInput = {
      fullName: String(data.get("fullName") ?? ""), phone: String(data.get("phone") ?? ""),
      city: String(data.get("city") ?? ""), region: String(data.get("region") ?? ""),
    };
    setMessage("");
    if (!validation.validate(event.currentTarget, profileFieldErrors(profileInput, contactOptional))) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("No se pudo conectar con Laria.");
      return;
    }
    setBusy(true);
    setMessage("");
    const saveProfile = accountType === "store_owner" ? upsertStoreOwnerProfile : contactOptional ? saveOptionalSellerProfile : upsertSellerProfile;
    const result = await saveProfile(supabase, userId, {
      fullName: String(data.get("fullName") ?? ""),
      phone: String(data.get("phone") ?? ""),
      city: String(data.get("city") ?? ""),
      region: String(data.get("region") ?? ""),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const next = getSafeAuthRedirect(searchParams.get("next"), "/mi-cuenta");
    router.push(next);
    router.refresh();
  }

  return (
    <form ref={validation.formRef} noValidate onSubmit={handleSubmit} onChange={validation.onChange} className="grid gap-5">
      {errorSummary}
      <Field id="perfil-full-name" error={validation.errorFor("fullName")} label="Nombre completo">
        <Input name="fullName" required defaultValue={profile.fullName} autoComplete="name" />
      </Field>
      <Field id="perfil-phone" error={validation.errorFor("phone")} label="WhatsApp" optional={contactOptional} hint={contactOptional ? "Lo pedimos recién cuando publiques: es el número al que te escribirán los compradores." : undefined}>
        <PhoneInput name="phone" required={!contactOptional} defaultValue={profile.phone} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <LocationFields idPrefix="perfil" required={!contactOptional} cityError={validation.errorFor("city")} regionError={validation.errorFor("region")} defaultCity={profile.city} defaultRegion={profile.region} />
      </div>
      {message ? <PageNotice kind="error" message={message} /> : null}
      <Button type="submit" block className="sm:w-auto sm:justify-self-start" loading={busy} loadingLabel="Guardando…">Guardar perfil</Button>
    </form>
  );
}
