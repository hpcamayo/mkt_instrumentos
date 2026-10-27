"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// buy-11 (feature ideas, accounts batch): "Continuar con Google" and "Continuar con Apple". Each button exists only
// once its provider is set up in Supabase and switched on here (NEXT_PUBLIC_AUTH_GOOGLE=1, NEXT_PUBLIC_AUTH_APPLE=1).
// The provider already confirmed the address, so there is no confirmation e-mail; a first sign-in creates a Particular
// account with the name the provider shares (app/auth/callback).

type Provider = "google" | "apple";

const PROVIDERS: { id: Provider; label: string; enabled: boolean }[] = [
  { id: "google", label: "Continuar con Google", enabled: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1" },
  { id: "apple", label: "Continuar con Apple", enabled: process.env.NEXT_PUBLIC_AUTH_APPLE === "1" },
];

export function oauthProvidersEnabled() {
  return PROVIDERS.some((provider) => provider.enabled);
}

export function OAuthButtons({ next, remember = true }: { next: string; remember?: boolean }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providers = PROVIDERS.filter((provider) => provider.enabled);
  if (!providers.length) return null;

  async function start(provider: Provider) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("No pudimos conectar con Laria. Vuelve a intentarlo.");
    setBusy(provider);
    setError(null);
    const params = new URLSearchParams({ next });
    if (!remember) params.set("recordar", "0");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?${params.toString()}` },
    });
    // On success the browser is already leaving for the provider.
    if (oauthError) {
      setBusy(null);
      setError("No pudimos abrir el ingreso. Vuelve a intentarlo o usa tu correo.");
    }
  }

  return (
    <div className="grid gap-3">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="secondary"
          block
          icon={provider.id === "google" ? <GoogleMark /> : <AppleMark />}
          loading={busy === provider.id}
          loadingLabel="Abriendo…"
          disabled={busy !== null && busy !== provider.id}
          onClick={() => void start(provider.id)}
        >
          {provider.label}
        </Button>
      ))}
      {error ? <Notice tone="danger"><p>{error}</p></Notice> : null}
      <p className="t-meta">
        Si es tu primera vez, se crea una cuenta Particular con tu nombre y correo, y aceptas los{" "}
        <a href="/terminos" target="_blank" rel="noopener" className="link font-semibold">términos y reglas</a> y la{" "}
        <a href="/privacidad" target="_blank" rel="noopener" className="link font-semibold">política de privacidad</a>.
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" fill="currentColor">
      <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.8a4.8 4.8 0 0 0-4 2.4c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-.9-2.4-3.8ZM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4Z" />
    </svg>
  );
}
