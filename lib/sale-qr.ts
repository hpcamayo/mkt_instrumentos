// The QR the Mostrador shows after a sale (reach-11). One small wrapper so the counter code doesn't care where the
// encoder lives: it is store-floor's lib/labels/qr.ts, which also draws the shelf labels (FD-deal-trust-5).
import { QR_MAX_BYTES, qrModules } from "@/lib/labels/qr";

export class SaleQrTooLong extends Error {}

// The modules of the code, row by row (true = dark), without the quiet zone. Throws SaleQrTooLong over QR_MAX_BYTES.
export function saleQrModules(text: string): boolean[][] {
  try {
    return qrModules(text);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("QR_TOO_LONG")) {
      throw new SaleQrTooLong(`The counter code holds up to ${QR_MAX_BYTES} bytes.`);
    }
    throw error;
  }
}
