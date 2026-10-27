// A small request body (a report of a few hundred bytes), read with a size limit. Reading stops as soon as the body
// passes maxBytes (null), whether or not it declared a Content-Length, so an oversized or endless body is never
// buffered. A body that can't be read is "".
export async function readBodyWithLimit(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return "";
  }
  return text + decoder.decode();
}
