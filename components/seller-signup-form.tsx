"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  INDIVIDUAL_SELLER_ACCOUNT_TYPE,
  upsertSellerProfile,
} from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type FormState = "idle" | "loading" | "submitting" | "sent" | "error";

export function SellerSignupForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState("error");
          setMessage("Supabase no esta configurado.");
        }
        return;
      }

      const { data } = await supabase.auth.getUser();

      if (isMounted) {
        setCurrentEmail(data.user?.email ?? null);
        setState("idle");
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const region = String(formData.get("region") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const acceptedRules = formData.get("acceptedRules") === "on";
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setState("error");
      setMessage("Supabase no esta configurado.");
      return;
    }

    if (!fullName || !phone || !city || !region) {
      setState("error");
      setMessage("Completa tu nombre, WhatsApp, ciudad y region.");
      return;
    }

    if (!acceptedRules) {
      setState("error");
      setMessage("Debes aceptar las reglas del marketplace para continuar.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (userData.user) {
      const result = await upsertSellerProfile(supabase, userData.user.id, {
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

      router.push("/mi-cuenta");
      router.refresh();
      return;
    }

    if (!email || password.length < 6) {
      setState("error");
      setMessage("Ingresa un correo y una contrasena de al menos 6 caracteres.");
      return;
    }

    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/mi-cuenta`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          account_type: INDIVIDUAL_SELLER_ACCOUNT_TYPE,
          full_name: fullName,
          phone,
          city,
          region,
          marketplace_rules_accepted: true,
        },
      },
    });

    if (error) {
      setState("error");
      setMessage("No se pudo crear la cuenta. Intenta nuevamente.");
      return;
    }

    if (data.session && data.user) {
      const result = await upsertSellerProfile(supabase, data.user.id, {
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

      router.push("/mi-cuenta");
      router.refresh();
      return;
    }

    setState("sent");
    setMessage("Revisa tu correo para activar tu cuenta de vendedor.");
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {currentEmail ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Estas ingresando como {currentEmail}. Completaremos tu perfil de
          vendedor.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-ink">Nombre completo</span>
          <input
            name="fullName"
            required
            autoComplete="name"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
            placeholder="Tu nombre"
          />
        </label>

        {!currentEmail ? (
          <>
            <label className="block">
              <span className="text-sm font-semibold text-ink">Correo</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
                placeholder="tu@email.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-ink">Contrasena</span>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                autoComplete="new-password"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
                placeholder="Minimo 6 caracteres"
              />
            </label>
          </>
        ) : null}

        <label className="block">
          <span className="text-sm font-semibold text-ink">WhatsApp</span>
          <input
            type="tel"
            name="phone"
            required
            autoComplete="tel"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
            placeholder="+51 999 999 999"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">Ciudad</span>
          <input
            name="city"
            required
            autoComplete="address-level2"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
            placeholder="Lima"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-ink">Region</span>
          <input
            name="region"
            required
            autoComplete="address-level1"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/20"
            placeholder="Lima"
          />
        </label>
      </div>

      <label className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
        <input
          type="checkbox"
          name="acceptedRules"
          required
          className="mt-1 h-4 w-4 rounded border-slate-300 text-ink"
        />
        <span>
          Acepto publicar informacion real, mantener mis avisos actualizados y
          contactar compradores por WhatsApp. Laria no procesa pagos, envios ni
          garantias.
        </span>
      </label>

      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            state === "sent"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "loading" || state === "submitting"}
        className="inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "submitting"
          ? "Creando cuenta..."
          : currentEmail
            ? "Completar perfil"
            : "Crear cuenta de vendedor"}
      </button>

      <p className="text-center text-sm text-slate-600">
        Ya tienes cuenta?{" "}
        <Link className="font-semibold text-ink hover:text-brass" href="/login">
          Ingresa aqui
        </Link>
      </p>
    </form>
  );
}
