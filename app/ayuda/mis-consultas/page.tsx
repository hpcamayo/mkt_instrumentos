import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageContainer } from "@/components/page-container";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { requireUser } from "@/lib/auth/session";
import { HELP_TICKET_TOPICS } from "@/lib/help/articles";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Mis consultas", robots: NOINDEX_ROBOTS };

type Ticket = { code: string; topic: string; message: string; status: string; answer: string | null; answered_at: string | null; created_at: string };

const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

// safe-10 (feature ideas, accounts batch): the questions sent from the help center while signed in, with their answers.
export default async function MyHelpTicketsPage() {
  await requireUser("/ayuda/mis-consultas");
  const supabase = await getSupabaseServerClient();
  const { data, error } = supabase ? await supabase.rpc("my_help_tickets") : { data: null, error: true };
  const tickets = Array.isArray(data) ? (data as unknown as Ticket[]) : [];

  return (
    <section className="bg-canvas/70">
      <PageContainer className="grid max-w-3xl gap-5 py-6 sm:py-8">
        <Breadcrumbs phoneBackLink items={[{ label: "Centro de ayuda", href: "/ayuda" }, { label: "Mis consultas" }]} />
        <PageHeader title="Mis consultas" meta="Lo que nos escribiste desde el Centro de ayuda y nuestras respuestas." />
        {error ? <Notice tone="danger"><p>No pudimos cargar tus consultas. Vuelve a intentarlo.</p></Notice> : null}
        {!error && !tickets.length ? (
          <EmptyState title="Aún no nos escribiste" description="Si no encuentras una respuesta en el Centro de ayuda, escríbenos desde ahí." actions={<Link href="/ayuda#contacto" className="link font-semibold">Escribir una consulta</Link>} />
        ) : null}
        <ul className="grid gap-4">
          {tickets.map((ticket) => (
            <li key={ticket.code} className="rounded-panel border border-subtle bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="t-ui font-semibold text-ink">
                  {ticket.code} · {HELP_TICKET_TOPICS.find((topic) => topic.id === ticket.topic)?.label ?? "Consulta"}
                </p>
                <Tag tone={ticket.status === "abierto" ? "warning" : "neutral"} icon={ticket.status === "abierto" ? <Clock aria-hidden /> : <Check aria-hidden />}>
                  {ticket.status === "abierto" ? "Sin responder" : ticket.status === "respondido" ? "Respondida" : "Cerrada"}
                </Tag>
              </div>
              <p className="mt-1 t-meta">Enviada el {dates.format(new Date(ticket.created_at))}</p>
              <p className="mt-3 whitespace-pre-line t-body text-ink-2">{ticket.message}</p>
              {ticket.answer ? (
                <div className="mt-4 rounded-panel bg-accent-tint p-4">
                  <p className="t-ui font-semibold text-ink">Respuesta de Laria{ticket.answered_at ? ` · ${dates.format(new Date(ticket.answered_at))}` : ""}</p>
                  <p className="mt-1 whitespace-pre-line t-body text-ink">{ticket.answer}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  );
}
