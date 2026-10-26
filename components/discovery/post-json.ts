// The discovery forms' one request shape: POST JSON, read { ok, message, data }. A network failure reads as a message.
export async function postDiscovery(url: string, body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, message: typeof payload?.message === "string" ? payload.message : "No se pudo guardar. Intenta nuevamente." };
    return { ok: true, data: payload.data };
  } catch {
    return { ok: false, message: "No se pudo guardar. Revisa tu conexión." };
  }
}
