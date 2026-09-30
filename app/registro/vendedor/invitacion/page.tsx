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
  title: "Invitación de cuenta Particular",
};

export default async function SellerInvitePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent("/registro/vendedor/invitacion")}&error=${encodeURIComponent(
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
    metadataAccountType === STORE_OWNER_ACCOUNT_TYPE ||
    profile?.account_type === STORE_OWNER_ACCOUNT_TYPE
  ) {
    return (
      <InvitePageShell
        eyebrow="Invitación"
        title="Esta invitación parece ser para una Tienda"
        description="Te llevamos al paso correcto para activar la cuenta de Tienda."
      >
        <InviteRecoveryPanel
          title="Cuenta de Tienda"
          message="Esta cuenta está registrada como Tienda. Completa el perfil desde la invitación de Tienda."
          primaryHref="/registro/tienda/invitacion"
          primaryLabel="Ir a la invitación de Tienda"
          secondaryHref="/mi-cuenta"
          secondaryLabel="Ver mi cuenta"
        />
      </InvitePageShell>
    );
  }

  if (
    profile?.account_type &&
    profile.account_type !== INDIVIDUAL_SELLER_ACCOUNT_TYPE
  ) {
    return (
      <InvitePageShell
        eyebrow="Invitación"
        title="No pudimos confirmar esta invitación"
        description="La cuenta ya tiene otro tipo de perfil. Revisa que hayas abierto el enlace correcto."
      >
        <InviteRecoveryPanel
          title="Cuenta con tipo distinto"
          message="Para evitar duplicar o cambiar perfiles por error, vuelve a iniciar sesión con el enlace correcto o contacta al equipo de Laria."
          primaryHref="/login"
          primaryLabel="Volver a ingresar"
          secondaryHref="/mi-cuenta"
          secondaryLabel="Ver mi cuenta"
        />
      </InvitePageShell>
    );
  }

  return (
    <InvitePageShell
      eyebrow="Cuenta Particular"
      title="Activa tu cuenta Particular"
      description="Completa tu perfil para administrar tus publicaciones en Laria."
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4 t-ui text-ink-2">
          <p>
            Desde tu cuenta podrás publicar instrumentos, editar tus
            publicaciones, marcarlas como vendidas o retirarlas cuando ya no
            estén disponibles.
          </p>
          <div className="rounded-panel border border-subtle bg-white p-4">
            <p className="font-semibold text-ink">Después de activar</p>
            <p className="mt-1">
              Podrás crear tu primera publicación. Los compradores te
              contactarán por WhatsApp; Laria no procesa pagos ni envíos.
            </p>
          </div>
        </div>

        <div className="rounded-panel border border-subtle bg-white p-6">
          <InviteProfileSetupForm
            mode="seller"
            email={user.email ?? null}
            initialValues={{
              fullName:
                profile?.full_name ??
                readMetadata(user.user_metadata, "full_name") ??
                readMetadata(user.user_metadata, "name") ??
                "",
              phone:
                profile?.phone ?? readMetadata(user.user_metadata, "phone") ?? "",
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
