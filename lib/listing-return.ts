// Particulares return to Mis publicaciones; only store listings live in Inventario (fix-09).
export function returnLabel(returnHref: string) {
  return returnHref.startsWith("/mi-cuenta/tienda") ? "Volver al inventario" : "Volver a mis publicaciones";
}
