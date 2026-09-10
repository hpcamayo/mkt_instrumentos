"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type SessionState = "loading" | "authenticated" | "anonymous";

export function SiteHeaderAccountNav() {
  const [sessionState, setSessionState] = useState<SessionState>("loading");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSessionState("anonymous");
      return;
    }

    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSessionState(data.session ? "authenticated" : "anonymous");
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) {
          setSessionState(session ? "authenticated" : "anonymous");
        }
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (sessionState === "loading") {
    return (
      <li aria-hidden="true" className="h-10 w-24 animate-pulse rounded-md bg-white/10" />
    );
  }

  if (sessionState === "authenticated") {
    return (
      <li>
        <Link
          href="/mi-cuenta"
          className="inline-flex min-h-10 items-center rounded-md border border-white/25 px-3 py-2 text-white transition hover:border-laria-yellow hover:text-laria-yellow"
        >
          Mi cuenta
        </Link>
      </li>
    );
  }

  return (
    <>
      <li>
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center rounded-md border border-white/25 px-3 py-2 text-white transition hover:border-laria-yellow hover:text-laria-yellow"
        >
          Ingresar
        </Link>
      </li>
      <li>
        <Link
          href="/registro/vendedor"
          className="inline-flex min-h-10 items-center rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white"
        >
          Crear cuenta
        </Link>
      </li>
    </>
  );
}
