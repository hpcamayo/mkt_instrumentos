import type { Metadata } from "next";
import { ErrorPage } from "@/components/error-page";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: NOINDEX_ROBOTS,
};

export default function NotFound() {
  return (
    <ErrorPage
      title="No encontramos esta página"
      message="Puede que la dirección esté mal o que la publicación ya no esté disponible."
      searchId="busqueda-no-encontrada"
    />
  );
}
