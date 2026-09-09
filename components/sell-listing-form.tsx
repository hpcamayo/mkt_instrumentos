"use client";

import { type FormEvent, useMemo, useState } from "react";
import { categoryOptions, cityOptions, conditionOptions } from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

import { createPublicSubmission } from "@/lib/public-submission";

type FormState = "idle" | "submitting" | "success" | "error";

const maxPhotos = 6;
const maxPhotoSizeBytes = 5 * 1024 * 1024;

export function SellListingForm() {
  const supabase = useMemo(() => getPublicSupabaseClient(), []);
  const submit = useMemo(
    () => (supabase ? createPublicSubmission(supabase) : null),
    [supabase],
  );
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !submit) {
      setState("error");
      setMessage(
        "Falta configurar Supabase. Agrega las variables públicas en .env.local y reinicia el servidor.",
      );
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const photos = formData.getAll("photos").filter(isImageFile);

    const title = readRequired(formData, "title");
    const category = readRequired(formData, "category");
    const brand = readRequired(formData, "brand");
    const model = readRequired(formData, "model");
    const condition = readRequired(formData, "condition");
    const pricePen = Number(readRequired(formData, "price_pen"));
    const city = readRequired(formData, "city");
    const sellerName = readRequired(formData, "seller_name");
    const sellerWhatsapp = readRequired(formData, "seller_whatsapp");
    const normalizedWhatsapp = normalizePhone(sellerWhatsapp);
    const description = readRequired(formData, "description");

    if (
      !title ||
      !category ||
      !brand ||
      !model ||
      !condition ||
      !city ||
      !sellerName ||
      normalizedWhatsapp.length < 9 ||
      !description ||
      !Number.isFinite(pricePen) ||
      pricePen < 0 ||
      photos.length === 0
    ) {
      setState("error");
      setMessage(
        "Completa todos los campos obligatorios, agrega un WhatsApp válido y sube al menos una foto.",
      );
      return;
    }

    if (photos.length > maxPhotos) {
      setState("error");
      setMessage(`Puedes subir hasta ${maxPhotos} fotos por publicación.`);
      return;
    }

    if (photos.some((photo) => photo.size > maxPhotoSizeBytes)) {
      setState("error");
      setMessage("Cada foto debe pesar 5 MB o menos.");
      return;
    }

    setState("submitting");
    setMessage("");

    try {
      await submit(
        "listing",
        {
          title,
          category,
          brand,
          model,
          condition,
          price_pen: pricePen,
          city,
          contact_name: sellerName,
          whatsapp_phone: normalizedWhatsapp,
          description,
        },
        photos,
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar el envío. Intenta nuevamente.",
      );
      return;
    }

    form.reset();
    setState("success");
    setMessage(
      "Publicación enviada. Un administrador la revisará antes de que aparezca en los listados públicos.",
    );
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
          `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y
          reinicia el servidor de desarrollo.
        </div>
      ) : null}

      <TextField label="Título" name="title" required />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Categoría"
          name="category"
          required
          options={categoryOptions}
        />
        <SelectField
          label="Condición"
          name="condition"
          required
          options={conditionOptions.map((condition) => ({
            value: condition,
            label: condition,
          }))}
        />
        <TextField label="Marca" name="brand" required />
        <TextField label="Modelo" name="model" required />
        <NumberField label="Precio en soles" name="price_pen" required />
        <SelectField
          label="Ciudad"
          name="city"
          required
          options={cityOptions.map((city) => ({ value: city, label: city }))}
        />
        <TextField label="Nombre del vendedor" name="seller_name" required />
        <TextField
          label="WhatsApp del vendedor"
          name="seller_whatsapp"
          required
          inputMode="tel"
          placeholder="51987654321"
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

      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Fotos
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
        />
        <span className="text-xs font-normal text-slate-500">
          Sube hasta {maxPhotos} fotos en JPG, PNG o WebP. Máximo 5 MB por foto.
        </span>
      </label>

      <button
        type="submit"
        disabled={state === "submitting" || !supabase}
        className="inline-flex w-full items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
      >
        {state === "submitting" ? "Enviando..." : "Enviar para revisión"}
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

type NumberFieldProps = {
  label: string;
  name: string;
  required?: boolean;
};

function NumberField({ label, name, required }: NumberFieldProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        min="0"
        name={name}
        required={required}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brass focus:ring-2 focus:ring-amber-100"
      />
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  options: readonly {
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

function readRequired(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isImageFile(value: FormDataEntryValue): value is File {
  return (
    value instanceof File && value.size > 0 && value.type.startsWith("image/")
  );
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
