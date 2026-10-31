import Link from "next/link";
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { AccountDeletion } from "@/components/account/account-deletion";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Tus datos" };

// safe-09 (feature ideas, accounts batch): a copy of everything Laria holds about the account, and leaving as easily
// as joining. An Admin account, or one that runs a store, is closed with the team instead (FD-accounts-2).

type DeletionCheck = { allowed?: boolean; blocker?: string | null; listings_removed?: number; transactions_kept?: number; has_password?: boolean };

export default async function AccountDataPage() {
  const { supabase, user } = await getAccountContext();
  const { data, error } = supabase ? await supabase.rpc("my_account_deletion_check") : { data: null, error: true };
  const check = (data ?? {}) as DeletionCheck;
  const listings = Number(check.listings_removed) || 0;
  const transactions = Number(check.transactions_kept) || 0;

  return (
    <>
      <AccountSettingsTabs current="/mi-cuenta/datos" />
      <div className="grid max-w-2xl gap-5">
        <PageHeader title="Tus datos" meta="Descarga una copia de tu información o elimina tu cuenta." />
        <Section id="descargar" title="Descargar mis datos">
          <p className="t-body text-ink-2">
            Un archivo con tu perfil, publicaciones, borradores, favoritos, alertas, compras y ventas, reseñas, preguntas,
            consultas al Centro de ayuda y los dispositivos con los que ingresaste.
          </p>
          {/* A plain link: the browser saves the file the route answers with. */}
          <a href="/api/account/data" download className={buttonClasses({ variant: "secondary", className: "mt-4" })}>
            <Download aria-hidden />
            Descargar mis datos
          </a>
        </Section>
        <Section id="eliminar" title="Eliminar mi cuenta">
          {error ? (
            <Notice tone="danger"><p>No pudimos revisar tu cuenta. Vuelve a intentarlo en unos minutos.</p></Notice>
          ) : !check.allowed ? (
            <Notice tone="info" role="note">
              <p>
                {check.blocker === "admin"
                  ? "Las cuentas de Admin no se eliminan desde aquí. Pide a otra persona del equipo que retire tu acceso."
                  : <>Tu cuenta administra una tienda. Escríbenos desde el <Link href="/ayuda?tema=cuenta#contacto">Centro de ayuda</Link> y la cerramos contigo: así nadie se queda con un pedido o una consulta sin respuesta.</>}
              </p>
            </Notice>
          ) : (
            <div className="grid gap-4">
              <ul className="grid list-disc gap-1 pl-5 t-body text-ink-2">
                <li>{listings === 1 ? "Tu publicación deja de verse." : listings > 1 ? `Tus ${listings} publicaciones dejan de verse.` : "No tienes publicaciones activas."}</li>
                <li>Borramos tu nombre, WhatsApp, ciudad, favoritos, alertas, borradores y avisos.</li>
                <li>
                  {transactions > 0
                    ? `Tus ${transactions === 1 ? "compra o venta confirmada queda" : `${transactions} compras o ventas confirmadas quedan`} como «Cuenta eliminada», sin tu nombre, para que las reseñas de la otra persona sigan siendo ciertas.`
                    : "Las compras o ventas confirmadas quedarían como «Cuenta eliminada», sin tu nombre."}
                </li>
                <li>No se puede deshacer. Si quieres guardar algo, descarga tus datos primero.</li>
              </ul>
              <AccountDeletion email={user.email ?? ""} hasPassword={check.has_password !== false} />
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <h2 id={`${id}-titulo`} className="t-section text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
