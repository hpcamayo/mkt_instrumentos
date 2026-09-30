import { NOINDEX_ROBOTS } from "@/lib/site";
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
  robots: NOINDEX_ROBOTS,
  title: "Invitación de Tienda",
};

export default async function StoreInvitePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent("/registro/tienda/invitacion")}&error=${encodeURIComponent(
        "Inicia sesión desde tu enlace de invitación para continuar.",
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
        eyebrow="Invitación"
        title="Esta cuenta parece ser Particular"
        description="Para no cambiar el tipo de cuenta por error, continúa como Particular o pide una nueva invitación de Tienda."
      >
        <InviteRecoveryPanel
          title="No pudimos confirmar una invitación de Tienda"
          message="La invitación o el perfil actual corresponden a una cuenta Particular. Si necesitas registrar una tienda, pide al equipo de Laria una invitación de Tienda."
          primaryHref="/registro/vendedor/invitacion"
          primaryLabel="Continuar como Particular"
          secondaryHref="/registrar-tienda"
          secondaryLabel="Registrar tienda sin invitación"
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
        eyebrow="Invitación"
        title="Falta información de la invitación"
        description="No encontramos datos suficientes para confirmar que este enlace sea de una Tienda."
      >
        <InviteRecoveryPanel
          title="Elige un camino seguro"
          message="Si vendes como Particular, continúa con esa cuenta. Si representas una tienda, envía una solicitud o pide una nueva invitación de Tienda."
          primaryHref="/registro/vendedor/invitacion"
          primaryLabel="Vendo como Particular"
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
      description="Completa los datos de contacto de la persona responsable. La tienda necesitará aprobación antes de publicar."
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4 t-ui text-ink-2">
          <p>
            Después de activar tu cuenta, completa la solicitud de tienda. El
            equipo de Laria revisará la información antes de activar la página
            pública o permitir publicaciones.
          </p>
          <div className="rounded-panel border border-subtle bg-white p-4">
            <p className="font-semibold text-ink">Importante</p>
            <p className="mt-1">
              Activar la cuenta no aprueba la tienda automáticamente. Un
              administrador debe revisar y aprobar la solicitud.
            </p>
          </div>
        </div>

        <div className="rounded-panel border border-subtle bg-white p-6">
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
    <PageContainer as="section" className="py-8 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="max-w-2xl space-y-3">
          <p className="t-micro text-ink-2">
            {eyebrow}
          </p>
          <h1 className="t-page text-ink">
            {title}
          </h1>
          <p className="t-body text-ink-2">
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
