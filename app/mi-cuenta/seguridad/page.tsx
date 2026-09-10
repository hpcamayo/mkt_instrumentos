import Link from "next/link";
import { Suspense } from "react";
import { PageContainer } from "@/components/page-container";
import { PasswordUpdateForm } from "@/components/password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Cambiar contraseña" };
export default async function SecurityPage() {
  await requireUser("/mi-cuenta/seguridad");
  return <PageContainer className="py-10"><div className="mx-auto max-w-md rounded-lg border border-laria-fog bg-white p-6 shadow-sm"><Link href="/mi-cuenta" className="text-sm font-black text-laria-blue">← Volver a mi cuenta</Link><h1 className="mt-4 text-2xl font-black text-laria-ink">Cambiar contraseña</h1><p className="mt-2 text-sm leading-6 text-laria-text-soft">La nueva contraseña debe tener al menos 8 caracteres.</p><Suspense><PasswordUpdateForm mode="change" /></Suspense></div></PageContainer>;
}
