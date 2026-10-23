"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

// Effortless Laria, inventory batch, stock-18: keyboard shortcuts for the shop computer. Every one has a button or a
// link on screen; the keys only save trips. They never fire while the owner types in a field or a sheet is open.
//   /           search the inventory
//   n           new SKU
//   v, r, a     sale, restock, adjust on the focused row (components/inventory/inventory-table.tsx)
//   ?           this list
//   Ctrl/Cmd+K  go anywhere in the store's account

const PLACES = [
  { label: "Inventario", href: "/mi-cuenta/tienda/inventario", words: "inventario sku stock" },
  { label: "Mostrador", href: "/mi-cuenta/tienda/inventario/mostrador", words: "mostrador venta caja escanear código" },
  { label: "Reposición", href: "/mi-cuenta/tienda/inventario/reponer", words: "reponer reposición pedido proveedor" },
  { label: "Precios", href: "/mi-cuenta/tienda/inventario/precios", words: "precios campaña descuento oferta" },
  { label: "Importar desde Excel", href: "/mi-cuenta/tienda/inventario/importar", words: "importar excel csv archivo carga" },
  { label: "Solicitudes de compra", href: "/mi-cuenta/tienda/solicitudes", words: "solicitudes compra whatsapp pedidos" },
  { label: "Publicaciones", href: "/mi-cuenta/tienda/inventario?vista=publicaciones", words: "publicaciones avisos" },
  { label: "Publicar", href: "/mi-cuenta/tienda/publicar", words: "publicar nueva publicación" },
  { label: "Estadísticas", href: "/mi-cuenta/tienda/estadisticas", words: "estadísticas vistas contactos" },
  { label: "Medios de pago", href: "/mi-cuenta/tienda/medios-de-pago", words: "pagos yape plin transferencia" },
  { label: "Mi tienda", href: "/mi-cuenta/tienda", words: "tienda perfil datos" },
] as const;

export const SHORTCUTS = [
  { keys: "/", label: "Buscar en tu inventario" },
  { keys: "n", label: "Nuevo SKU" },
  { keys: "v", label: "Registrar venta del SKU seleccionado en la lista" },
  { keys: "r", label: "Reponer stock del SKU seleccionado" },
  { keys: "a", label: "Ajustar (conteo) el SKU seleccionado" },
  { keys: "↑ ↓", label: "Moverte entre SKU de la lista" },
  { keys: "Ctrl K o ⌘ K", label: "Ir a cualquier sección" },
  { keys: "?", label: "Ver estos atajos" },
] as const;

function typingInField(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function InventoryShortcuts() {
  const [open, setOpen] = useState<"help" | "go" | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || document.querySelector("[role=dialog]")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        opener.current = document.activeElement as HTMLElement | null;
        setOpen("go");
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || typingInField(event.target)) return;
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>("[data-inventory-search]");
        if (!search) return;
        event.preventDefault();
        search.focus();
        search.select();
      } else if (event.key === "n") {
        const button = document.querySelector<HTMLButtonElement>("[data-shortcut=nuevo-sku]");
        if (!button) return;
        event.preventDefault();
        button.click();
      } else if (event.key === "?") {
        event.preventDefault();
        opener.current = document.activeElement as HTMLElement | null;
        setOpen("help");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setOpen(null);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    <>
      <button type="button" className="link font-semibold" aria-haspopup="dialog" aria-keyshortcuts="?" onClick={(event) => { opener.current = event.currentTarget; setOpen("help"); }}>
        Atajos de teclado
      </button>
      {open === "help" ? <ShortcutHelp onClose={close} /> : null}
      {open === "go" ? <GoAnywhere onClose={close} /> : null}
    </>
  );
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Atajos de teclado" closeLabel="Cerrar atajos" onDismiss={onClose} layout="responsive">
      <dl className="grid gap-2 pt-4 sm:grid-cols-[auto_1fr] sm:gap-x-6">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="contents">
            <dt><kbd className="rounded-control border border-line-strong bg-surface px-2 py-0.5 t-ui font-semibold">{shortcut.keys}</kbd></dt>
            <dd className="t-body text-ink-2">{shortcut.label}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 t-meta">Los atajos no funcionan mientras escribes en un campo. Todo lo que hacen también está en botones de la pantalla.</p>
    </Sheet>
  );
}

function GoAnywhere({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const places = PLACES.filter((place) => words.every((word) => fold(`${place.label} ${place.words}`).includes(word)));
    const search = query.trim()
      ? [{ label: `Buscar “${query.trim()}” en el inventario`, href: `/mi-cuenta/tienda/inventario?q=${encodeURIComponent(query.trim())}` }]
      : [];
    return [...places, ...search];
  }, [query]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <Sheet title="Ir a" closeLabel="Cerrar" onDismiss={onClose} layout="responsive">
      <div className="grid gap-3 pt-4">
        <Field id={`${id}-q`} label="Sección o SKU" hint="Escribe y presiona Enter.">
          <Input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={results[active] ? `${id}-${active}` : undefined}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter" && results[active]) { event.preventDefault(); go(results[active].href); }
            }}
            autoComplete="off"
          />
        </Field>
        <ul id={`${id}-list`} role="listbox" aria-label="Resultados" className="divide-y divide-subtle rounded-control border border-subtle">
          {results.map((result, index) => (
            <li key={result.href} id={`${id}-${index}`} role="option" aria-selected={index === active}>
              <button type="button" className={`block min-h-11 w-full px-3 py-2 text-left t-ui ${index === active ? "bg-accent-tint font-semibold" : ""}`} onClick={() => go(result.href)}>
                {result.label}
              </button>
            </li>
          ))}
          {!results.length ? <li className="px-3 py-2 t-meta">No hay una sección con ese nombre.</li> : null}
        </ul>
      </div>
    </Sheet>
  );
}
