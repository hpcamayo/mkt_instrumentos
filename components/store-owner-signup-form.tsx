"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SignupConfirmation } from "@/components/signup-confirmation";
import { LocationFields } from "@/components/location-fields";
import { profileFieldErrors } from "@/lib/form-validation";
import { checkEmailAvailability, signUpErrorFoundExistingAccount, signUpFoundExistingAccount } from "@/lib/auth/email-check";
import { SIGN_UP_PAUSED, TOO_MANY_ATTEMPTS, isAuthRateLimited } from "@/lib/auth/limits";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import {
  STORE_OWNER_ACCOUNT_TYPE,
  upsertStoreOwnerProfile,
  validateSellerProfileInput,
} from "@/lib/auth/profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useFormErrors } from "@/components/use-form-errors";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Notice } from "@/components/ui/notice";

type State = "checking" | "idle" | "submitting" | "sent" | "error";

export function StoreOwnerSignupForm() {
  const router = useRouter();
  const [validation, errorSummary] = useFormErrors("tienda-cuenta", "crear tu cuenta");
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("error");
      setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/mi-cuenta");
        router.refresh();
      } else {
        setState("idle");
      }
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || state === "checking" || state === "submitting" || state === "sent") return;
    submitting.current = true;
    try {
      await createAccount(event.currentTarget);
    } catch {
      setState("error");
      setMessage("No se pudo completar la solicitud. Revisa tu conexión e intenta nuevamente.");
    } finally {
      submitting.current = false;
    }
  }

  async function createAccount(form: HTMLFormElement) {
    setState("submitting");
    setMessage("");
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const profileInput = {
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
    };
    if (!validation.validate(form, profileFieldErrors(profileInput))) {
      setState("idle");
      return;
    }
    const validated = validateSellerProfileInput(profileInput);
    if (!validated.ok) {
      setState("error");
      setMessage(validated.message);
      return;
    }
    if (!email || password.length < PASSWORD_MIN_LENGTH) {
      setState("error");
      setMessage(`Ingresa un correo y una contraseña de al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    const emailCheck = await checkEmailAvailability(email);
    if (emailCheck === "limited") {
      setState("error");
      setMessage(TOO_MANY_ATTEMPTS);
      return;
    }
    if (emailCheck === "exists") {
      setState("error");
      setMessage("Ese correo ya está registrado. Usa un correo exclusivo para la Tienda.");
      validation.setFieldError("email", "Ese correo ya está registrado. Usa un correo exclusivo para la Tienda.");
      return;
    }
    // A check that couldn't answer stops nothing: the sign-up below still finds an address that has an account.
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("error");
      setMessage("No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }
    const profile = validated.profile;
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/mi-cuenta?confirmed=1")}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          account_type: STORE_OWNER_ACCOUNT_TYPE,
          full_name: profile.fullName,
          phone: profile.phone,
          city: profile.city,
          region: profile.region,
        },
      },
    });
    if (isAuthRateLimited(error)) {
      setState("error");
      setMessage(SIGN_UP_PAUSED);
      return;
    }
    const existingAccount = error
      ? signUpErrorFoundExistingAccount(error)
      : signUpFoundExistingAccount(data.user, STORE_OWNER_ACCOUNT_TYPE);
    if (error && !existingAccount) {
      setState("error");
      setMessage("No se pudo crear la cuenta. Usa un correo exclusivo para la Tienda e intenta nuevamente.");
      return;
    }
    if (existingAccount) {
      setState("error");
      setMessage("Ese correo ya está registrado. Usa un correo exclusivo para la Tienda.");
      validation.setFieldError("email", "Ese correo ya está registrado. Usa un correo exclusivo para la Tienda.");
      return;
    }
    if (data.session && data.user) {
      const saved = await upsertStoreOwnerProfile(supabase, data.user.id, profile);
      if (!saved.ok) {
        setState("error");
        setMessage(saved.message);
        return;
      }
      router.push("/mi-cuenta");
      router.refresh();
      return;
    }
    setSentTo(email);
    setState("sent");
    setMessage("Cuenta creada. Revisa tu correo para confirmar la cuenta de Tienda. El enlace te llevará a Mi cuenta.");
  }

  if (state === "sent") {
    return <SignupConfirmation email={sentTo} message={message} />;
  }

  return (
    <form ref={validation.formRef} noValidate onSubmit={handleSubmit} onChange={validation.onChange} className="grid gap-5">
      {errorSummary}
      <div className="grid gap-4 sm:grid-cols-2">
        <SignupField label="Nombre de la persona responsable" name="fullName" error={validation.errorFor("fullName")} autoComplete="name" />
        <SignupField label="Correo exclusivo de la cuenta" name="email" error={validation.errorFor("email")} type="email" autoComplete="email" />
        {/* auth-01 and auth-03: the eye on the password and the +51 WhatsApp field, as in the Particular sign-up. */}
        <Field id="tienda-password" label="Contraseña" error={validation.errorFor("password")} hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}>
          <PasswordInput name="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
        </Field>
        <Field id="tienda-phone" label="WhatsApp de contacto" error={validation.errorFor("phone")}>
          <PhoneInput name="phone" required />
        </Field>
        <LocationFields idPrefix="tienda-cuenta" cityError={validation.errorFor("city")} regionError={validation.errorFor("region")} />
      </div>
      {message ? (
        <Notice tone="warning">{message}</Notice>
      ) : null}
      <p className="t-meta">
        Al crear la cuenta aceptas los{" "}
        <Link href="/terminos" target="_blank" className="link font-semibold">términos y reglas del marketplace</Link> y la{" "}
        <Link href="/privacidad" target="_blank" className="link font-semibold">política de privacidad</Link>.
      </p>
      <Button type="submit" block loading={state === "checking" || state === "submitting"} loadingLabel={state === "submitting" ? "Creando cuenta…" : undefined}>
        Crear cuenta de Tienda
      </Button>
      <p className="text-center t-ui text-ink-2">
        ¿Ya tienes una cuenta de Tienda? <Link href="/login?next=/mi-cuenta" className="link font-semibold">Ingresar</Link>
      </p>
    </form>
  );
}

function SignupField({ label, error, ...props }: { label: string; error?: string; name: string; type?: string; autoComplete?: string }) {
  return (
    <Field id={`tienda-${props.name}`} label={label} error={error}>
      <Input required {...props} />
    </Field>
  );
}
