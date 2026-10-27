"use client";

import Link from "next/link";
import { Check, ListPlus, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { recordContact } from "@/components/whatsapp-contact-link";
import { buttonClasses } from "@/components/ui/button";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import {
  COMBO_MAX_ITEMS,
  COMBO_STORAGE_KEY,
  bundleOfferText,
  comboTotal,
  inCombo,
  parseCombos,
  removeComboItem,
  toggleComboItem,
  type BundleOffer,
  type ComboItem,
  type Combos,
} from "@/lib/combo";
import { comboContactMessage } from "@/lib/contact-message";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";

// buy-01 "Combo": the buyer's per-seller list, kept in this browser only (lib/combo.ts). Every action is a button;
// the list is sent as one WhatsApp message, and each listing in it counts as a contact for its seller.

const EMPTY: Combos = {};
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Combos = EMPTY;

function read(): Combos {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(COMBO_STORAGE_KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseCombos(raw);
  }
  return cached;
}

function write(next: Combos) {
  cached = next;
  try {
    cachedRaw = JSON.stringify(next);
    window.localStorage.setItem(COMBO_STORAGE_KEY, cachedRaw);
  } catch {
    // Storage blocked: the list lasts for this page.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === COMBO_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function useCombos() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

type Seller = { key: string; name: string; type: "individual" | "store" };
type Item = Omit<ComboItem, "addedAt">;

// "Agregar al combo" for one listing, with what it does in one line.
export function ComboToggle({ seller, item, size = "md", className }: { seller: Seller; item: Item; size?: "sm" | "md"; className?: string }) {
  const combos = useCombos();
  const [full, setFull] = useState(false);
  const added = inCombo(combos, seller.key, item.id);
  return (
    <div className={cn("grid gap-1", className)}>
      <button
        type="button"
        aria-pressed={added}
        onClick={() => {
          const result = toggleComboItem(read(), seller.key, seller.name, item);
          setFull(result.full);
          if (!result.full) write(result.combos);
        }}
        className={buttonClasses({ variant: "secondary", size: size === "sm" ? "sm" : "md", className: cn("w-fit", size === "sm" && "min-h-11", added && "border-ink bg-accent-tint hover:bg-accent-tint") })}
      >
        {added ? <Check aria-hidden /> : <ListPlus aria-hidden />}
        {added ? "En tu combo" : "Agregar al combo"}
      </button>
      {full ? <p role="status" className="t-meta">Tu combo ya tiene {COMBO_MAX_ITEMS} publicaciones, el máximo.</p> : null}
    </div>
  );
}

// The listing page's combo block: the toggle, the seller's discount if any, and the list once it has something.
export function ComboPanel({ seller, item, offer, whatsappNumber, className }: { seller: Seller; item: Item; offer: BundleOffer | null; whatsappNumber: string; className?: string }) {
  const combos = useCombos();
  const items = combos[seller.key]?.items ?? [];
  const total = comboTotal(items);
  const missing = offer ? Math.max(0, offer.min_items - items.length) : 0;
  const href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(comboContactMessage(items, seller.type, offer))}`;
  const headingId = `combo-${item.id}`;

  return (
    <section aria-labelledby={headingId} className={cn("grid gap-3 rounded-panel border border-subtle p-4", className)}>
      <div>
        <h2 id={headingId} className="t-ui font-semibold text-ink">{items.length ? `Tu combo con ${seller.name} (${items.length})` : "Arma un combo"}</h2>
        <p className="mt-0.5 t-meta">
          {offer ? `${seller.name} ofrece ${bundleOfferText(offer)}. ` : ""}
          Junta varias publicaciones de este vendedor y escríbele una sola vez. Se guarda solo en este dispositivo.
        </p>
      </div>
      <ComboToggle seller={seller} item={item} />
      {items.length ? (
        <>
          <ul className="grid gap-1.5">
            {items.map((entry) => (
              <li key={entry.id} className="flex min-w-0 items-center gap-2">
                <Link href={`/instrumentos/${entry.slug}`} className="link min-w-0 flex-1 truncate t-ui">{entry.title}</Link>
                <span className="shrink-0 t-ui font-semibold tabular-nums text-ink">{entry.price_pen === null ? "A consultar" : formatPrice(entry.price_pen)}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${entry.title} del combo`}
                  onClick={() => write(removeComboItem(read(), seller.key, entry.id))}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-ink hover:bg-canvas"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {total !== null && items.length > 1 ? <p className="t-ui text-ink">Suma de precios publicados: <strong>{formatPrice(total)}</strong></p> : null}
          {offer ? (
            <p className="t-meta">
              {missing ? `Agrega ${missing === 1 ? "1 más" : `${missing} más`} para el descuento que ofrece. ` : "Tu combo ya alcanza el descuento que ofrece. "}
              El precio final se acuerda con el vendedor.
            </p>
          ) : null}
          {items.length > 1 ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { for (const entry of items) void recordContact({ listingId: entry.id, source: "detail" }); }}
              // The page's one primary action stays "Contactar por WhatsApp".
              className={buttonClasses({ variant: "secondary", className: "w-full" })}
            >
              <WhatsAppGlyph />Pedir el combo por WhatsApp
            </a>
          ) : (
            <p className="t-meta">Agrega otra publicación de {seller.name} para pedirlas juntas.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
