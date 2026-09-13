export function listingStatusLabel(status: string) {
  return ({
    pending: "En revisión",
    approved: "Aprobada",
    rejected: "Rechazada",
    hidden: "Oculta",
    sold: "Vendida",
    archived: "Archivada",
  } as Record<string, string>)[status] ?? status;
}
