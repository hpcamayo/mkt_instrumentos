"use client";

import { MakerFields } from "@/components/listing-details/maker-fields";
import { SALE_TERMS_KEY, SaleTermsFields } from "@/components/listing-details/sale-terms-fields";
import type { ListingDetailAccess } from "@/lib/listing-detail-access";
import { MAKER_KEY, readMakerForm } from "@/lib/maker-details";
import { readSaleTerms } from "@/lib/sale-terms";

// listing-details: every batch's extra listing fields in the sell and edit forms, rendered once by each form
// (lib/listing-details.ts has their checks, the database their writers). The form keeps `details` by key and sends
// it as is; a batch adding a field adds one line inside the block below, nothing in the forms themselves.
// The price mode sits next to the price, so the forms place PriceModeField themselves.

export type DetailError = { key?: string; field?: string; message: string };

export function ListingDetailFields({
  idPrefix,
  details,
  onChange,
  error,
  previous,
  access = {},
  heading = "h3",
}: {
  idPrefix: string;
  details: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  error?: DetailError | null;
  // The details of the seller's last listing on this device, for "Usar lo de tu última publicación".
  previous?: Record<string, unknown> | null;
  // For fields only a store (or only a Particular) sees; sale terms are for both.
  isStore: boolean;
  // Fields that depend on the seller (lib/listing-detail-access.ts). Left out, those fields are not shown: the edit
  // page has discovery's own maker form.
  access?: ListingDetailAccess;
  heading?: "h2" | "h3";
}) {
  const errorFor = (key: string) => (error && error.key === key ? error : undefined);
  return (
    <>
      {/* BEGIN listing detail fields (additive: one element per key, in the order the form shows them) */}
      <SaleTermsFields
        idPrefix={idPrefix}
        heading={heading}
        value={readSaleTerms(details[SALE_TERMS_KEY])}
        onChange={(value) => onChange(SALE_TERMS_KEY, value)}
        error={errorFor(SALE_TERMS_KEY)}
        previous={previous?.[SALE_TERMS_KEY] ? readSaleTerms(previous[SALE_TERMS_KEY]) : null}
      />
      {access.maker ? (
        <MakerFields idPrefix={idPrefix} heading={heading} access={access.maker} value={readMakerForm(details[MAKER_KEY])} onChange={(value) => onChange(MAKER_KEY, value)} error={errorFor(MAKER_KEY)} />
      ) : null}
      {/* END listing detail fields */}
    </>
  );
}
