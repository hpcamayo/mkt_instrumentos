// big-12 (docs/ux-effortless/speed.md): shared by the per-device switch (components/push-settings.tsx) and sign-out
// (app/logout/route.ts). The switch leaves this device's id in a cookie so signing out turns its notices off: a
// shared phone stops showing the previous account's notices.
export const PUSH_DEVICE_COOKIE = "laria_push_device";

export function isPushDeviceId(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

// The VAPID public key (base64url) as the bytes PushManager.subscribe expects.
export function applicationServerKey(publicKey: string) {
  const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
