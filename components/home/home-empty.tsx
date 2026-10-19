import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// The home's feed on a marketplace with nothing published yet.
export function RecentListings() {
  return (
    <section aria-labelledby="recientes-titulo">
      <h2 id="recientes-titulo" className="mb-3 t-section text-ink md:mb-4">Recién publicados</h2>
      <EmptyState
        headingLevel={3}
        title="Aún no hay publicaciones"
        description="Las primeras publicaciones aparecerán aquí."
        actions={<Link href="/vender" className={buttonClasses({ variant: "secondary" })}>Publicar un instrumento</Link>}
      />
    </section>
  );
}
