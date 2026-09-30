"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LocationFields } from "@/components/location-fields";
import { PageNotice } from "@/components/page-notice";
import { upsertSellerProfile, upsertStoreOwnerProfile } from "@/lib/auth/profile";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

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
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("No se pudo conectar con Laria.");
      return;
    }
    setBusy(true);
    setMessage("");
    const saveProfile = accountType === "store_owner" ? upsertStoreOwnerProfile : upsertSellerProfile;
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
    <form onSubmit={handleSubmit} className="grid gap-5">
      <Field id="perfil-full-name" label="Nombre completo">
        <Input name="fullName" required defaultValue={profile.fullName} autoComplete="name" />
      </Field>
      <Field id="perfil-phone" label="WhatsApp">
        <Input name="phone" required defaultValue={profile.phone} inputMode="tel" autoComplete="tel" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <LocationFields defaultCity={profile.city} defaultRegion={profile.region} />
      </div>
      {message ? <PageNotice kind="error" message={message} /> : null}
      <Button type="submit" block className="sm:w-auto sm:justify-self-start" loading={busy} loadingLabel="Guardando...">Guardar perfil</Button>
    </form>
  );
}
