import { NOINDEX_ROBOTS } from "@/lib/site";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { LogoutButton } from "@/components/logout-button";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
  title: "Solicitud de tienda",
  description: "Crea y administra la solicitud de tu tienda musical en Laria.",
};

export default async function RegisterStorePage() {
  const supabase = await getSupabaseServerClient();
  const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = userData.user;
  const { data: profile } = user && supabase
    ? await supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle()
    : { data: null };

  if (!user) {
    return <StoreGate title="Solicita tu tienda" body="Necesitas una cuenta de Tienda separada para vincular correctamente la aplicación y el inventario.">
      <Link href="/registro/tienda" className={buttonClasses()}>Crear cuenta de Tienda</Link>
      <Link href="/login?next=/registrar-tienda" className={buttonClasses({ variant: "secondary" })}>Ingresar</Link>
    </StoreGate>;
  }

  if (profile?.account_type !== "store_owner") {
    return <StoreGate title="Tu cuenta Particular se mantiene separada" body="No convertiremos esta cuenta en una cuenta de Tienda. Cierra sesión y crea una cuenta dedicada usando otro correo.">
      <LogoutButton className={buttonClasses()} />
      <Link href="/mi-cuenta" className={buttonClasses({ variant: "secondary" })}>Volver a Mi cuenta</Link>
    </StoreGate>;
  }

  redirect("/mi-cuenta/tienda");
}

function StoreGate({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return <PageContainer as="section" className="py-10"><div className="mx-auto max-w-2xl rounded-panel border border-subtle bg-white p-6"><h1 className="t-page text-ink">{title}</h1><p className="mt-3 text-sm leading-6 text-ink-2">{body}</p><div className="mt-5 flex flex-wrap gap-3">{children}</div></div></PageContainer>;
}
