import Link from "next/link";
import { Gift, MessageCircleQuestion, Store } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DiscoveryListingRow } from "@/components/discovery/listing-row";
import { SharePageButton } from "@/components/discovery/share-page-button";
import { PageContainer } from "@/components/page-container";
import { ChipLink } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { catalogHref } from "@/lib/catalog-filters";
import { getGiftExchangeStores, getSetListings } from "@/lib/discovery/data";
import {
  GIFTS_PATH,
  getGiftBudget,
  getGiftRecipient,
  giftBudgets,
  giftFinderHref,
  giftQuestions,
  giftRecipients,
  giftSetFilters,
  occasionsInOrder,
  type GiftOccasion,
} from "@/lib/discovery/gift-finder";
import { GIFT_EXCHANGE_DISCLAIMER, giftExchangeLabel } from "@/lib/discovery/makers";
import { GUIDES_PATH } from "@/lib/discovery/buying-guides";
import { absoluteUrl } from "@/lib/site";

const ROW_SIZE = 4;

// buy-05 "Para regalar" (docs/feature-ideas/discovery.md). Server-rendered from the URL (?para=…&presupuesto=…), so
// it works without JavaScript and every choice is a shareable link. Real listings only, newest first within each set;
// no ranking, no countdown, nothing preselected.
export async function GiftFinder({
  occasion,
  searchParams,
}: {
  occasion: GiftOccasion | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const recipient = getGiftRecipient(first("para"));
  const budget = getGiftBudget(first("presupuesto"));
  const occasionSlug = occasion?.slug ?? null;
  const occasions = occasionsInOrder(new Date());
  const path = giftFinderHref(occasionSlug, recipient?.slug ?? null, budget?.slug ?? null);

  const [rows, stores] = await Promise.all([
    recipient
      ? Promise.all(recipient.sets.map(async (set) => {
          const filters = giftSetFilters(set, budget);
          return { set, filters, result: await getSetListings(filters, ROW_SIZE) };
        }))
      : Promise.resolve([]),
    getGiftExchangeStores(8),
  ]);

  return (
    <section className="bg-surface">
      <PageContainer className="grid gap-8 py-6 lg:py-8">
        <div className="grid gap-3">
          <Breadcrumbs items={occasion ? [{ label: "Inicio", href: "/" }, { label: "Para regalar", href: GIFTS_PATH }, { label: occasion.label }] : [{ label: "Inicio", href: "/" }, { label: "Para regalar" }]} />
          <PageHeader
            eyebrow="Para regalar"
            title={occasion?.heading ?? "Regalos para músicos"}
            meta={<p className="max-w-[68ch]">{occasion?.intro ?? "Elige para quién es y cuánto quieres gastar: te mostramos instrumentos y accesorios reales de particulares y tiendas en Perú."}</p>}
            actions={<SharePageButton url={absoluteUrl(path)} title={occasion?.heading ?? "Regalos para músicos"} />}
          />
          <nav aria-label="Ocasión" className="flex flex-wrap gap-2">
            {occasions.map((item) => (
              <ChipLink key={item.slug} href={giftFinderHref(item.slug, recipient?.slug ?? null, budget?.slug ?? null)} selected={item.slug === occasionSlug} current="page">
                {item.label}
              </ChipLink>
            ))}
          </nav>
        </div>

        <div className="grid gap-5 rounded-panel bg-canvas p-4 md:p-5">
          <div role="group" aria-labelledby="regalo-para">
            <p id="regalo-para" className="t-ui font-semibold text-ink">¿Para quién es?</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {giftRecipients.map((item) => (
                <li key={item.slug}>
                  <ChipLink href={giftFinderHref(occasionSlug, item.slug === recipient?.slug ? null : item.slug, budget?.slug ?? null)} selected={item.slug === recipient?.slug} scroll={false}>
                    {item.label}
                  </ChipLink>
                </li>
              ))}
            </ul>
          </div>
          <div role="group" aria-labelledby="regalo-presupuesto">
            <p id="regalo-presupuesto" className="t-ui font-semibold text-ink">¿Cuánto quieres gastar?</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {giftBudgets.map((item) => (
                <li key={item.slug}>
                  <ChipLink href={giftFinderHref(occasionSlug, recipient?.slug ?? null, item.slug === budget?.slug ? null : item.slug)} selected={item.slug === budget?.slug} scroll={false}>
                    {item.label}
                  </ChipLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {recipient ? (
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="grid content-start gap-10 lg:col-span-8">
              <p className="t-body text-ink">{recipient.tip}</p>
              {rows.map(({ set, filters, result }, index) => (
                <DiscoveryListingRow
                  key={set.label}
                  id={`regalo-${index}`}
                  title={set.label}
                  listings={result?.listings ?? null}
                  total={result?.total ?? null}
                  href={catalogHref(filters)}
                  empty={budget ? `No hay publicaciones de ${set.label.toLowerCase()} en este presupuesto por ahora.` : undefined}
                />
              ))}
            </div>
            <aside className="grid content-start gap-4 lg:col-span-4">
              <section aria-labelledby="que-preguntar" className="rounded-panel border border-subtle p-4">
                <h2 id="que-preguntar" className="flex items-center gap-2 t-section text-ink">
                  <MessageCircleQuestion aria-hidden className="h-5 w-5" />
                  Qué preguntarle a quien vende
                </h2>
                <ul className="mt-3 grid list-disc gap-1.5 pl-5 t-ui text-ink">
                  {[...recipient.questions, ...giftQuestions].map((question) => <li key={question}>{question}</li>)}
                </ul>
                <p className="mt-3 t-meta">
                  Antes de ir a verlo, revisa las <Link href={GUIDES_PATH} className="link">guías de compra</Link>.
                </p>
              </section>
              <GiftExchangeStores stores={stores} />
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="flex items-start gap-3 lg:col-span-8">
              <Gift aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-ink-2" />
              <p className="t-body text-ink">
                Elige para quién es y, si quieres, un presupuesto. Verás instrumentos y accesorios publicados hoy, con lo que conviene preguntar
                antes de comprar.
              </p>
            </div>
            <div className="lg:col-span-4"><GiftExchangeStores stores={stores} /></div>
          </div>
        )}
      </PageContainer>
    </section>
  );
}

function GiftExchangeStores({ stores }: { stores: Awaited<ReturnType<typeof getGiftExchangeStores>> }) {
  if (!stores?.length) return null;
  return (
    <section aria-labelledby="cambios-de-regalo" className="rounded-panel border border-subtle p-4">
      <h2 id="cambios-de-regalo" className="flex items-center gap-2 t-section text-ink">
        <Store aria-hidden className="h-5 w-5" />
        Tiendas que aceptan cambios de regalos
      </h2>
      <ul className="mt-3 grid gap-3">
        {stores.map((store) => (
          <li key={store.store_slug} className="grid gap-0.5">
            <Link href={`/tiendas/${store.store_slug}`} className="link inline-flex items-center gap-1.5 t-ui font-semibold">
              {store.store_name}
              {store.is_verified ? <><VerifiedIcon className="h-4 w-4" /><span className="sr-only"> (tienda verificada)</span></> : null}
            </Link>
            <span className="t-meta">{[store.city, giftExchangeLabel(store.exchange_days)].filter(Boolean).join(" · ")}</span>
            {store.note ? <span className="t-meta">{store.note}</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 t-meta">{GIFT_EXCHANGE_DISCLAIMER}</p>
    </section>
  );
}
