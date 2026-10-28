import "server-only";
import type { RateLimitRule } from "@/lib/rate-limit";

// The AI helpers (UX-Effortless maybes: stock-24 "Pregúntale a tu tienda" and big-07 "Completar con IA";
// docs/ux-effortless/maybes-ai.md). Off unless the server has both ANTHROPIC_API_KEY and LARIA_AI_HELPERS=1: pages
// check here and pass a boolean down, and the routes refuse while it is off.

export function aiHelpersEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.LARIA_AI_HELPERS === "1";
}

// Claude Opus 5.5 unless LARIA_AI_MODEL names another (claude-haiku-5-5 is the low-cost one). The owner decides cost.
export const DEFAULT_AI_MODEL = "claude-opus-5-5";

export function aiModel() {
  const configured = process.env.LARIA_AI_MODEL?.trim();
  return configured && /^claude-[a-z0-9.-]{1,60}$/.test(configured) ? configured : DEFAULT_AI_MODEL;
}

// Models that retry a policy decline on Anthropic's recommended model inside the same call (fallbacks: "default",
// beta server-side-fallback-2026-07-01). Claude Haiku 5.5 has no server-side fallback, so its requests go without.
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

export function supportsServerFallback(model: string) {
  return SERVER_FALLBACK_MODELS.has(model);
}

// Daily limits, counted by public.consume_rate_limit in windows of a day that start at 00:00 UTC (19:00 in Lima). Each
// call takes its own allowance first, then the site's, so an account over its own limit never uses the site's.
export const AI_LIMITS = {
  storeQuestion: { bucket: "ai.store_question", limit: 50, windowSeconds: 86_400 },
  listingAssist: { bucket: "ai.listing_assist", limit: 20, windowSeconds: 86_400 },
} satisfies Record<string, RateLimitRule>;

export const AI_DAILY_CAP_DEFAULT = 500;

// Every AI call of the site in a day; LARIA_AI_DAILY_CAP changes it (a whole number from 1).
export function aiSiteRule(): RateLimitRule {
  const configured = Number(process.env.LARIA_AI_DAILY_CAP);
  const limit = Number.isSafeInteger(configured) && configured >= 1 ? configured : AI_DAILY_CAP_DEFAULT;
  return { bucket: "ai.daily", limit, windowSeconds: 86_400 };
}
