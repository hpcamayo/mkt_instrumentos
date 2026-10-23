"use client";

import { useEffect } from "react";

// big-12: registers public/sw.js (share target and push notifications) once the page has loaded, in production
// builds only (in development it would get in the way of reloading). Its scope is /compartir/, so it never handles
// the site's own pages or images.
export const SERVICE_WORKER_SCOPE = "/compartir/";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" }).catch(() => {
        // An installable app without the share target is still Laria; nothing to tell the visitor.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
