import type { Instrumentation } from "next";

// Launch audit A13: errors Next.js catches on the server are counted for Admin > Errores (lib/monitoring/server-errors.ts).
// The module loads on the first error, so a request without one runs no extra code.
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  try {
    const { recordServerError } = await import("./lib/monitoring/server-errors");
    await recordServerError(error, context);
  } catch {
    // Counting an error must never add one.
  }
};
