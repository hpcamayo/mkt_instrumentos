"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { postDiscovery } from "@/components/discovery/post-json";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_COLLECTION_SETS,
  collectionDraftErrors,
  collectionSetHref,
  querySetFromInput,
  type Collection,
  type CollectionDraft,
} from "@/lib/discovery/collections";

type SetRow = { label: string; link: string };

const emptyRows = (count: number): SetRow[] => Array.from({ length: count }, () => ({ label: "", link: "" }));

// disc-03 Admin: a collection is a title, a text, optional dates, and up to four groups, each a name and a catalog
// link (filter the catalog, copy its address, paste it here). Saving checks the same rules as the database.
export function AdminCollectionEditor({ collection }: { collection: Collection | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<SetRow[]>(() => {
    const filled = (collection?.sets ?? []).map((set) => ({ label: set.label, link: collectionSetHref(set) }));
    return [...filled, ...emptyRows(Math.max(0, (collection ? 0 : 2) - filled.length))];
  });
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof collectionDraftErrors>>({});
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const prefix = collection ? `coleccion-${collection.id.slice(0, 8)}` : "coleccion-nueva";

  function updateRow(index: number, patch: Partial<SetRow>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const sets = rows
      .filter((row) => row.label.trim() || row.link.trim())
      .map((row) => ({ label: row.label.trim(), query: querySetFromInput(row.link) ?? "" }));
    const draft: CollectionDraft = {
      id: collection?.id ?? null,
      slug: String(form.get("slug") ?? "").trim(),
      title: String(form.get("title") ?? "").trim(),
      intro: String(form.get("intro") ?? "").trim(),
      sets,
      starts_on: String(form.get("starts_on") ?? "") || null,
      ends_on: String(form.get("ends_on") ?? "") || null,
      published: form.get("published") === "on",
      sort_order: Number(form.get("sort_order") ?? 100) || 100,
    };
    const found = collectionDraftErrors(draft);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    setBusy("save");
    const result = await postDiscovery("/api/admin/discovery", {
      action: "save_collection", id: draft.id, slug: draft.slug, title: draft.title, intro: draft.intro, sets: draft.sets,
      startsOn: draft.starts_on, endsOn: draft.ends_on, published: draft.published, sortOrder: draft.sort_order,
    });
    setBusy(null);
    setMessage(result.ok ? { tone: "success", text: "Colección guardada." } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  async function remove() {
    if (!collection || busy) return;
    setBusy("delete");
    const result = await postDiscovery("/api/admin/discovery", { action: "delete_collection", id: collection.id });
    setBusy(null);
    if (result.ok) router.refresh();
    else setMessage({ tone: "danger", text: result.message });
  }

  return (
    <form onSubmit={save} className="grid gap-4" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${prefix}-titulo`} label="Título" error={errors.title}>
          <Input name="title" defaultValue={collection?.title ?? ""} maxLength={80} />
        </Field>
        <Field id={`${prefix}-enlace`} label="Enlace" hint="Minúsculas, números y guiones: /colecciones/criollo-y-afroperuano" error={errors.slug}>
          <Input name="slug" defaultValue={collection?.slug ?? ""} maxLength={60} />
        </Field>
      </div>
      <Field id={`${prefix}-texto`} label="Texto" hint="Entre 20 y 400 caracteres." error={errors.intro}>
        <Textarea name="intro" defaultValue={collection?.intro ?? ""} maxLength={400} className="min-h-20" />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="t-ui font-semibold text-ink">Grupos</legend>
        <p className="t-meta">Filtra el catálogo como quieras, copia la dirección de la página y pégala aquí. Hasta {MAX_COLLECTION_SETS} grupos.</p>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 rounded-control border border-subtle p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field id={`${prefix}-grupo-${index}-nombre`} label={`Nombre del grupo ${index + 1}`}>
              <Input value={row.label} onChange={(event) => updateRow(index, { label: event.target.value })} maxLength={40} />
            </Field>
            <Field id={`${prefix}-grupo-${index}-filtros`} label="Enlace del catálogo">
              <Input value={row.link} onChange={(event) => updateRow(index, { link: event.target.value })} placeholder="/listados?category=guitars&max_price=500" />
            </Field>
          </div>
        ))}
        {errors.sets ? <p role="alert" className="t-ui font-semibold text-danger">{errors.sets}</p> : null}
        {rows.length < MAX_COLLECTION_SETS ? (
          <div><Button type="button" variant="secondary" size="sm" onClick={() => setRows((current) => [...current, ...emptyRows(1)])}>Agregar grupo</Button></div>
        ) : null}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-3">
        <Field id={`${prefix}-inicio`} label="Desde" optional error={errors.dates}>
          <Input name="starts_on" type="date" defaultValue={collection?.starts_on ?? ""} />
        </Field>
        <Field id={`${prefix}-fin`} label="Hasta" optional>
          <Input name="ends_on" type="date" defaultValue={collection?.ends_on ?? ""} />
        </Field>
        <Field id={`${prefix}-orden`} label="Orden" hint="Menor primero.">
          <Input name="sort_order" type="number" min={0} max={1000} defaultValue={collection?.sort_order ?? 100} />
        </Field>
      </div>
      <Checkbox name="published" defaultChecked={collection?.published ?? false} label="Publicada" description="Se ve en el inicio y en /colecciones entre las fechas indicadas." />
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy === "save"}>{collection ? "Guardar cambios" : "Crear colección"}</Button>
        {collection ? <Button type="button" variant="danger" onClick={remove} loading={busy === "delete"}>Eliminar</Button> : null}
      </div>
    </form>
  );
}
