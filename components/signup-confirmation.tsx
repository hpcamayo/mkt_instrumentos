import type { ReactNode } from "react";
import { PageNotice } from "@/components/page-notice";
import { Button } from "@/components/ui/button";

export function SignupConfirmation({
  email,
  message,
  loginHref = "/login",
  children,
}: {
  email: string;
  message: string;
  loginHref?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageNotice kind="success" message={message}>
        <p className="mt-2">
          Enviamos un enlace de confirmación a <strong className="break-all">{email}</strong>.
        </p>
        <p className="mt-2">
          Si no lo encuentras, revisa tu carpeta de spam o correo no deseado.
        </p>
        {children}
      </PageNotice>
      <Button href={loginHref} variant="secondary" block>Ir a ingresar</Button>
    </div>
  );
}
