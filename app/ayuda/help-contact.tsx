import Link from "next/link";
import { HelpTicketForm } from "@/components/help/help-ticket-form";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { buttonClasses } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { supportWhatsApp } from "@/lib/help/support";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// safe-10 (accounts batch): the "¿No encontraste tu respuesta?" block at the end of the help center and of each article.
export async function HelpContact({ topic, pagePath }: { topic: string | null; pagePath: string | null }) {
  const user = await getCurrentUser();
  let account: { name: string; email: string } | null = null;
  if (user?.email) {
    const supabase = await getSupabaseServerClient();
    const { data: profile } = supabase ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
    account = { name: profile?.full_name?.trim() ?? "", email: user.email };
  }
  const whatsapp = supportWhatsApp();

  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="scroll-mt-24 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      <h2 id="contacto-titulo" className="t-section text-ink">¿No encontraste tu respuesta?</h2>
      <p className="mt-1 t-meta">
        Escríbenos y te respondemos por correo.
        {account ? <> Tus consultas y respuestas quedan en <Link href="/ayuda/mis-consultas" className="link font-semibold">Mis consultas</Link>.</> : null}
      </p>
      <div className="mt-4">
        <HelpTicketForm account={account} topic={topic} pagePath={pagePath} />
      </div>
      {whatsapp ? (
        <div className="mt-6 grid gap-2 border-t border-subtle pt-5">
          <p className="t-ui font-semibold text-ink">También por WhatsApp</p>
          <p className="t-meta">Atendemos {whatsapp.hours} al {whatsapp.display}. Fuera de ese horario, mejor usa el formulario.</p>
          <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", className: "justify-self-start" })}>
            <WhatsAppGlyph />
            Escribir a Laria por WhatsApp
          </a>
        </div>
      ) : null}
    </section>
  );
}
