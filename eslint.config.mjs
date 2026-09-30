import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", ".vercel/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { files: ["tests/**/*.cjs", "scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  {
    // Server-rendered code must not accidentally read browser-only window globals:
    // TypeScript's DOM lib types them, but they are undefined in Node (Sprint 9 /admin/tiendas 500).
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "components_v0/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...["status", "name", "event", "length", "origin", "top", "parent", "self", "closed", "opener", "stop", "find", "print", "close", "open", "external", "screen"].map((name) => ({ name, message: `Use a local variable or window.${name} explicitly; bare browser globals throw during SSR.` }))],
    },
  },
];

export default eslintConfig;
