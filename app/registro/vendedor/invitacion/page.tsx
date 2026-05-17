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
  title: "Invitacion de vendedor",
};

export default async function SellerInvitePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent("/registro/vendedor/invitacion")}&error=${encodeURIComponent(
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
    metadataAccountType === STORE_OWNER_ACCOUNT_TYPE ||
    profile?.account_type === STORE_OWNER_ACCOUNT_TYPE
  ) {
    return (
      <InvitePageShell
        eyebrow="Invitacion"
        title="Esta invitacion parece ser para una tienda"
        description="Te llevamos al flujo correcto para activar la cuenta de tienda."
      >
        <InviteRecoveryPanel
          title="Flujo de tienda"
          message="Esta cuenta tiene metadata de tienda. Usa la configuracion de tienda para completar el perfil correcto."
          primaryHref="/registro/tienda/invitacion"
          primaryLabel="Ir a invitacion de tienda"
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
        eyebrow="Invitacion"
        title="No pudimos confirmar esta invitacion"
        description="La cuenta ya tiene otro tipo de perfil. Revisa que hayas abierto el enlace correcto."
      >
        <InviteRecoveryPanel
          title="Cuenta con tipo distinto"
          message="Para evitar duplicar o cambiar perfiles por error, vuelve a iniciar sesion con el enlace correcto o contacta al equipo de Laria."
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
      eyebrow="Cuenta de vendedor"
      title="Activa tu cuenta de vendedor"
      description="Completa tu perfil para administrar tus publicaciones en Laria."
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            Desde tu cuenta podras publicar instrumentos, editar tus
            publicaciones, marcarlas como vendidas o retirarlas cuando ya no
            esten disponibles.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-ink">Despues de activar</p>
            <p className="mt-1">
              Podras crear tu primera publicacion. Laria mantiene el contacto
              con compradores por WhatsApp y no procesa pagos ni envios.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
