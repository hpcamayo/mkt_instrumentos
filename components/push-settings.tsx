"use client";

import { BellPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SERVICE_WORKER_SCOPE } from "@/components/service-worker-registration";
import { Button } from "@/components/ui/button";
import { PUSH_DEVICE_COOKIE, applicationServerKey } from "@/lib/push/device";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// big-12 (docs/ux-effortless/speed.md): Laria's notices on this phone, turned on and off here, one device at a time.
// They mirror Mi cuenta > Notificaciones and never arrive from 22:00 to 08:00 (the worker holds them for the
// morning, several as one). E-mail keeps working as before. Hidden where the browser cannot receive them or Laria
// has no push keys; on an iPhone, notices need Laria on the home screen, so it says how.
type State = "checking" | "hidden" | "install" | "denied" | "off" | "on";
type BrowserClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

export function PushSettings({ publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "" }: { publicKey?: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [state, setState] = useState<State>("checking");
  const [phone, setPhone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let active = true;
    setPhone(window.matchMedia("(pointer: coarse)").matches);
    void deviceState(publicKey, supabase).then((next) => {
      if (active) setState(next);
    }, () => {
      if (active) setState("hidden");
    });
    return () => {
      active = false;
    };
  }, [publicKey, supabase]);

  if (state === "checking" || state === "hidden" || !supabase) return null;
  const device = phone ? "este teléfono" : "este navegador";

  async function turnOn(client: BrowserClient) {
    setBusy(true);
    setProblem("");
    setAnnouncement("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await activeRegistration();
      const key = applicationServerKey(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      // Subscribed with an older Laria key: start over with the current one.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const { endpoint, keys } = subscription.toJSON();
      const { data, error } = await client.rpc("save_push_subscription", { p_endpoint: endpoint ?? "", p_p256dh: keys?.p256dh ?? "", p_auth: keys?.auth ?? "" });
      if (error || !data) {
        setProblem(error?.message.includes("PUSH_ENDPOINT_UNSUPPORTED") ? "Este navegador no recibe avisos de Laria. Prueba con otro navegador." : "No pudimos activar los avisos. Inténtalo de nuevo.");
        return;
      }
      rememberDevice(data);
      setState("on");
      setAnnouncement("Avisos activados");
      // Shown by the phone itself, so the person sees what a notice looks like without anything being sent.
      void registration.showNotification("Avisos activados", {
        body: `Así se verán los avisos de Laria en ${device}.`,
        lang: "es-PE",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: "laria-avisos",
        data: { url: "/mi-cuenta/notificaciones" },
      }).catch(() => {});
    } catch {
      setProblem("No pudimos activar los avisos. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(client: BrowserClient) {
    setBusy(true);
    setProblem("");
    setAnnouncement("");
    try {
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { error } = await client.rpc("delete_push_subscription", { p_endpoint: subscription.endpoint });
        if (error) {
          setProblem("No pudimos desactivar los avisos. Inténtalo de nuevo.");
          return;
        }
        await subscription.unsubscribe().catch(() => false);
      }
      forgetDevice();
      setState("off");
      setAnnouncement("Avisos desactivados");
    } catch {
      setProblem("No pudimos desactivar los avisos. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const copy = {
    install: "En iPhone, los avisos llegan cuando Laria está en tu pantalla de inicio: toca Compartir, luego “Agregar a inicio”, y abre Laria desde ese ícono.",
    denied: "Bloqueaste los avisos de Laria en este navegador. Para recibirlos, permítelos en la configuración del sitio (el candado junto a la dirección).",
    off: "Te avisamos aquí de bajas de precio en tus favoritos, compras por confirmar y decisiones sobre tus publicaciones. Nunca de 10 p. m. a 8 a. m.: lo de la noche te llega junto en la mañana.",
    on: "Activados. Llegan de 8 a. m. a 10 p. m., varios juntos en uno, y los correos siguen como siempre.",
  }[state];

  return (
    <section aria-labelledby="avisos-dispositivo" className="rounded-panel border border-subtle bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-[62ch]">
          <h2 id="avisos-dispositivo" className="t-ui font-semibold text-ink">Avisos en {device}</h2>
          <p className="mt-1 t-ui text-ink-2">{copy}</p>
        </div>
        {state === "off" ? (
          <Button variant="secondary" icon={<BellPlus aria-hidden />} loading={busy} loadingLabel="Activando…" onClick={() => void turnOn(supabase)} className="shrink-0">
            Activar avisos
          </Button>
        ) : state === "on" ? (
          <Button variant="quiet" loading={busy} loadingLabel="Desactivando…" onClick={() => void turnOff(supabase)} className="shrink-0 self-start sm:self-center">
            Desactivar
          </Button>
        ) : null}
      </div>
      {problem ? <p role="alert" className="mt-3 t-ui text-danger">{problem}</p> : null}
      <p role="status" className="sr-only">{announcement}</p>
    </section>
  );
}

async function deviceState(publicKey: string, supabase: ReturnType<typeof getSupabaseBrowserClient>): Promise<State> {
  if (!publicKey || !supabase) return "hidden";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return iosBrowser() ? "install" : "hidden";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "off";
  const { data } = await supabase.rpc("get_push_subscription", { p_endpoint: subscription.endpoint });
  if (data) rememberDevice(data);
  return data ? "on" : "off";
}

// The worker that receives the notices (public/sw.js), active. It is registered on every page load in production;
// this also registers it on demand and waits for it to take over.
async function activeRegistration() {
  const registration = (await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE))
    ?? (await navigator.serviceWorker.register("/sw.js", { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" }));
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) throw new Error("PUSH_WORKER_MISSING");
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("PUSH_WORKER_TIMEOUT")), 10_000);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(timer);
        resolve();
      }
    });
  });
  return registration;
}

function sameKey(current: ArrayBuffer | null, key: Uint8Array) {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

function iosBrowser() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function rememberDevice(id: string) {
  document.cookie = `${PUSH_DEVICE_COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

function forgetDevice() {
  document.cookie = `${PUSH_DEVICE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
