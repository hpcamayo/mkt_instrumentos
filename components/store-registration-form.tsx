"use client";

import { type FormEvent, useMemo, useState } from "react";
import { cityOptions } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

type FormState = "idle" | "submitting" | "success" | "error";

const maxImageSizeBytes = 5 * 1024 * 1024;

export function StoreRegistrationForm() {
  const supabase = useMemo(() => getPublicSupabaseClient(), []);
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setState("error");
      setMessage(
        "Falta configurar Supabase. Agrega las variables públicas en .env.local y reinicia el servidor.",
      );
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = readText(formData, "name");
    const city = readText(formData, "city");
    const district = readText(formData, "district");
    const address = readText(formData, "address");
    const whatsapp = normalizePhone(readText(formData, "whatsapp"));
    const instagram = readText(formData, "instagram");
    const facebook = readText(formData, "facebook");
    const description = readText(formData, "description");
    const logo = readImage(formData, "logo");
    const banner = readImage(formData, "banner");

    if (
      !name ||
      !city ||
      !district ||
      !address ||
      whatsapp.length < 9 ||
      !description ||
      !logo ||
      !banner
    ) {
      setState("error");
      setMessage(
        "Completa los campos obligatorios, agrega un WhatsApp válido, un logo y un banner.",
      );
      return;
    }

    if (logo.size > maxImageSizeBytes || banner.size > maxImageSizeBytes) {
      setState("error");
      setMessage("El logo y el banner deben pesar 5 MB o menos cada uno.");
      return;
    }

    setState("submitting");
    setMessage("");

    const storeId = crypto.randomUUID();
    const slug = `${slugify(name)}-${storeId.slice(0, 8)}`;

    const logoUrl = await uploadStoreAsset({
      file: logo,
      folder: storeId,
      name: "logo",
    });
    if (!logoUrl) {
      setState("error");
      setMessage("No pudimos subir el logo. Intenta nuevamente.");
      return;
    }

    const bannerUrl = await uploadStoreAsset({
      file: banner,
      folder: storeId,
      name: "banner",
    });
    if (!bannerUrl) {
      setState("error");
      setMessage("No pudimos subir el banner. Intenta nuevamente.");
      return;
    }

    const { error } = await supabase.from("stores").insert({
      id: storeId,
      name,
      slug,
      description,
      status: "pending",
      listing_plan: "free",
      contact_name: name,
      whatsapp_phone: whatsapp,
      city,
      region: city === "Huancayo" ? "Junin" : city,
      district,
      address,
      instagram_url: instagram || null,
      facebook_url: facebook || null,
      logo_url: logoUrl,
      banner_url: bannerUrl,
    });

    if (error) {
      setState("error");
      setMessage("No pudimos registrar la tienda. Revisa los datos e intenta nuevamente.");
      return;
    }

    form.reset();
    setState("success");
    setMessage(
      "Tienda enviada. Un administrador revisará la solicitud antes de activar la página pública.",
    );

    async function uploadStoreAsset({
      file,
      folder,
      name: assetName,
    }: {
      file: File;
      folder: string;
      name: "logo" | "banner";
    }) {
      const path = `pending/${folder}/${assetName}-${crypto.randomUUID()}${getFileExtension(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("store-assets")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        return null;
      }

      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      return data.publicUrl;
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {message ? (
        <div
          className={
            state === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"
              : "rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
          }
        >
          {message}
        </div>
      ) : null}

      {!supabase ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Falta configurar Supabase. Copia `.env.example` a `.env.local`, agrega
          `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y reinicia
          el servidor de desarrollo.
        </div>
      ) : null}

      <TextField label="Nombre de la tienda" name="name" required />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Ciudad"
          name="city"
          required
          options={cityOptions.map((city) => ({ value: city, label: city }))}
        />
        <TextField label="Distrito" name="district" required />
        <TextField label="Dirección" name="address" required />
        <TextField
          label="WhatsApp"
          name="whatsapp"
          required
          inputMode="tel"
          placeholder="51987654321"
        />
        <TextField
          label="Instagram"
          name="instagram"
          placeholder="https://instagram.com/tu-tienda"
        />
        <TextField
          label="Facebook"
          name="facebook"
          placeholder="https://facebook.com/tu-tienda"
        />
      </div>

      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Descripción
        <textarea
          name="description"
          required
          rows={5}
          className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <ImageField label="Logo" name="logo" />
        <ImageField label="Banner" name="banner" />
      </div>

      <button
        type="submit"
        disabled={state === "submitting" || !supabase}
        className="inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
      >
        {state === "submitting" ? "Enviando..." : "Enviar tienda para revisión"}
      </button>
    </form>
  );
}

type TextFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  inputMode?: "text" | "tel";
  placeholder?: string;
};

function TextField({
  label,
  name,
  required,
  inputMode = "text",
  placeholder,
}: TextFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="text"
        name={name}
        required={required}
        inputMode={inputMode}
        placeholder={placeholder}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  options: {
    value: string;
    label: string;
  }[];
};

function SelectField({ label, name, required, options }: SelectFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        required={required}
        defaultValue=""
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      >
        <option value="" disabled>
          Selecciona una opción
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageField({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        required
        className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
      />
      <span className="text-xs font-normal text-slate-500">
        JPG, PNG o WebP. Máximo 5 MB.
      </span>
    </label>
  );
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readImage(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 && value.type.startsWith("image/")
    ? value
    : null;
}

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return slug || "tienda";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? `.${extension.toLowerCase()}` : "";
}
