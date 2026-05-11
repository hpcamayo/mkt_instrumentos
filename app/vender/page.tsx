import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { SellListingForm } from "@/components/sell-listing-form";

export const metadata: Metadata = {
  title: "Vender instrumento",
  description:
    "Publica tu instrumento usado para revisión y conecta con compradores por WhatsApp.",
  openGraph: {
    title: "Vende tu instrumento usado",
    description:
      "Envía tu publicación para revisión y aparece en Instrumentos Perú cuando sea aprobada.",
    url: "/vender",
  },
};

export default function SellPage() {
  return (
    <PageContainer as="section" className="py-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Vender
          </p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            Publica tu instrumento usado
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Completa los datos del instrumento y envía tu publicación para
            revisión. Cuando sea aprobada, aparecerá en los listados públicos.
          </p>
        </div>
        <SellListingForm />
      </div>
    </PageContainer>
  );
}
