"use client";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { IconButton } from "@/components/ui/button";
import { getCategoryLandingBySlug } from "@/lib/category-pages";
import { CATALOG_PATH, catalogSearchParams } from "@/lib/catalog-filters";
import { searchParamsRecord } from "@/lib/catalog-request";
import { parseListingFilters } from "@/lib/listings";
import type { Suggestion } from "@/lib/catalog-suggest";
import { SEARCH_LABEL, SEARCH_PLACEHOLDER } from "@/lib/shell";
import { cn } from "@/lib/utils";

// BIG 03, FIND 01 and FIND 03 (Effortless Laria): one free-text search (q) over brand, model, type and title, accents
// and small typos forgiven (public.catalog_search). On the catalog and on a category page the search keeps the filters
// already chosen, as hidden fields, and the list offers "Buscar en todo el catálogo" as the way out. While typing, the
// list suggests categories, types, brands and models that have listings, with their counts. Without JavaScript the form
// still submits a plain GET.

// Keep normalized filter state, never tracking, framework or unknown parameters from the incoming URL.
export function keptSearchFields(pathname: string, params: URLSearchParams): [string, string][] {
  if (pathname === CATALOG_PATH) {
    const filters = parseListingFilters(searchParamsRecord(params));
    return [...catalogSearchParams({ ...filters, q: undefined }).entries()];
  }
  const landing = /^\/instrumentos\/([^/]+)\/?$/.exec(pathname);
  const page = landing ? getCategoryLandingBySlug(landing[1]) : null;
  return page ? [["category", page.category]] : [];
}

function useSuggestions(query: string) {
  const [state, setState] = useState<{ query: string; items: Suggestion[] }>({ query: "", items: [] });
  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/suggest?${new URLSearchParams({ q: trimmed })}`, { signal: controller.signal });
        const items = response.ok ? ((await response.json()) as Suggestion[]) : [];
        setState({ query: trimmed, items: Array.isArray(items) ? items : [] });
      } catch {
        // Aborted or offline: no suggestions; the search itself still works.
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);
  return trimmed.length >= 2 && state.query === trimmed ? state.items : [];
}

type Option = { key: string; label: ReactNode; text: string; detail?: string; count?: number; href: string };

export function SearchCombobox({
  id,
  inputRef,
  variant = "header",
  submit,
}: {
  id: string;
  inputRef?: Ref<HTMLInputElement>;
  variant?: "header" | "banner";
  submit?: ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number | undefined>(undefined);
  const kept = keptSearchFields(pathname, new URLSearchParams(params.toString()));
  // Asked only once the box is in use, so a page with a search in its address fetches nothing by itself.
  const suggestions = useSuggestions(open ? value : "");
  const trimmed = value.trim();
  const options: Option[] = suggestions.map((item) => ({ key: `${item.kind}:${item.label}`, label: item.label, text: item.label, detail: item.detail, count: item.count, href: item.href }));
  if (trimmed && kept.length) options.push({ key: "todo", label: <>Buscar “{trimmed}” en todo el catálogo</>, text: trimmed, href: `${CATALOG_PATH}?${new URLSearchParams({ q: trimmed })}` });
  const expanded = open && options.length > 0;

  function go(option: Option) {
    setOpen(false);
    setActive(-1);
    router.push(option.href);
  }

  return (
    <>
      {kept.map(([key, keptValue], index) => (
        <input key={`${key}-${index}`} type="hidden" name={key} value={keptValue} />
      ))}
      <input
        ref={inputRef}
        id={id}
        name="q"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        maxLength={200}
        placeholder={SEARCH_PLACEHOLDER}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && options.length) {
            event.preventDefault();
            setOpen(true);
            setActive((current) => (current + 1) % options.length);
          } else if (event.key === "ArrowUp" && options.length) {
            event.preventDefault();
            setActive((current) => (current <= 0 ? options.length - 1 : current - 1));
          } else if (event.key === "Enter" && expanded && active >= 0) {
            event.preventDefault();
            go(options[active]);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          }
        }}
        className={
          variant === "banner"
            ? "h-11 min-w-0 flex-1 rounded-tag bg-transparent text-[16px] text-ink placeholder:text-ink-3"
            : "h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface pl-3 pr-12 text-[16px] text-ink placeholder:text-ink-3"
        }
      />
      {submit}
      <ul
        id={listId}
        role="listbox"
        aria-label="Sugerencias"
        hidden={!expanded}
        className="surface-light absolute inset-x-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-panel border border-line-deco bg-surface py-1 text-left text-ink shadow-level-2"
      >
        {options.map((option, index) => (
          <li
            key={option.key}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              window.clearTimeout(blurTimer.current);
              go(option);
            }}
            onMouseEnter={() => setActive(index)}
            className={cn("flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 t-ui", index === active && "bg-canvas")}
          >
            <span className="min-w-0 flex-1 truncate">
              {option.label}
              {option.detail ? <span className="t-meta"> · {option.detail}</span> : null}
            </span>
            {option.count !== undefined ? (
              <span className="t-meta tabular-nums">
                {option.count}
                <span className="sr-only"> {option.count === 1 ? "publicación" : "publicaciones"}</span>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

export function GlobalSearch({ id = "global-marketplace-search", inputRef, className }: { id?: string; inputRef?: Ref<HTMLInputElement>; className?: string }) {
  const params = useSearchParams();
  return (
    <form action={CATALOG_PATH} method="get" role="search" className={cn("relative min-w-0", className)} key={params.get("q") ?? ""}>
      <label className="sr-only" htmlFor={id}>{SEARCH_LABEL}</label>
      <SearchCombobox
        id={id}
        inputRef={inputRef}
        submit={<IconButton type="submit" label="Buscar" size="sm" variant="quiet" icon={<Search aria-hidden="true" />} className="surface-light absolute right-1 top-1 rounded-tag bg-canvas hover:bg-subtle" />}
      />
    </form>
  );
}
