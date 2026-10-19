import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { EMAIL_LINK_LABELS, readEmailLinkToken, type EmailLinkAction } from "@/lib/email/links";
import { NOINDEX_ROBOTS } from "@/lib/site";

export const metadata = { title: "Correos de Laria", robots: NOINDEX_ROBOTS };
export const dynamic = "force-dynamic";

// save-07: where "Pausar esta alerta", "No más bajas de precio" and "No más resumen semanal" land. One button, no
// sign-in, and a link to choose more in Mi cuenta › Correos.
export default async function EmailLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const done = typeof params.hecho === "string" && params.hecho in EMAIL_LINK_LABELS ? (params.hecho as EmailLinkAction) : null;
  const failed = typeof params.error === "string";
  const token = typeof params.token === "string" ? params.token : null;
  const payload = !done && !failed ? readEmailLinkToken(token) : null;
  const manage = <Link href="/mi-cuenta/correos" className={buttonClasses({ variant: "secondary" })}>Elegir qué correos recibo</Link>;

  return (
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto grid max-w-md gap-5 rounded-panel border border-subtle bg-white p-6">
        <PageHeader eyebrow="Correos de Laria" title={done ? "Listo" : payload ? EMAIL_LINK_LABELS[payload.action].question : "Este enlace ya no sirve"} />
        {done ? (
          <>
            <Notice tone="success" role="status">{EMAIL_LINK_LABELS[done].done}</Notice>
            <div className="flex flex-wrap gap-2">{manage}</div>
          </>
        ) : payload ? (
          <form method="post" action="/api/email/unsubscribe" className="grid gap-4">
            <input type="hidden" name="token" value={token ?? ""} />
            <input type="hidden" name="desde" value="pagina" />
            <p className="t-body text-ink-2">No hace falta ingresar. Puedes cambiarlo de nuevo cuando quieras.</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClasses()}>{EMAIL_LINK_LABELS[payload.action].link}</button>
              {manage}
            </div>
          </form>
        ) : (
          <>
            <Notice tone="warning" role="alert">{failed ? "No pudimos aplicar el cambio. Ingresa a tu cuenta para hacerlo desde ahí." : "El enlace venció o no es válido. Ingresa a tu cuenta para elegir qué correos recibes."}</Notice>
            <div className="flex flex-wrap gap-2">
              <Link href="/login?next=%2Fmi-cuenta%2Fcorreos" className={buttonClasses()}>Ingresar</Link>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
