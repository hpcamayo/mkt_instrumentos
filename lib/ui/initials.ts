// Up to two initials, used as a monogram where a store has no logo yet (store page, home store cards).
export function storeInitials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase("es-PE"))
    .join("");
}
