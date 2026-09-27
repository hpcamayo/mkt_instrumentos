import type { NextConfig } from "next";
import { NON_INDEXABLE_PATH_PREFIXES } from "./lib/site";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Private, account, Admin and auth utility routes must never be indexed, even
// when a crawler reaches them through a redirect or an external link.
const noIndexSources = NON_INDEXABLE_PATH_PREFIXES.flatMap((prefix) => [prefix, `${prefix}/:path*`]);

const nextConfig: NextConfig = {
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
