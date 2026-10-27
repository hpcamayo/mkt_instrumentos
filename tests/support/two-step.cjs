// Admin's pages and database functions need a session that passed the authenticator code (aal2; launch audit A06 and
// A15, public.is_admin). The integration tests give their temporary Admin an authenticator factor and answer it the
// way the Admin's app would, with a code computed from the factor's secret (RFC 6238: SHA-1, 30 seconds, 6 digits).
const { createHmac, randomUUID } = require("node:crypto");
const { createServerClient } = require("@supabase/ssr");

function totpCode(secret, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = secret.replace(/=+$/, "").toUpperCase().split("").map((char) => {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("The authenticator secret is not base32.");
    return value.toString(2).padStart(5, "0");
  }).join("");
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// Answers the factor on this client's session. A code is refused if it was already used, so a refusal waits for the
// next 30-second step and tries once more.
async function answerFactor(client, factor) {
  for (let attempt = 0; ; attempt++) {
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: factor.factorId, code: totpCode(factor.secret) });
    if (!error) return;
    if (attempt === 2) throw new Error(`The authenticator code was refused: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, 30_500 - (Date.now() % 30_000)));
  }
}

// Adds an authenticator factor to the signed-in client's account and answers it: the client's session is then aal2.
async function enrollTwoStep(client) {
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `QA ${randomUUID()}` });
  if (error) throw new Error(`The authenticator could not be added: ${error.message}`);
  const factor = { factorId: data.id, secret: data.totp.secret };
  await answerFactor(client, factor);
  return factor;
}

// The app's session cookie at aal2: signs in with a cookie jar, as the browser does, then answers the factor.
async function twoStepCookie(url, anonKey, email, password, factor) {
  const jar = new Map();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const { name, value } of values) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  await answerFactor(client, factor);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

module.exports = { totpCode, enrollTwoStep, twoStepCookie };
