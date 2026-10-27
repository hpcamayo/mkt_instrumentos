// Feature ideas, accounts batch (safe-08): the two-step code for the demo accounts in the local prototype, so the
// browser checks can reach Mi tienda and Admin (both need the code once it is required). It turns the authenticator
// app on through Seguridad, keeps the key under /tmp/laria-prototype/two-step and answers the code step after each
// sign-in with an RFC 6238 code. Local prototype only (scripts/prototype/local-gateway.cjs checks the codes).
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DIR = process.env.TWO_STEP_DIR || "/tmp/laria-prototype/two-step";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function code(secret, at = Date.now()) {
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) bits += BASE32.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const mac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, "0");
}

const keyFile = (email) => path.join(DIR, `${email.replace(/[^a-z0-9@._-]/gi, "_")}.key`);

// Turns the app on for the signed-in account (a no-op when it is already on) and returns the key.
async function enable(page, base, email) {
  await page.goto(`${base}/mi-cuenta/seguridad?paso=activar`, { waitUntil: "networkidle" });
  const key = page.locator("code").filter({ hasText: /^[A-Z2-7]{16,}$/ }).first();
  if (!(await key.isVisible({ timeout: 8000 }).catch(() => false))) return null;
  const secret = (await key.textContent()).trim();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(keyFile(email), secret);
  await page.getByLabel("Código de 6 números", { exact: true }).fill(code(secret));
  await page.getByRole("button", { name: "Confirmar y activar", exact: true }).click();
  await page.getByText("Guarda estos códigos").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^(Listo|Continuar)$/ }).click();
  await page.waitForLoadState("networkidle");
  return secret;
}

// After the password: answers the code step when the page shows it. Returns true when it typed a code.
async function answer(page, email) {
  if (!new URL(page.url()).searchParams.get("paso")?.startsWith("codigo")) return false;
  if (!fs.existsSync(keyFile(email))) throw new Error(`two-step: no saved key for ${email}; reset the database or remove its factor`);
  const next = new URL(page.url()).searchParams.get("next") || "/mi-cuenta";
  await page.getByLabel("Código de 6 números", { exact: true }).fill(code(fs.readFileSync(keyFile(email), "utf8").trim()));
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === next.split("?")[0], { timeout: 20000 });
  return true;
}

module.exports = { code, enable, answer, keyFile };
