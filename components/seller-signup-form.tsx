"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { LocationFields } from "@/components/location-fields";
import {
  INDIVIDUAL_SELLER_ACCOUNT_TYPE,
  upsertSellerProfile,
  validateSellerProfileInput,
} from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type FormState =
  | "idle"
  | "loading"
  | "submitting"
  | "sent"
  | "duplicate"
  | "error";

export function SellerSignupForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState("error");
          setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
        }
        return;
      }

      const { data } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (data.user) {
        router.replace("/mi-cuenta");
        router.refresh();
        return;
      }
      setState("idle");
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const region = String(formData.get("region") ?? "");
    const password = String(formData.get("password") ?? "");
    const acceptedRules = formData.get("acceptedRules") === "on";
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setState("error");
      setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }

    const validatedProfile = validateSellerProfileInput({
      fullName,
      phone,
      city,
      region,
    });

    if (!validatedProfile.ok) {
      setState("error");
      setMessage(validatedProfile.message);
      return;
    }
    const normalizedProfile = validatedProfile.profile;

    if (!acceptedRules) {
      setState("error");
      setMessage("Debes aceptar las reglas del marketplace para continuar.");
      return;
    }

    if (!email || password.length < 6) {
      setState("error");
      setMessage("Ingresa un correo y una contraseña de al menos 6 caracteres.");
      return;
    }

    const emailCheck = await checkEmailAvailability(email);

    if (emailCheck === "exists") {
      setState("duplicate");
      setMessage(
        "Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo.",
      );
      return;
    }

    if (emailCheck === "error") {
      setState("error");
      setMessage("No pudimos verificar el correo. Intenta nuevamente.");
      return;
    }

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/mi-cuenta?confirmed=1")}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          account_type: INDIVIDUAL_SELLER_ACCOUNT_TYPE,
          full_name: normalizedProfile.fullName,
          phone: normalizedProfile.phone,
          city: normalizedProfile.city,
          region: normalizedProfile.region,
          marketplace_rules_accepted: true,
        },
      },
    });

    if (error) {
      setState("error");
      setMessage("No se pudo crear la cuenta. Revisa los datos e intenta nuevamente.");
      return;
    }

    if (data.user?.identities && data.user.identities.length === 0) {
      setState("duplicate");
      setMessage(
        "Este correo ya está registrado. Ingresa con tu cuenta o usa otro correo.",
      );
      return;
    }

    if (data.session && data.user) {
      const result = await upsertSellerProfile(supabase, data.user.id, {
        ...normalizedProfile,
      });

      if (!result.ok) {
        setState("error");
        setMessage(result.message);
        return;
      }

      router.push("/mi-cuenta?welcome=1");
      router.refresh();
      return;
    }

    setState("sent");
    setMessage(
      "Revisa tu correo para confirmar tu cuenta Particular. El enlace te llevará directamente a Mi cuenta.",
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="signup-full-name" label="Nombre completo" className="sm:col-span-2">
          <Input name="fullName" required autoComplete="name" placeholder="Tu nombre" />
        </Field>

        <Field id="signup-email" label="Correo">
          <Input type="email" name="email" required autoComplete="email" placeholder="tu@email.com" />
        </Field>

        <Field id="signup-password" label="Contraseña">
          <Input type="password" name="password" required minLength={6} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
        </Field>

        <Field id="signup-phone" label="WhatsApp">
          <Input type="tel" name="phone" required autoComplete="tel" placeholder="+51 999 999 999" />
        </Field>

        <LocationFields />
      </div>

      <label className="flex gap-3 rounded-panel bg-canvas p-3 t-ui text-ink-2">
        <input type="checkbox" name="acceptedRules" required className="mt-0.5 h-5 w-5 shrink-0 accent-ink" />
        <span>
          Acepto los{" "}
          <a href="/terminos" target="_blank" rel="noopener" className="link font-semibold">
            términos y reglas del marketplace
          </a>{" "}
          y la{" "}
          <a href="/privacidad" target="_blank" rel="noopener" className="link font-semibold">
            política de privacidad
          </a>
          , publicar información real y mantener mis publicaciones actualizadas.
          Laria no procesa pagos, no gestiona envíos ni garantiza transacciones.
        </span>
      </label>

      {message ? (
        <Notice tone={state === "sent" ? "success" : "warning"}>
          <p>{message}</p>
          {state === "duplicate" ? (
            <Link className="mt-2 inline-flex" href="/login">
              Ir a ingresar
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <Button
        type="submit"
        block
        loading={state === "loading" || state === "submitting"}
        loadingLabel={state === "submitting" ? "Creando cuenta…" : "Revisando sesión…"}
      >
        Crear cuenta Particular
      </Button>

      <p className="text-center t-ui text-ink-2">
        ¿Ya tienes cuenta?{" "}
        <Link className="link font-semibold" href="/login">
          Ingresa aquí
        </Link>
      </p>
    </form>
  );
}

async function checkEmailAvailability(email: string) {
  const response = await fetch("/api/auth/check-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; available?: boolean }
    | null;

  if (!response.ok || !result?.ok) {
    return "error" as const;
  }

  return result.available ? ("available" as const) : ("exists" as const);
}
