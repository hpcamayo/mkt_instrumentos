"use client";

import { useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";

// safe-08 (accounts batch): "Dispositivos con sesión iniciada" in Seguridad. Each other device has its own
// "Cerrar sesión" (that browser is forgotten, so signing in there again asks for the code and sends the new-device
// e-mail), and one button closes every session, this one included.

export type DeviceSession = {
  id: string;
  label: string;
  lastActive: string;
  current: boolean;
  phone: boolean;
};

export function DeviceSessions({ sessions: initial }: { sessions: DeviceSession[] }) {
  const [sessions, setSessions] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function close(session: DeviceSession) {
    if (!(await confirm({
      title: `¿Cerrar la sesión en ${session.label}?`,
      body: "Para volver a entrar en ese dispositivo hará falta la contraseña y, si la tienes activa, el código de tu app.",
      confirmLabel: "Cerrar sesión",
    }))) return;
    setBusy(session.id);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/account/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.id }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(null);
    if (!response?.ok) return setError(result?.message ?? "No pudimos cerrar esa sesión. Vuelve a intentarlo.");
    setSessions((current) => current.filter((item) => item.id !== session.id));
    setNotice(`Cerramos la sesión en ${session.label}.`);
  }

  async function closeEverywhere() {
    if (!(await confirm({
      title: "¿Cerrar sesión en todos los dispositivos?",
      body: "También se cerrará aquí. Para volver a entrar en cualquier dispositivo hará falta tu contraseña y, si la tienes activa, el código de tu app.",
      confirmLabel: "Cerrar sesión en todos",
      tone: "danger",
    }))) return;
    setBusy("all");
    setError(null);
    setNotice(null);
    const response = await fetch("/api/account/sessions/everywhere", { method: "POST" }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { message?: string; redirect?: string } | null;
    if (!response?.ok) {
      setBusy(null);
      return setError(result?.message ?? "No pudimos cerrar las sesiones. Vuelve a intentarlo.");
    }
    window.location.assign(result?.redirect ?? "/login?motivo=sesiones");
  }

  return (
    <div className="grid gap-4">
      {sessions.length ? (
        <ul className="grid divide-y divide-subtle rounded-panel border border-subtle">
          {sessions.map((session) => {
            const Icon = session.phone ? Smartphone : Laptop;
            return (
              <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Icon aria-hidden className="h-5 w-5 shrink-0 text-ink-2" />
                <div className="min-w-0 flex-1">
                  <p className="t-ui font-semibold text-ink">
                    {session.label}
                    {session.current ? <span className="ml-2 font-normal text-ink-2">(este dispositivo)</span> : null}
                  </p>
                  <p className="t-meta">Última actividad: {session.lastActive}</p>
                </div>
                {!session.current ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void close(session)} loading={busy === session.id} loadingLabel="Cerrando…" disabled={busy !== null && busy !== session.id}>
                    Cerrar sesión
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-body text-ink-2">No pudimos cargar la lista de dispositivos. Igual puedes cerrar todas las sesiones.</p>
      )}
      {notice ? <Notice tone="success"><p>{notice}</p></Notice> : null}
      {error ? <Notice tone="danger"><p>{error}</p></Notice> : null}
      <Button type="button" variant="danger" className="justify-self-start" onClick={() => void closeEverywhere()} loading={busy === "all"} loadingLabel="Cerrando sesiones…" disabled={busy !== null && busy !== "all"}>
        Cerrar sesión en todos los dispositivos
      </Button>
      {confirmDialog}
    </div>
  );
}
