import Link from "next/link";
import type { Metadata } from "next";
import { HelpSearch } from "@/components/help/help-search";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { HELP_ARTICLES, HELP_TOPICS, helpSearchIndex } from "@/lib/help/articles";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE } from "@/lib/site";
import { HelpContact } from "./help-contact";

const description = "Respuestas sobre cómo comprar con seguridad, vender, registrar una tienda y cuidar tu cuenta en Laria.";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  description,
  alternates: { canonical: "/ayuda" },
  openGraph: { ...OPEN_GRAPH_BASE, title: "Centro de ayuda | Laria", description, url: "/ayuda", images: DEFAULT_OG_IMAGES },
};

// safe-10 (feature ideas, accounts batch): searchable help in four topics, then "¿No encontraste tu respuesta?".
export default async function HelpCenterPage({ searchParams }: { searchParams: Promise<{ q?: string; tema?: string; desde?: string }> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";

  return (
    <section className="bg-canvas/70">
      <PageContainer className="grid max-w-4xl gap-6 py-6 sm:py-8">
        <div className="grid gap-4 rounded-panel border border-subtle bg-white p-5 sm:p-8">
          <PageHeader eyebrow="Ayuda" title="Centro de ayuda" meta="Busca tu duda o elige un tema." />
          <HelpSearch index={helpSearchIndex()} initialQuery={query} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {HELP_TOPICS.map((topic) => (
            <section key={topic.id} id={topic.id} aria-labelledby={`tema-${topic.id}`} className="scroll-mt-24 rounded-panel border border-subtle bg-white p-5">
              <h2 id={`tema-${topic.id}`} className="t-section text-ink">{topic.title}</h2>
              <p className="mt-1 t-meta">{topic.description}</p>
              <ul className="mt-3 grid gap-1">
                {HELP_ARTICLES.filter((article) => article.topic === topic.id).map((article) => (
                  <li key={article.slug}>
                    <Link href={`/ayuda/${article.slug}`} className="flex min-h-11 items-center rounded-control px-2 t-ui font-semibold text-ink underline decoration-line-deco underline-offset-[3px] hover:bg-canvas hover:decoration-ink">
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <HelpContact topic={typeof params.tema === "string" ? params.tema : null} pagePath={typeof params.desde === "string" ? params.desde : "/ayuda"} />
      </PageContainer>
    </section>
  );
}
