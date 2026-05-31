import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3,
  ExternalLink,
  FileText,
  LogOut,
  Megaphone,
  Settings,
  UserRound,
} from "lucide-react";
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
  const accountTypeLabel = getAccountTypeLabel(profile?.account_type);
  const locationLabel = [profile?.city, profile?.region]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="bg-laria-cloud/70">
      <PageContainer className="py-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:gap-6">
          <aside className="rounded-lg border border-laria-fog bg-white p-4 shadow-[0_16px_36px_rgb(16_18_23/0.06)] lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-md bg-laria-black p-4 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-yellow">
                Cuenta Laria
              </p>
              <h1 className="mt-2 text-2xl font-black">Mi panel</h1>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Administra tu perfil y prepara tus publicaciones.
              </p>
            </div>

            <nav aria-label="Navegación de cuenta" className="mt-4 grid gap-2">
              <DashboardNavItem
                icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
                label="Resumen"
                isActive
              />
              <DashboardNavItem
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
                label="Publicaciones"
              />
              <DashboardNavItem
                icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
                label="Perfil"
              />
              <DashboardNavItem
                icon={<Settings className="h-4 w-4" aria-hidden="true" />}
                label="Configuración"
              />
            </nav>

            <div className="mt-4 grid gap-2 border-t border-laria-fog pt-4">
              <Link
                href="/vender"
                className="laria-button-primary min-h-11 px-4 py-3 text-sm"
              >
                Publicar nuevo listado
              </Link>
              <Link
                href="/logout"
                className="laria-button-secondary min-h-11 gap-2 px-4 py-3 text-sm"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Cerrar sesión
              </Link>
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_18px_48px_rgb(16_18_23/0.07)] sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
                    Resumen
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-laria-ink sm:text-4xl">
                    Hola, {profile?.full_name || user.email || "vendedor"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-laria-text-soft sm:text-base">
                    Este panel mantiene tu sesión activa y centraliza las
                    acciones principales para vender en Laria.
                  </p>
                </div>
                <Link
                  href="/vender"
                  className="laria-button-primary min-h-12 w-full px-5 py-3 text-sm uppercase tracking-wide sm:w-auto"
                >
                  Publicar nuevo listado
                </Link>
              </div>
            </section>

            <section
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Indicadores del panel"
            >
              {/* UI placeholder only; replace with real seller metrics when analytics/listing ownership data is wired. */}
              <DashboardStatCard label="Publicaciones activas" value="--" />
              {/* UI placeholder only; replace with real seller metrics when analytics/listing ownership data is wired. */}
              <DashboardStatCard label="En revisión" value="--" />
              {/* UI placeholder only; replace with real seller metrics when analytics/listing ownership data is wired. */}
              <DashboardStatCard label="Vistas" value="--" />
              {/* UI placeholder only; replace with real seller metrics when analytics/listing ownership data is wired. */}
              <DashboardStatCard label="Contactos" value="--" />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <section className="rounded-lg border border-laria-fog bg-white shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
                <div className="flex flex-col gap-3 border-b border-laria-fog p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-blue">
                      Publicaciones
                    </p>
                    <h2 className="mt-1 text-xl font-black text-laria-ink">
                      Mis listados
                    </h2>
                  </div>
                  <Link
                    href="/vender"
                    className="laria-button-secondary min-h-10 gap-2 px-4 py-2 text-sm"
                  >
                    Nuevo listado
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-laria-cloud text-xs font-black uppercase tracking-wide text-laria-text-soft">
                      <tr>
                        <th className="px-5 py-3">Instrumento</th>
                        <th className="px-5 py-3">Estado</th>
                        <th className="px-5 py-3">Precio</th>
                        <th className="px-5 py-3">Actividad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-laria-fog">
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-10 text-center text-laria-text-soft"
                        >
                          <FileText
                            className="mx-auto h-8 w-8 text-laria-blue/70"
                            aria-hidden="true"
                          />
                          <p className="mt-3 font-bold text-laria-ink">
                            Aún no hay publicaciones conectadas a este panel.
                          </p>
                          <p className="mx-auto mt-2 max-w-md text-sm leading-6">
                            Puedes publicar un instrumento y administrarlo desde
                            aquí cuando el flujo de publicaciones del vendedor
                            esté conectado.
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)] sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-blue">
                  Perfil
                </p>
                <h2 className="mt-1 text-xl font-black text-laria-ink">
                  Datos de cuenta
                </h2>
                <dl className="mt-5 grid gap-4 text-sm">
                  <ProfileField
                    label="Nombre"
                    value={profile?.full_name ?? "-"}
                  />
                  <ProfileField label="Correo" value={user.email ?? "-"} />
                  <ProfileField
                    label="WhatsApp"
                    value={profile?.phone ?? "-"}
                  />
                  <ProfileField label="Tipo de cuenta" value={accountTypeLabel} />
                  <ProfileField
                    label="Ubicación"
                    value={locationLabel || "-"}
                  />
                </dl>
              </section>
            </div>

            <section className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)] sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-laria-blue">
                    Actividad
                  </p>
                  <h2 className="mt-1 text-xl font-black text-laria-ink">
                    Rendimiento
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-laria-text-soft">
                    Las métricas reales se conectarán cuando el panel de
                    publicaciones y analítica esté implementado.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-laria-blue/25 bg-laria-blue/10 px-3 py-2 text-xs font-black text-laria-blue">
                  <Megaphone className="h-4 w-4" aria-hidden="true" />
                  Próximamente
                </div>
              </div>

              {/* UI placeholder only; replace with real analytics chart when supported by the product. */}
              <div
                className="mt-5 flex h-28 items-end gap-2 rounded-lg border border-laria-fog bg-laria-cloud p-4"
                aria-hidden="true"
              >
                {[34, 58, 42, 72, 50, 84, 64, 76, 46, 68, 56, 88].map(
                  (height, index) => (
                    <div
                      key={index}
                      className="min-w-0 flex-1 rounded-t bg-laria-blue/70"
                      style={{ height: `${height}%` }}
                    />
                  ),
                )}
              </div>
            </section>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}

function DashboardNavItem({
  icon,
  label,
  isActive = false,
}: {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
}) {
  return (
    <div
      className={
        isActive
          ? "flex min-h-10 items-center gap-3 rounded-md border border-laria-blue/35 bg-laria-blue/10 px-3 py-2 text-sm font-black text-laria-blue"
          : "flex min-h-10 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-bold text-laria-text-soft"
      }
    >
      {icon}
      {label}
    </div>
  );
}

function DashboardStatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-laria-fog bg-white p-5 shadow-[0_14px_34px_rgb(16_18_23/0.06)]">
      <p className="text-xs font-black uppercase tracking-wide text-laria-text-soft">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-black text-laria-ink">{value}</p>
        <div
          className="flex h-9 w-14 items-end gap-1 rounded bg-laria-blue/10 px-2 py-1"
          aria-hidden="true"
        >
          <span className="h-3 w-2 rounded-t bg-laria-blue/45" />
          <span className="h-5 w-2 rounded-t bg-laria-blue/65" />
          <span className="h-7 w-2 rounded-t bg-laria-blue" />
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-laria-fog bg-laria-cloud p-3">
      <dt className="text-xs font-black uppercase tracking-wide text-laria-blue">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-laria-ink">
        {value}
      </dd>
    </div>
  );
}

function getAccountTypeLabel(accountType?: string | null) {
  if (accountType === "seller" || accountType === "individual") {
    return "Vendedor particular";
  }

  if (accountType === "store_owner") {
    return "Dueño de tienda";
  }

  return accountType ?? "-";
}
