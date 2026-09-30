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
      "Productos de tiendas también aparecen en la búsqueda general.",
  },
  {
    icon: MessageCircle,
    title: "Contacto directo",
    description: "Habla con el vendedor por WhatsApp antes de coordinar.",
  },
  {
    icon: BadgeCheck,
    title: "Marketplace honesto",
    description: "Laria no procesa pagos ni envíos, no retiene dinero y no garantiza transacciones.",
  },
];

export function TrustSection() {
  return (
    <section className="bg-white py-8">
      <PageContainer>
        <div className="grid overflow-hidden rounded-panel border border-subtle bg-white md:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border-b border-subtle p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint">
                  <feature.icon className="h-5 w-5 text-ink" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="t-ui font-semibold text-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-1 t-meta">
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
