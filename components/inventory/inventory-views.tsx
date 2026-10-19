"use client";

import { Bookmark, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction } from "@/lib/inventory-client";
import {
  BUILT_IN_VIEWS,
  DEFAULT_FILTERS,
  filtersForRpc,
  filtersFromRpc,
  inventoryHref,
  sameFilters,
  viewFilters,
  type InventoryFilters,
  type InventoryView,
} from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-17: saved views as chips. Four every store has, then the store's own (up
// to 12). "Guardar vista" appears when the filters on screen are not a view yet. Each chip is a link, so a view is a
// URL like any other filter.
export function InventoryViews({ filters, views, canWrite }: { filters: InventoryFilters; views: InventoryView[]; canWrite: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const own = views.map((view) => ({ ...view, screen: filtersFromRpc(view.filters) }));
  const builtIn = BUILT_IN_VIEWS.map((view) => ({ name: view.name, screen: viewFilters(view.filters) }));
  const isDefault = sameFilters({ ...filters, sort: DEFAULT_FILTERS.sort }, DEFAULT_FILTERS);
  const known = [...builtIn, ...own].some((view) => sameFilters(view.screen, filters));

  async function remove(view: InventoryView) {
    setError("");
    const result = await inventoryAction({ action: "view_delete", view_id: view.id });
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <nav aria-label="Vistas guardadas" className="border-b border-subtle px-4 py-3 md:px-5">
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
        {builtIn.map((view) => (
          <li key={view.name}>
            <ChipLink href={inventoryHref(view.screen)} selected={sameFilters(view.screen, filters)} current="page">{view.name}</ChipLink>
          </li>
        ))}
        {own.map((view) => (
          <li key={view.id} className="flex items-center">
            <ChipLink href={inventoryHref(view.screen)} selected={sameFilters(view.screen, filters)} current="page" className="rounded-r-none">{view.name}</ChipLink>
            {canWrite ? (
              <button
                type="button"
                aria-label={`Borrar la vista ${view.name}`}
                title={`Borrar la vista ${view.name}`}
                onClick={() => remove(view)}
                className="inline-flex h-10 w-9 items-center justify-center rounded-r-control border border-l-0 border-line-strong bg-surface text-ink hover:bg-canvas [&_svg]:h-4 [&_svg]:w-4"
              >
                <X aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
        {canWrite && !isDefault && !known ? (
          <li>
            <Button variant="quiet" icon={<Bookmark aria-hidden />} onClick={() => setSaving(true)} aria-haspopup="dialog">Guardar vista</Button>
          </li>
        ) : null}
      </ul>
      {error ? <Notice tone="danger" role="alert" className="mt-2">{error}</Notice> : null}
      {saving ? <SaveViewSheet filters={filters} onClose={() => setSaving(false)} /> : null}
    </nav>
  );
}

function SaveViewSheet({ filters, onClose }: { filters: InventoryFilters; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) return setError("Ponle un nombre, por ejemplo “Cuerdas por reponer”.");
    setBusy(true);
    const result = await inventoryAction({ action: "view_save", name, filters: filtersForRpc(filters) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      title="Guardar esta vista"
      closeLabel="Cerrar sin guardar"
      onDismiss={onClose}
      layout="responsive"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={id} loading={busy} loadingLabel="Guardando…">Guardar</Button>
        </div>
      }
    >
      <form id={id} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
        <p className="t-body text-ink-2">Guarda la búsqueda, los filtros y el orden de ahora para abrirlos con un toque. Si usas un nombre que ya tienes, la vista se reemplaza.</p>
        <Field id={`${id}-name`} label="Nombre de la vista" error={error}>
          <Input name="name" maxLength={40} autoComplete="off" />
        </Field>
      </form>
    </Sheet>
  );
}
