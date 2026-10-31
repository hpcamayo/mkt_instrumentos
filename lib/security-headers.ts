// Launch audit A11: headers every response carries (next.config.ts). The Supabase session cookies are readable by
// JavaScript by design, so the Content-Security-Policy is the backstop if a script injection ever slips in, and
// frame-ancestors keeps other sites from framing account pages to trick clicks.
//
// Next.js writes inline bootstrap scripts, so script-src needs 'unsafe-inline' (nonces would make every page dynamic
// and rule out the CDN cache). What the policy buys is that scripts load only from Laria itself, nothing runs from
// another host, and data can only be sent to Laria and its Supabase project.
//
// 'unsafe-eval' is there for HEIC photos: outside Safari, heic2any converts them with libheif, whose generated code
// builds functions with new Function inside a blob worker that inherits this policy. It can't be limited to the
// photo pages, because after a client-side navigation the policy of the first page loaded still applies; next to
// 'unsafe-inline' it adds little.

export type SecurityHeaderEnv = {
  supabaseUrl?: string;
  // VERCEL_ENV: "production", "preview" or "development"; unset outside Vercel.
  vercelEnv?: string;
  // NODE_ENV: "development" under `next dev`.
  nodeEnv?: string;
};

// Hosts other features need, per directive. Add a host here, never in next.config.ts.
const EXTRA_SOURCES: Partial<Record<string, string[]>> = {
  // Feature ideas, listing-details (buy-08): the map's style, tiles, glyphs and sprites (components/map/maplibre.ts).
  "connect-src": ["https://tiles.openfreemap.org"],
  "img-src": ["https://tiles.openfreemap.org"],
};

function originOf(url?: string) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ supabaseUrl, vercelEnv, nodeEnv }: SecurityHeaderEnv) {
  const supabase = originOf(supabaseUrl);
  const supabaseRealtime = supabase ? supabase.replace(/^http/, "ws") : null;
  const dev = nodeEnv === "development";
  // Vercel's preview toolbar and comments load from vercel.live.
  const preview = vercelEnv === "preview";
  // Seed data (supabase/seed.sql) uses placehold.co images; production never shows them (A01, A24).
  const seedImages = vercelEnv !== "production";
  const directives: Record<string, (string | null | false)[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", preview && "https://vercel.live"],
    "style-src": ["'self'", "'unsafe-inline'", preview && "https://vercel.live"],
    "img-src": ["'self'", "data:", "blob:", supabase, seedImages && "https://placehold.co", preview && "https://vercel.live", preview && "https://vercel.com"],
    "media-src": ["'self'", "blob:", supabase],
    "font-src": ["'self'", "data:", preview && "https://vercel.live", preview && "https://assets.vercel.com"],
    "connect-src": ["'self'", supabase, supabaseRealtime, dev && "ws:", preview && "https://vercel.live", preview && "wss://ws-us3.pusher.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": preview ? ["https://vercel.live"] : ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "report-uri": ["/api/csp-report"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources.filter((source): source is string => Boolean(source)), ...(EXTRA_SOURCES[name] ?? [])].join(" "))
    .join("; ");
}

export function securityHeaders(env: SecurityHeaderEnv) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // The camera reads barcodes in the inventory counter and the microphone records a listing's sound clip, both on
    // Laria's own pages; nothing else is used.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()" },
  ];
}
