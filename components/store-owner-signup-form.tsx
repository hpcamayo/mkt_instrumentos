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
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type State = "checking" | "idle" | "submitting" | "sent" | "error";

export function StoreOwnerSignupForm() {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("error");
      setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/mi-cuenta");
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
      router.push("/mi-cuenta");
      router.refresh();
      return;
    }
    setState("sent");
    setMessage("Revisa tu correo para confirmar la cuenta de Tienda. El enlace te llevará a Mi cuenta.");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SignupField label="Nombre de la persona responsable" name="fullName" autoComplete="name" />
        <SignupField label="Correo exclusivo de la cuenta" name="email" type="email" autoComplete="email" />
        <SignupField label="Contraseña" name="password" type="password" autoComplete="new-password" minLength={6} />
        <SignupField label="WhatsApp de contacto" name="phone" type="tel" autoComplete="tel" />
        <LocationFields />
      </div>
      {message ? (
        <Notice tone={state === "sent" ? "success" : "warning"}>{message}</Notice>
      ) : null}
      <p className="t-meta">
        Al crear la cuenta aceptas los{" "}
        <Link href="/terminos" target="_blank" className="link font-semibold">términos y reglas del marketplace</Link> y la{" "}
        <Link href="/privacidad" target="_blank" className="link font-semibold">política de privacidad</Link>.
      </p>
      <Button type="submit" block loading={state === "checking" || state === "submitting"} loadingLabel={state === "submitting" ? "Creando cuenta..." : undefined}>
        Crear cuenta de Tienda
      </Button>
      <p className="text-center t-ui text-ink-2">
        ¿Ya tienes una cuenta de Tienda? <Link href="/login?next=/mi-cuenta" className="link font-semibold">Ingresar</Link>
      </p>
    </form>
  );
}

function SignupField({ label, ...props }: { label: string; name: string; type?: string; autoComplete?: string; minLength?: number }) {
  return (
    <Field id={`tienda-${props.name}`} label={label}>
      <Input required {...props} />
    </Field>
  );
}
