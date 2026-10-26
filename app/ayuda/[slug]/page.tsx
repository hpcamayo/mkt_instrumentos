import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { HELP_ARTICLES, helpArticle, helpTopic } from "@/lib/help/articles";
import { DEFAULT_OG_IMAGES, OPEN_GRAPH_BASE } from "@/lib/site";
import { HelpContact } from "../help-contact";

type ArticleProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticleProps): Promise<Metadata> {
  const article = helpArticle((await params).slug);
  if (!article) return {};
  const url = `/ayuda/${article.slug}`;
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: url },
    openGraph: { ...OPEN_GRAPH_BASE, title: `${article.title} | Laria`, description: article.summary, url, images: DEFAULT_OG_IMAGES },
  };
}

// safe-10 (feature ideas, accounts batch): one help article, the others of its topic, and the contact form.
export default async function HelpArticlePage({ params }: ArticleProps) {
  const article = helpArticle((await params).slug);
  if (!article) notFound();
  const topic = helpTopic(article.topic)!;
  const related = HELP_ARTICLES.filter((item) => item.topic === article.topic && item.slug !== article.slug);
  const ticketTopic = article.slug === "equipo-robado" ? "robo" : article.slug === "senales-de-estafa" ? "seguridad" : article.topic;

  return (
    <section className="bg-canvas/70">
      <PageContainer className="grid max-w-4xl gap-6 py-6 sm:py-8">
        <Breadcrumbs phoneBackLink items={[{ label: "Centro de ayuda", href: "/ayuda" }, { label: topic.title, href: `/ayuda#${topic.id}` }, { label: article.title }]} />
        <article className="rounded-panel border border-subtle bg-white p-5 sm:p-8">
          <PageHeader eyebrow={topic.title} title={article.title} meta={article.summary} />
          <div className="mt-6 grid max-w-[68ch] gap-5 t-body text-ink-2">
            {article.sections.map((section, index) => (
              <div key={section.heading ?? index} className="grid gap-2">
                {section.heading ? <h2 className="t-section text-ink">{section.heading}</h2> : null}
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.steps ? <ol className="grid list-decimal gap-1.5 pl-5">{section.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
                {section.bullets ? <ul className="grid list-disc gap-1.5 pl-5">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
              </div>
            ))}
          </div>
          {article.links?.length ? (
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {article.links.map((link) => <li key={link.href}><Link href={link.href} className="link inline-flex min-h-6 items-center t-ui font-semibold">{link.label}</Link></li>)}
            </ul>
          ) : null}
        </article>
        {related.length ? (
          <nav aria-labelledby="relacionados" className="rounded-panel border border-subtle bg-white p-5">
            <h2 id="relacionados" className="t-section text-ink">Más sobre {topic.title.toLowerCase()}</h2>
            <ul className="mt-3 grid gap-1">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/ayuda/${item.slug}`} className="flex min-h-11 items-center rounded-control px-2 t-ui font-semibold text-ink underline decoration-line-deco underline-offset-[3px] hover:bg-canvas hover:decoration-ink">{item.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <HelpContact topic={ticketTopic} pagePath={`/ayuda/${article.slug}`} />
      </PageContainer>
    </section>
  );
}
