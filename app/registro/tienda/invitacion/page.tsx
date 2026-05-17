import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { InviteProfileSetupForm } from "@/components/invite-profile-setup-form";
import { InviteRecoveryPanel } from "@/components/invite-recovery-panel";
import { PageContainer } from "@/components/page-container";
import {
  INDIVIDUAL_SELLER_ACCOUNT_TYPE,
  STORE_OWNER_ACCOUNT_TYPE,
} from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = {
  title: "Invitacion de tienda",
};

export default async function StoreInvitePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent("/registro/tienda/invitacion")}&error=${encodeURIComponent(
        "Inicia sesion desde tu enlace de invitacion para continuar.",
      )}`,
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data: profile } = supabase
    ? await supabase
        .from("profiles")
        .select("full_name, phone, city, region, account_type")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const metadataAccountType = readMetadata(user.user_metadata, "account_type");

  if (
    metadataAccountType === INDIVIDUAL_SELLER_ACCOUNT_TYPE ||
    profile?.account_type === INDIVIDUAL_SELLER_ACCOUNT_TYPE
  ) {
    return (
      <InvitePageShell
        eyebrow="Invitacion"
        title="Esta cuenta parece ser de vendedor particular"
        description="Para evitar cambiar el tipo de perfil por error, usa el flujo de vendedor o solicita una nueva invitacion de tienda."
      >
        <InviteRecoveryPanel
          title="No pudimos confirmar una invitacion de tienda"
          message="La metadata de la invitacion o el perfil actual indican vendedor particular. Si necesitas registrar una tienda, pide al equipo de Laria una invitacion de tienda con account_type store_owner."
          primaryHref="/registro/vendedor/invitacion"
          primaryLabel="Ir a invitacion de vendedor"
          secondaryHref="/registrar-tienda"
          secondaryLabel="Registrar tienda sin invitacion"
        />
      </InvitePageShell>
    );
  }

  if (
    !metadataAccountType &&
    (!profile?.account_type || profile.account_type !== STORE_OWNER_ACCOUNT_TYPE)
  ) {
    return (
      <InvitePageShell
        eyebrow="Invitacion"
        title="Falta informacion de la invitacion"
        description="No encontramos metadata suficiente para confirmar que este enlace sea de tienda."
      >
        <InviteRecoveryPanel
          title="Elige un camino seguro"
          message="Si vendes como particular, usa el flujo de vendedor. Si representas una tienda, puedes enviar una solicitud publica o pedir una nueva invitacion de tienda."
          primaryHref="/registro/vendedor/invitacion"
          primaryLabel="Soy vendedor particular"
          secondaryHref="/registrar-tienda"
          secondaryLabel="Enviar solicitud de tienda"
        />
      </InvitePageShell>
    );
  }

  return (
    <InvitePageShell
      eyebrow="Cuenta de tienda"
      title="Activa la cuenta de tu tienda"
      description="Completa los datos de contacto de la persona responsable. La tienda necesitara aprobacion antes de publicar productos."
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            Despues de activar tu cuenta, completa la solicitud de tienda. El
            equipo de Laria revisara la informacion antes de activar la pagina
            publica o permitir publicaciones de tienda.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-ink">Importante</p>
            <p className="mt-1">
              La activacion de cuenta no aprueba la tienda automaticamente. Un
              administrador debe revisar y aprobar la solicitud.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <InviteProfileSetupForm
            mode="store"
            email={user.email ?? null}
            initialValues={{
              fullName:
                profile?.full_name ??
                readMetadata(user.user_metadata, "contact_person") ??
                readMetadata(user.user_metadata, "full_name") ??
                readMetadata(user.user_metadata, "name") ??
                "",
              phone:
                profile?.phone ??
                readMetadata(user.user_metadata, "whatsapp") ??
                readMetadata(user.user_metadata, "phone") ??
                "",
              city:
                profile?.city ?? readMetadata(user.user_metadata, "city") ?? "",
              region:
                profile?.region ??
                readMetadata(user.user_metadata, "region") ??
                "",
            }}
          />
        </div>
      </div>
    </InvitePageShell>
  );
}

function InvitePageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <PageContainer as="main" className="py-8 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            {eyebrow}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm leading-6 text-slate-600 sm:text-base">
            {description}
          </p>
        </div>
        {children}
      </div>
    </PageContainer>
  );
}

function readMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
