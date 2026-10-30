"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";

export function ConfirmationRecovery({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const address = email.trim().toLowerCase();

  return (
    <div className="mt-6 space-y-4">
      <Field id="confirmation-email" label="Correo de tu cuenta">
        <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" />
      </Field>
      <ResendConfirmation email={address} next={next} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)} />
    </div>
  );
}
