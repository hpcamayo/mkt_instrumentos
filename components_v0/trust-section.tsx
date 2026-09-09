import { BadgeCheck, MessageCircle, SearchCheck, Store } from "lucide-react";
import { PageContainer } from "@/components/page-container";

const features = [
  {
    icon: SearchCheck,
    title: "Publicaciones revisadas",
    description:
      "Listados aprobados para mantener el marketplace simple y ordenado.",
  },
  {
    icon: Store,
    title: "Tiendas activas",
    description:
      "Productos de tiendas tambien aparecen en la busqueda general.",
  },
  {
    icon: MessageCircle,
    title: "Contacto directo",
    description: "Habla con el vendedor por WhatsApp antes de coordinar.",
  },
  {
    icon: BadgeCheck,
    title: "Marketplace honesto",
    description: "Laria no procesa pagos, envios, garantias ni comisiones.",
  },
];

export function TrustSection() {
  return (
    <section className="bg-white py-8">
      <PageContainer>
        <div className="grid overflow-hidden rounded-lg border border-laria-fog bg-white shadow-sm md:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border-b border-laria-fog p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-laria-blue/10">
                  <feature.icon className="h-5 w-5 text-laria-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-laria-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-laria-text-soft">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
