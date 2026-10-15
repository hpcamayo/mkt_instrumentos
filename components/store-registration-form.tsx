"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { LocationFields } from "@/components/location-fields";
import { useFormErrors } from "@/components/use-form-errors";
import { storeFieldErrors } from "@/lib/form-validation";
import { PageNotice } from "@/components/page-notice";
import { normalizePeruRegion } from "@/lib/location";
import { createPublicSubmission, type SubmissionFile } from "@/lib/public-submission";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { Database } from "@/lib/supabase/database.types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, FileInput, Input } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export type StoreApplication = {
  id: string;
  name: string;
  razon_social: string | null;
  ruc: string | null;
  email: string | null;
  contact_person: string | null;
  whatsapp_phone: string;
  city: string;
  region: string;
  district: string | null;
  address: string | null;
  description: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: "pending" | "active" | "hidden" | "rejected";
  is_verified: boolean;
  rejection_reason: string | null;
};

type StorePhoto = { id: string; image_url: string; alt_text: string | null };
type State = "idle" | "submitting" | "success" | "error";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function StoreRegistrationForm({
  store = null,
  photos = [],
  defaultEmail = "",
}: {
  store?: StoreApplication | null;
  photos?: StorePhoto[];
  defaultEmail?: string;
}) {
  const [validation, errorSummary] = useFormErrors("tienda-reg", "guardar los datos de la tienda");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const submit = useMemo(() => (supabase ? createPublicSubmission(supabase) : null), [supabase]);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [currentPhotos, setCurrentPhotos] = useState(photos);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(store?.logo_url ?? null);
  const [currentBannerUrl, setCurrentBannerUrl] = useState(store?.banner_url ?? null);

  function show(nextState: State, nextMessage: string) {
    setState(nextState);
    setMessage(nextMessage);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !submit) {
      show("error", "No se pudo conectar con Laria. Intenta nuevamente.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const region = normalizePeruRegion(text(data, "region"));
    const fields = {
      name: text(data, "name"),
      razon_social: text(data, "razon_social"),
      ruc: digits(text(data, "ruc")),
      email: text(data, "email").toLowerCase(),
      contact_person: text(data, "contact_person"),
      whatsapp_phone: digits(text(data, "whatsapp_phone")),
      city: text(data, "city"),
      region: region ?? "",
      district: text(data, "district"),
      address: text(data, "address"),
      description: text(data, "description"),
      instagram_url: text(data, "instagram_url"),
      facebook_url: text(data, "facebook_url"),
      tiktok_url: text(data, "tiktok_url"),
      website_url: text(data, "website_url"),
    };
    const logo = image(data, "logo");
    const banner = image(data, "banner");
    const removeLogo = store !== null && data.get("remove_logo") === "on";
    const removeBanner = store !== null && data.get("remove_banner") === "on";
    const physicalPhotos = images(data, "store_photos");
    const fieldErrors = storeFieldErrors(fields);
    for (const [name, files] of Object.entries({ logo: logo ? [logo] : [], banner: banner ? [banner] : [], store_photos: physicalPhotos })) {
      if (files.some((file) => !allowedImage(file) || file.size > MAX_IMAGE_BYTES)) fieldErrors[name] = "Usa imágenes JPG, PNG o WebP de hasta 5 MB.";
    }
    if (currentPhotos.length + physicalPhotos.length > 5) fieldErrors.store_photos = "Puedes guardar hasta 5 fotos del local.";
    if (!validation.validate(form, fieldErrors)) {
      setState("idle");
      setMessage("");
      return;
    }

    setState("submitting");
    setMessage("");
    try {
      if (!store) {
        const uploadFiles: SubmissionFile[] = [
          ...(logo ? [{ file: logo, role: "logo" as const }] : []),
          ...(banner ? [{ file: banner, role: "banner" as const }] : []),
          ...physicalPhotos.map((file) => ({ file, role: "store_photo" as const })),
        ];
        await submit("store", fields, uploadFiles);
        form.reset();
        show("success", "Solicitud enviada. Ya puedes preparar inventario mientras el equipo revisa la Tienda.");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Tu sesión venció. Ingresa nuevamente.");
      const updates: Database["public"]["Tables"]["stores"]["Update"] = {
        ...fields,
        ...(removeLogo ? { logo_url: null } : {}),
        ...(removeBanner ? { banner_url: null } : {}),
      };
      const newPhysicalRows: { store_id: string; image_url: string; alt_text: string; sort_order: number }[] = [];
      const uploadItems: SubmissionFile[] = [
        ...(logo ? [{ file: logo, role: "logo" as const }] : []),
        ...(banner ? [{ file: banner, role: "banner" as const }] : []),
        ...physicalPhotos.map((file) => ({ file, role: "store_photo" as const })),
      ];
      for (const [index, item] of uploadItems.entries()) {
        const path = `${userData.user.id}/${store.id}/profile-${Date.now()}-${index}.${extension(item.file.type)}`;
        const { error } = await supabase.storage.from("store-assets").upload(path, item.file, { cacheControl: "31536000" });
        if (error) throw error;
        const url = supabase.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
        if (item.role === "logo") updates.logo_url = url;
        else if (item.role === "banner") updates.banner_url = url;
        else newPhysicalRows.push({ store_id: store.id, image_url: url, alt_text: `Foto de ${fields.name}`, sort_order: currentPhotos.length + newPhysicalRows.length });
      }
      const { error: updateError } = await supabase.from("stores").update(updates).eq("id", store.id);
      if (updateError) throw updateError;
      if (logo || removeLogo) setCurrentLogoUrl((updates.logo_url as string | null) ?? null);
      if (banner || removeBanner) setCurrentBannerUrl((updates.banner_url as string | null) ?? null);
      if (newPhysicalRows.length) {
        const { data: rows, error } = await supabase.from("store_photos").insert(newPhysicalRows).select("id,image_url,alt_text");
        if (error) throw error;
        setCurrentPhotos((current) => [...current, ...(rows ?? [])]);
      }
      if (store.status === "rejected") {
        const { error } = await supabase.rpc("resubmit_store_application", { p_store_id: store.id });
        if (error) throw error;
      }
      show("success", store.status === "rejected" ? "Cambios guardados y solicitud reenviada para revisión." : "Datos de la tienda actualizados.");
    } catch (error) {
      const message = getStoreSubmissionErrorMessage(error);
      if (message === "Este RUC ya está registrado en Laria.") {
        validation.setFieldError("ruc", message);
        setState("idle");
        setMessage("");
      } else show("error", message);
    }
  }

  async function removeStorePhoto(photo: StorePhoto) {
    if (!supabase || !store) return;
    const { error } = await supabase.from("store_photos").delete().eq("id", photo.id).eq("store_id", store.id);
    if (error) {
      show("error", "No se pudo quitar la foto del local.");
      return;
    }
    setCurrentPhotos((current) => current.filter((item) => item.id !== photo.id));
    validation.clear("store_photos");
    show("success", "Foto del local eliminada.");
  }

  return (
    <form ref={validation.formRef} noValidate onSubmit={handleSubmit} onChange={validation.onChange} className="grid gap-6 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      {message ? <PageNotice kind={state === "success" ? "success" : "error"} message={message}>{state === "success" ? <div className="mt-3 flex flex-wrap gap-3"><Link href="/mi-cuenta" className="link font-semibold">Volver al resumen</Link><Link href="/mi-cuenta/tienda" className="link font-semibold">Ver estado de mi tienda</Link>{store ? <Link href="/mi-cuenta/tienda/inventario" className="link font-semibold">Ver inventario</Link> : null}</div> : null}</PageNotice> : null}
      {errorSummary}
      <div className="grid gap-5 sm:grid-cols-2">
        <StoreField label="Nombre público de la tienda" name="name" error={validation.errorFor("name")} defaultValue={store?.name} />
        <StoreField label="Razón social" name="razon_social" error={validation.errorFor("razon_social")} defaultValue={store?.razon_social} />
        <StoreField label="RUC" name="ruc" error={validation.errorFor("ruc")} inputMode="numeric" defaultValue={store?.ruc} />
        <StoreField label="Correo comercial" name="email" error={validation.errorFor("email")} type="email" defaultValue={store?.email ?? defaultEmail} />
        <StoreField label="Persona de contacto" name="contact_person" error={validation.errorFor("contact_person")} defaultValue={store?.contact_person} />
        <StoreField label="Teléfono / WhatsApp" name="whatsapp_phone" error={validation.errorFor("whatsapp_phone")} inputMode="tel" defaultValue={store?.whatsapp_phone} />
        <LocationFields idPrefix="tienda-reg" cityError={validation.errorFor("city")} regionError={validation.errorFor("region")} defaultCity={store?.city} defaultRegion={store?.region} />
        <StoreField label="Distrito (opcional)" name="district" required={false} defaultValue={store?.district} />
        <StoreField label="Dirección física" name="address" error={validation.errorFor("address")} defaultValue={store?.address} />
      </div>
      <Field id="tienda-reg-description" label="Descripción" optional><Textarea name="description" rows={5} defaultValue={store?.description ?? ""} /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <StoreField label="Instagram (opcional)" name="instagram_url" required={false} defaultValue={store?.instagram_url} />
        <StoreField label="Facebook (opcional)" name="facebook_url" required={false} defaultValue={store?.facebook_url} />
        <StoreField label="TikTok (opcional)" name="tiktok_url" required={false} defaultValue={store?.tiktok_url} />
        <StoreField label="Sitio web (opcional)" name="website_url" required={false} defaultValue={store?.website_url} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <ImageField label="Logo (opcional)" name="logo" error={validation.errorFor("logo")} currentUrl={currentLogoUrl} />
        <ImageField label="Banner (opcional)" name="banner" error={validation.errorFor("banner")} currentUrl={currentBannerUrl} />
      </div>
      <Field id="tienda-reg-store-photos" error={validation.errorFor("store_photos")} label="Fotos del local (opcionales, hasta 5)"><FileInput name="store_photos" multiple accept="image/jpeg,image/png,image/webp" /></Field>
      {currentPhotos.length ? <ul className="grid gap-3 sm:grid-cols-3">{currentPhotos.map((photo) => <li key={photo.id} className="rounded-panel border border-subtle p-2"><Image src={photo.image_url} alt={photo.alt_text ?? "Foto del local"} width={320} height={220} className="aspect-[4/3] w-full rounded-control object-cover" /><button type="button" onClick={() => removeStorePhoto(photo)} className={buttonClasses({ variant: "danger", size: "sm", block: true, className: "mt-2 min-h-11" })}>Quitar foto</button></li>)}</ul> : null}
      <Button type="submit" block className="sm:w-auto sm:justify-self-start" loading={state === "submitting"} loadingLabel="Guardando…">{store ? "Guardar datos de la tienda" : "Enviar solicitud de tienda"}</Button>
    </form>
  );
}

function StoreField({ label, name, required = true, defaultValue, type = "text", inputMode, error }: { label: string; error?: string; name: string; required?: boolean; defaultValue?: string | null; type?: string; inputMode?: "text" | "tel" | "numeric" }) {
  return <Field id={`tienda-reg-${name}`} label={label} error={error}><Input name={name} type={type} required={required} defaultValue={defaultValue ?? ""} inputMode={inputMode} /></Field>;
}

function ImageField({ label, name, currentUrl, error }: { label: string; name: string; currentUrl?: string | null; error?: string }) {
  return <div className="flex min-w-0 flex-col gap-1.5"><Field id={name} label={label} error={error}><FileInput name={name} accept="image/jpeg,image/png,image/webp" /></Field>{currentUrl ? <><span className="t-meta">Imagen actual guardada</span><Checkbox name={"remove_" + name} label="Quitar la imagen actual" className="min-h-0 py-1" /></> : null}</div>;
}

function text(data: FormData, key: string) { const value = data.get(key); return typeof value === "string" ? value.trim() : ""; }
function digits(value: string) { return value.replace(/\D/g, ""); }
function image(data: FormData, key: string) { const value = data.get(key); return value instanceof File && value.size ? value : null; }
function images(data: FormData, key: string) { return data.getAll(key).filter((value): value is File => value instanceof File && value.size > 0); }
function allowedImage(file: File) { return ["image/jpeg", "image/png", "image/webp"].includes(file.type); }
function extension(type: string) { return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp"; }

export function getStoreSubmissionErrorMessage(error: unknown) {
  const detail = typeof error === "string" ? error
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  if (
    detail.includes("stores_ruc_unique_idx") ||
    /RUC.+registrad|registrad.+RUC/i.test(detail)
  ) {
    return "Este RUC ya está registrado en Laria.";
  }
  return "No se pudieron guardar los cambios. Intenta nuevamente.";
}
