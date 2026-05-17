import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = {
  title: "Mi cuenta",
};

export default async function AccountPage() {
  const user = await requireUser("/mi-cuenta");
  const supabase = await getSupabaseServerClient();
  const { data: profile } = supabase
    ? await supabase
        .from("profiles")
        .select("full_name, phone, city, region, account_type")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <PageContainer as="main" className="py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Cuenta Laria
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Mi cuenta
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Este espacio confirma que tu sesion esta activa. El panel de
            publicaciones se construira en el siguiente paso del sprint.
          </p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Perfil</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-500">Nombre</dt>
              <dd className="mt-1 text-ink">{profile?.full_name ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Correo</dt>
              <dd className="mt-1 text-ink">{user.email ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">WhatsApp</dt>
              <dd className="mt-1 text-ink">{profile?.phone ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Tipo de cuenta</dt>
              <dd className="mt-1 text-ink">
                {profile?.account_type === "seller"
                  ? "Vendedor particular"
                  : profile?.account_type ?? "-"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Ciudad</dt>
              <dd className="mt-1 text-ink">{profile?.city ?? "-"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Region</dt>
              <dd className="mt-1 text-ink">{profile?.region ?? "-"}</dd>
            </div>
          </dl>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            href="/vender"
          >
            Ver opciones para vender
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-ink transition hover:border-brass hover:text-brass"
            href="/logout"
          >
            Cerrar sesion
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
