// Prints a new VAPID key pair for Laria's push notices (docs/ux-effortless/speed.md) as two environment lines, for
// .env.local or the hosting provider's settings. One pair per environment; the private key stays secret, and
// replacing a pair later turns notices off on every device until each person turns them on again.
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
