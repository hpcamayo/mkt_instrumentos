// A request made by Laria's own pages: the browser either says it is same-origin or sends no cross-site signal, and any
// Origin header it sends is this site's. Safe for the Edge runtime (middleware) and for route handlers.
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || origin === new URL(request.url).origin);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Routes that authenticate with a secret or a signed token instead of the session cookie, so a request from elsewhere
// is expected: Vercel Cron, the one-click unsubscribe mail providers POST (RFC 8058) and the browser's CSP reports.
const CROSS_SITE_API_PATHS = ["/api/internal/", "/api/email/unsubscribe", "/api/csp-report"];

// Launch audit A22: every state-changing API request must come from Laria's own pages. The session cookie is
// SameSite=Lax and request.json() accepts a text/plain body, which a form on another site can send. Middleware applies
// this to every /api route.
export function isRefusedCrossSiteApiWrite(request: Request, pathname: string) {
  return pathname.startsWith("/api/")
    && !SAFE_METHODS.has(request.method.toUpperCase())
    && !CROSS_SITE_API_PATHS.some((path) => (path.endsWith("/") ? pathname.startsWith(path) : pathname === path || pathname.startsWith(`${path}/`)))
    && !isSameOriginRequest(request);
}
