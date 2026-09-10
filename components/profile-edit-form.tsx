"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LocationFields } from "@/components/location-fields";
import { upsertSellerProfile } from "@/lib/auth/profile";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export function ProfileEditForm({
  userId,
  profile,
}: {
  userId: string;
  profile: { fullName: string; phone: string; city: string; region: string };
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
    const result = await upsertSellerProfile(supabase, userId, {
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
      <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
        Nombre completo
        <input name="fullName" required defaultValue={profile.fullName} autoComplete="name" className="h-11 rounded-md border border-laria-steel px-3 text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" />
      </label>
      <label className="grid gap-2 text-sm font-bold text-laria-text-soft">
        WhatsApp
        <input name="phone" required defaultValue={profile.phone} inputMode="tel" autoComplete="tel" className="h-11 rounded-md border border-laria-steel px-3 text-laria-ink outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <LocationFields defaultCity={profile.city} defaultRegion={profile.region} />
      </div>
      {message ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p> : null}
      <button type="submit" disabled={busy} className="laria-button-primary min-h-12 w-full px-5 py-3 text-sm sm:w-auto">{busy ? "Guardando..." : "Guardar perfil"}</button>
    </form>
  );
}
