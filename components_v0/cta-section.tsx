import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { buttonClasses } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="bg-white py-10 md:py-14">
      <PageContainer>
        <div className="surface-frame relative overflow-hidden rounded-panel bg-frame p-6 text-white sm:p-8 lg:p-10">
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="t-micro text-muted-dark">
                Publica gratis
              </p>
              <h2 className="mt-3 max-w-3xl text-[28px] font-bold leading-[32px] stretch-semicond md:text-[40px] md:leading-[44px]">
                La musica nos conecta.
                <br />
                <span className="text-accent">Laria lo hace posible.</span>
              </h2>
              <p className="mt-4 max-w-xl t-body text-muted-dark">
                Sube tu instrumento, espera la revision del equipo y recibe
                consultas directas por WhatsApp.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link
                href="/publicar"
                className={buttonClasses()}
              >
                Publicar mi equipo
              </Link>
              <Link
                href="/listados"
                className={buttonClasses({ variant: "onDark" })}
              >
                Explorar productos
              </Link>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
