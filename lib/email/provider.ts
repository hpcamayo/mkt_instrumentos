import "server-only";

export type MarketplaceEmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type MarketplaceEmailProvider = {
  send(message: MarketplaceEmailMessage): Promise<{ messageId: string }>;
};

export class MarketplaceEmailProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly category: "transport" | "rate_limit" | "provider" | "configuration" | "recipient" | "unknown",
    readonly code: string,
  ) {
    super(message);
    this.name = "MarketplaceEmailProviderError";
  }
}
export function createMarketplaceEmailProvider(): MarketplaceEmailProvider {
  const provider = process.env.MARKETPLACE_EMAIL_PROVIDER ?? "resend";
  if (provider !== "resend") throw new MarketplaceEmailProviderError("Proveedor de correo no compatible.", false, "configuration", "provider_unsupported");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MARKETPLACE_EMAIL_FROM;
  if (!apiKey || !from) throw new MarketplaceEmailProviderError("Falta la configuración del proveedor de correo.", false, "configuration", "provider_config_missing");
  return new ResendMarketplaceEmailProvider(apiKey, from);
}

export class ResendMarketplaceEmailProvider implements MarketplaceEmailProvider {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetcher: typeof fetch = fetch) {}

  async send(message: MarketplaceEmailMessage) {
    let response: Response;
    try {
      response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MarketplaceEmailProviderError(error instanceof Error ? error.message : "Fallo de transporte.", true, "transport", "transport_error");
    }
    const result = await response.json().catch(() => null) as { id?: unknown; name?: unknown; message?: unknown } | null;
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
      const category = response.status === 429 ? "rate_limit" : response.status === 400 || response.status === 422 ? "recipient" : response.status === 401 || response.status === 403 ? "configuration" : "provider";
      throw new MarketplaceEmailProviderError("El proveedor rechazó el envío.", retryable, category, `http_${response.status}`);
    }
    if (!result || typeof result.id !== "string" || !result.id) throw new MarketplaceEmailProviderError("El proveedor no devolvió un identificador.", true, "provider", "provider_id_missing");
    return { messageId: result.id };
  }
}
