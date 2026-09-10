export const protectedPathPrefixes = [
  "/mi-cuenta",
  "/mis-publicaciones",
  "/vender",
] as const;

export function isProtectedAccountPath(pathname: string) {
  return protectedPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
