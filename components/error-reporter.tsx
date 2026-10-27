"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/monitoring/client-errors";

// Launch audit A13: reports the browser errors no error page catches (lib/monitoring/client-errors.ts). Mounted once,
// in the root layout; the error pages report their own (app/error.tsx, app/admin/error.tsx).
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError("error", event.error ?? event.message, event.filename);
    const onRejection = (event: PromiseRejectionEvent) => reportClientError("unhandledrejection", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
