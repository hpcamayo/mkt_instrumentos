import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { ComplaintsBookForm } from "@/app/libro-de-reclamaciones/complaints-book-form";
import { ProviderBlock } from "@/app/libro-de-reclamaciones/complaints-book-sheet";
import {
  COMPLAINTS_BOOK_PATH,
  LISTING_SLUG_PATTERN,
  listingContextDescription,
} from "@/lib/complaints-book";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE } from "@/lib/site";
import { getRequestReads } from "@/lib/supabase/public-read-client";

// Libro de Reclamaciones virtual (EASE stores trust-05), in the format of Anexo I of the Reglamento del Libro de
// Reclamaciones (D.S. 011-2011-PCM and amendments) under Ley 29571.
// PENDIENTE DE REVISIÓN LEGAL ANTES DE PRODUCCIÓN: provider data are bracketed stand-ins (lib/complaints-book.ts),
// and legal confirms the answer term, the e-mail copy of the sheet and whether the book applies to Laria as a platform.

const description = "Registra un reclamo o una queja sobre el servicio de Laria en su Libro de Reclamaciones virtual, según el Código de Protección y Defensa del Consumidor.";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones",
  description,
  alternates: { canonical: COMPLAINTS_BOOK_PATH },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Libro de Reclamaciones | Laria", description, url: COMPLAINTS_BOOK_PATH, images: DEFAULT_OG_IMAGES },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Optional context: a visitor who comes from a listing (?publicacion=<slug>) gets its title in the description.
async function readListingContext(value: string | string[] | undefined) {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!LISTING_SLUG_PATTERN.test(slug)) return null;
  const { supabase: client } = getRequestReads();
  if (!client) return null;
  const { data } = await client.from("listings").select("title,slug").eq("slug", slug).eq("status", "approved").maybeSingle();
  return data ? { title: data.title, slug: data.slug } : null;
}

export default async function ComplaintsBookPage({ searchParams }: PageProps) {
  const listing = await readListingContext((await searchParams).publicacion);
  return (
    <LegalPage
      path={COMPLAINTS_BOOK_PATH}
      eyebrow="Atención al consumidor"
      title="Libro de Reclamaciones"
      intro={
        <div className="grid gap-3">
          <p>Conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571), Laria pone a tu disposición este Libro de Reclamaciones virtual. Completa la hoja y, al enviarla, verás su número y la fecha de registro.</p>
          <p>Laria es un marketplace: conecta compradores y vendedores, pero no vende los instrumentos publicados, no procesa pagos ni gestiona envíos. Si tu caso es con un vendedor o una tienda, cuéntalo igual en el detalle; para reportar una publicación también puedes usar el botón «Reportar» en su página. Revisa los <Link href="/terminos" className="link">términos</Link> para saber qué hace Laria.</p>
        </div>
      }
    >
      <ProviderBlock />
      <ComplaintsBookForm
        listingSlug={listing?.slug ?? ""}
        initialItemDescription={listingContextDescription(listing)}
      />
    </LegalPage>
  );
}
