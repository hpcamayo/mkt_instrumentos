"use client";

import { useCallback, useState } from "react";
import { sellingDb, sellingErrorMessage } from "@/lib/selling-tools";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// One selling-tools call from the browser with the person's own session: the database checks who may do what.
// `run` resolves to the data, or to null after setting the person-readable error.
export function useSellingRpc() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const run = useCallback(async <T = unknown>(name: string, args: Record<string, unknown>, fallback: string, key = name): Promise<T | null> => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("No hay conexión con Laria. Inténtalo de nuevo en un momento.");
      return null;
    }
    setBusy(key);
    setError("");
    try {
      const { data, error: failure } = await sellingDb(client).rpc(name, args);
      if (failure) {
        setError(sellingErrorMessage(failure, fallback));
        return null;
      }
      return (data ?? true) as T;
    } catch {
      setError("Se cortó la conexión. Revisa tu internet e inténtalo de nuevo.");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  return { run, busy, error, setError };
}
