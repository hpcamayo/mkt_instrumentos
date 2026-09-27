import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { NON_INDEXABLE_PATH_PREFIXES } from "./lib/site";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Private, account, Admin and auth utility routes must never be indexed, even
// when a crawler reaches them through a redirect or an external link.
const noIndexSources = NON_INDEXABLE_PATH_PREFIXES.flatMap((prefix) => [prefix, `${prefix}/:path*`]);

// Next.js streams metadata into <body> for Googlebot, which Next treats as a
// JavaScript-rendering bot. On /listados (the only route with loading.tsx) the
// <head> is flushed before metadata resolves, so the canonical never reaches
// <head>, not even after hydration. Adding Googlebot to Next's own HTML-limited
// list makes its metadata blocking (in <head>) while page content still streams.
// Deriving from Next's constant keeps its default bots across upgrades; if the
// internal path moves, the build fails loudly. See docs/sprint-9-production-release-gate.md.
const HTML_LIMITED_BOTS = new RegExp(`Googlebot|${HTML_LIMITED_BOT_UA_RE.source}`, "i");

const nextConfig: NextConfig = {
  htmlLimitedBots: HTML_LIMITED_BOTS,
  async headers() {
    return [
      ...noIndexSources.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      ...(process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development"
        ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]
        : []),
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      ...(supabaseUrl
        ? [
            {
              protocol: new URL(supabaseUrl).protocol.replace(":", "") as
                "https" | "http",
              hostname: new URL(supabaseUrl).hostname,
              port: new URL(supabaseUrl).port,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
