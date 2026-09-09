import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const nextConfig: NextConfig = {
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
