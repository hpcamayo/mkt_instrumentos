// Up to two initials, used as a monogram: a store without a logo yet (store page, home store cards) and the
// account avatar in the header.
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase("es-PE"))
    .join("");
}

export const storeInitials = initials;
