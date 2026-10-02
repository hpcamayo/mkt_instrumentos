import type { Metadata } from "next";
import { ErrorPage, NOT_FOUND_COPY } from "@/components/error-page";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: NOINDEX_ROBOTS,
};

// A 404 inside Admin keeps the Admin frame (sidebar and <main> from app/admin/layout.tsx).
export default function AdminNotFound() {
  return <ErrorPage {...NOT_FOUND_COPY} searchId="busqueda-no-encontrada" />;
}
