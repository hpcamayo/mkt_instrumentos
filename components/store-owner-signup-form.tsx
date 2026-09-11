"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { LocationFields } from "@/components/location-fields";
import {
  STORE_OWNER_ACCOUNT_TYPE,
  upsertStoreOwnerProfile,
  validateSellerProfileInput,
} from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type State = "checking" | "idle" | "submitting" | "sent" | "error";

export function StoreOwnerSignupForm() {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("error");
      setMessage("Supabase no está configurado.");
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/registrar-tienda");
        router.refresh();
      } else {
        setState("idle");
      }
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const validated = validateSellerProfileInput({
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
    });
    if (!validated.ok) {
      setState("error");
      setMessage(validated.message);
      return;
    }
    if (!email || password.length < 6) {
      setState("error");
      setMessage("Ingresa un correo y una contraseña de al menos 6 caracteres.");
      return;
    }
    const available = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then(async (response) => {
      const result = await response.json().catch(() => null);
      return response.ok && result?.ok && result.available;
    });
    if (!available) {
      setState("error");
      setMessage("Ese correo ya está registrado o no pudo verificarse. Usa un correo exclusivo para la Tienda.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const profile = validated.profile;
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/mi-cuenta?confirmed=1")}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          account_type: STORE_OWNER_ACCOUNT_TYPE,
          full_name: profile.fullName,
          phone: profile.phone,
          city: profile.city,
          region: profile.region,
        },
      },
    });
    if (error || data.user?.identities?.length === 0) {
      setState("error");
      setMessage("No se pudo crear la cuenta. Usa un correo exclusivo para la Tienda e intenta nuevamente.");
      return;
    }
    if (data.session && data.user) {
      const saved = await upsertStoreOwnerProfile(supabase, data.user.id, profile);
      if (!saved.ok) {
        setState("error");
        setMessage(saved.message);
        return;
      }
      router.push("/registrar-tienda");
      router.refresh();
      return;
    }
    setState("sent");
    setMessage("Revisa tu correo para confirmar la cuenta de Tienda. El enlace te llevará a Mi cuenta.");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la persona responsable" name="fullName" autoComplete="name" />
        <Field label="Correo exclusivo de la cuenta" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="new-password" minLength={6} />
        <Field label="WhatsApp de contacto" name="phone" type="tel" autoComplete="tel" />
        <LocationFields />
      </div>
      {message ? (
        <div role="status" className={`rounded-md p-3 text-sm ${state === "sent" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {message}
        </div>
      ) : null}
      <button type="submit" disabled={state === "checking" || state === "submitting"} className="laria-button-primary min-h-12 px-5 py-3 text-sm">
        {state === "submitting" ? "Creando cuenta..." : "Crear cuenta de Tienda"}
      </button>
      <p className="text-center text-sm text-laria-text-soft">
        ¿Ya tienes una cuenta de Tienda? <Link href="/login?next=/registrar-tienda" className="font-black text-laria-blue">Ingresar</Link>
      </p>
    </form>
  );
}

function Field({ label, ...props }: { label: string; name: string; type?: string; autoComplete?: string; minLength?: number }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-laria-ink">
      {label}
      <input required className="h-11 rounded-md border border-laria-steel px-3 outline-none focus:border-laria-blue focus:ring-2 focus:ring-laria-blue/20" {...props} />
    </label>
  );
}
