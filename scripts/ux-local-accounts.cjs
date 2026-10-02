#!/usr/bin/env node
// Local test accounts for the UX harness and audit (docs/ux-redesign/review-guide.md): a Particular, a Store Owner
// with an active verified store, and an Admin (app_metadata.role = "admin"). LOCAL Supabase only.
//
//   node scripts/ux-local-accounts.cjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or the environment) and refuses any
// non-local URL. Writes .ux-accounts.local.json (gitignored) with generated passwords. Running it again resets the
// three passwords and keeps the accounts and the store.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function readEnv() {
  const file = path.join(process.cwd(), ".env.local");
  const values = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...values, ...process.env };
}

const env = readEnv();
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error(`Refusing to create accounts on ${url}: local Supabase only.`);
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
async function api(method, route, body) {
  const response = await fetch(`${url}${route}`, { method, headers: { ...headers, Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${text}`);
  return data;
}

const ACCOUNTS = {
  particular: { email: "ux-particular@laria.test", user_metadata: { full_name: "Lucía Prueba", account_type: "seller", city: "Miraflores", region: "Lima", phone: "999111222" } },
  store: { email: "ux-tienda@laria.test", user_metadata: { full_name: "Rosa Tienda", account_type: "store_owner", city: "Lima", region: "Lima", phone: "999888777" } },
  admin: { email: "admin@laria.test", user_metadata: { full_name: "Admin local", account_type: "seller" }, app_metadata: { role: "admin" } },
};

async function findUser(email) {
  const { users } = await api("GET", "/auth/v1/admin/users?per_page=1000");
  return users.find((user) => user.email === email) ?? null;
}

(async () => {
  const output = {};
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    const password = crypto.randomBytes(15).toString("base64url");
    const existing = await findUser(account.email);
    const user = existing
      ? await api("PUT", `/auth/v1/admin/users/${existing.id}`, { password, app_metadata: account.app_metadata })
      : await api("POST", "/auth/v1/admin/users", { email: account.email, password, email_confirm: true, user_metadata: account.user_metadata, app_metadata: account.app_metadata });
    output[key] = { email: account.email, password };
    console.log(`${existing ? "updated" : "created"} ${key}: ${account.email}`);
    if (key === "store") {
      const stores = await api("GET", `/rest/v1/stores?owner_user_id=eq.${user.id}&select=id,slug`);
      if (stores.length === 0) {
        await api("POST", "/rest/v1/stores", {
          name: "Tienda Prueba UX", slug: "tienda-prueba-ux", status: "active", is_verified: true, whatsapp_phone: "51999888777",
          city: "Lima", region: "Lima", district: "Miraflores", owner_user_id: user.id, description: "Tienda local de prueba para las capturas UX.",
        });
        console.log("created store: tienda-prueba-ux (active, verified)");
      } else {
        console.log(`store exists: ${stores[0].slug}`);
      }
    }
  }
  fs.writeFileSync(path.join(process.cwd(), ".ux-accounts.local.json"), `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  console.log("wrote .ux-accounts.local.json");
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
