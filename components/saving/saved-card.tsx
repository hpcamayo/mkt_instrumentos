import Link from "next/link";
import type { ReactNode } from "react";
import { MarketplaceImage } from "@/components/marketplace-image";
import { Price } from "@/components/ui/price";
import { formatPrice } from "@/lib/price";
import { StatusTag } from "@/components/ui/tag";

// A saved or viewed listing: photo, title, price (with the earlier price when it dropped) and its actions.
export function SavedCard({
  href,
  title,
  imageUrl,
  price,
  previousPrice,
  sold = false,
  meta,
  children,
}: {
  href: string | null;
  title: string;
  imageUrl: string | null;
  price: number | null;
  previousPrice?: number | null;
  sold?: boolean;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  const heading = href ? (
    <Link href={href} className="hover:underline hover:decoration-accent hover:decoration-2">{title}</Link>
  ) : title;
  return (
    <li className="flex min-w-0 flex-col rounded-panel border border-subtle bg-white p-4">
      {imageUrl ? (
        <MarketplaceImage src={imageUrl} alt={title} width={480} height={360} sizes="(max-width: 640px) 100vw, 320px" loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-control object-cover" />
      ) : null}
      <h2 className="t-ui font-semibold text-ink">{heading}</h2>
      <div className="mt-2 grid gap-1">
        {sold ? <StatusTag domain="availability" status="sold" /> : <Price value={price} />}
        {!sold && previousPrice && price !== null ? (
          <p className="t-meta">
            Antes <span className="line-through">{formatPrice(previousPrice)}</span> → {formatPrice(price)}, desde que lo guardaste
          </p>
        ) : null}
        {meta}
      </div>
      {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
    </li>
  );
}
