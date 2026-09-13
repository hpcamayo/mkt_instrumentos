import { Suspense } from "react";
import { PasswordUpdateForm } from "@/components/password-form";

export const metadata = { title: "Cambiar contraseña" };
export default async function SecurityPage() {
  return <div className="max-w-md rounded-lg border border-laria-fog bg-white p-6 shadow-sm"><h1 className="text-2xl font-black text-laria-ink">Cambiar contraseña</h1><p className="mt-2 text-sm leading-6 text-laria-text-soft">La nueva contraseña debe tener al menos 8 caracteres.</p><Suspense><PasswordUpdateForm mode="change" /></Suspense></div>;
}
