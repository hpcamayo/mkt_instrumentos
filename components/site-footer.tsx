import { PageContainer } from "@/components/page-container";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <PageContainer className="flex flex-col gap-2 py-6 text-sm text-slate-500">
        <p className="font-semibold text-ink">Instrumentos Perú</p>
        <p>Contacto directo por WhatsApp. Sin pagos, checkout, envíos ni chat interno.</p>
      </PageContainer>
    </footer>
  );
}
