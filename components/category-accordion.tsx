"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { ShellLink } from "@/components/shell-link";
import { CATALOG_PATH, VERIFIED_STORES_PATH, categoryMenus } from "@/lib/shell";
import { cn } from "@/lib/utils";

// Category access inside the Admin frame (owner, 3 Oct): an "Explorar categorías" entry in the Admin navigation that
// expands, in place, to the same destinations as the public strip: "Instrumentos", each category ("Ver todos" and its
// canonical types) and "Tiendas verificadas". Admin keeps its own frame; the links open the public pages.
// The accordion lives inside other menus (the phone "Menú"), so it handles Esc itself: it closes the innermost open
// level, returns focus to that level's button and marks the key handled; with nothing open, Esc reaches the outer menu.
export function CategoryAccordion() {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const rootId = `${baseId}-categorias`;
  const sectionId = (key: string) => `${baseId}-${key.replace(/[^a-z0-9]+/gi, "-")}`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    // React listens on the document, like the outer menu, so stopping propagation is not enough: preventDefault
    // tells the outer menu (useDisclosure) that this Esc is handled.
    event.preventDefault();
    event.stopPropagation();
    if (category) {
      document.getElementById(`${sectionId(category)}-boton`)?.focus();
      setCategory(null);
    } else {
      document.getElementById(`${rootId}-boton`)?.focus();
      setOpen(false);
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <button
        id={`${rootId}-boton`}
        type="button"
        aria-expanded={open}
        aria-controls={rootId}
        onClick={() => { setOpen(!open); setCategory(null); }}
        className={cn(ROW, "justify-between")}
      >
        Explorar categorías
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0", open && "rotate-180")} />
      </button>
      <ul id={rootId} hidden={!open} className="menu-fade ml-3 grid border-l border-white/10 pl-2">
        <li><ShellLink href={CATALOG_PATH} className={ROW}>Instrumentos</ShellLink></li>
        {categoryMenus.map((menu) => {
          const expanded = category === menu.key;
          return (
            <li key={menu.key}>
              <button
                id={`${sectionId(menu.key)}-boton`}
                type="button"
                aria-expanded={expanded}
                aria-controls={sectionId(menu.key)}
                onClick={() => setCategory(expanded ? null : menu.key)}
                className={cn(ROW, "justify-between")}
              >
                {menu.label}
                <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0", expanded && "rotate-180")} />
              </button>
              <ul id={sectionId(menu.key)} hidden={!expanded} className="ml-3 grid border-l border-white/10 pl-2">
                <li><ShellLink href={menu.href} className={cn(ROW, "underline decoration-accent decoration-2 underline-offset-[3px]")}>Ver todos</ShellLink></li>
                {menu.types.map((type) => (
                  <li key={type.value}><ShellLink href={type.href} className={cn(ROW, "font-normal")}>{type.label}</ShellLink></li>
                ))}
              </ul>
            </li>
          );
        })}
        <li><ShellLink href={VERIFIED_STORES_PATH} className={ROW}>Tiendas verificadas</ShellLink></li>
      </ul>
    </div>
  );
}

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left t-ui font-semibold text-surface transition-colors duration-120 hover:bg-white/10";
