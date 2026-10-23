import { NOINDEX_ROBOTS } from "@/lib/site";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { MarketplaceImage } from "@/components/marketplace-image";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { loginReason } from "@/lib/auth/login-reason";
import { parsePublicListingCards } from "@/lib/favorites";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Ingresar",
};

// save-03: the page says why it asks ("Ingresa para guardar «Fender Stratocaster»", with its photo), and creating
// an account is an equal choice in the form.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const motivo = typeof params.motivo === "string" ? params.motivo : null;
  const slug = next?.match(/^\/instrumentos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1] ?? null;
  const client = slug ? await getSupabaseServerClient() : null;
  const listing = client && slug
    ? parsePublicListingCards((await client.rpc("get_public_listing_cards", { p_ids: [], p_slugs: [slug] })).data)[0] ?? null
    : null;
  const reason = loginReason(motivo, listing?.title ?? null);

  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto max-w-md rounded-panel border border-subtle bg-white p-6">
        {listing ? (
          <div className="mb-5 flex items-center gap-3 rounded-control bg-canvas p-3">
            {listing.image_url ? <MarketplaceImage src={listing.image_url} alt="" width={64} height={64} sizes="64px" className="h-16 w-16 shrink-0 rounded-control object-cover" /> : null}
            <p className="min-w-0 t-ui font-semibold text-ink">{listing.title}</p>
          </div>
        ) : null}
        <PageHeader
          eyebrow="Cuenta Laria"
          title={reason.title}
          meta={reason.meta}
        />
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </PageContainer>
  );
}
