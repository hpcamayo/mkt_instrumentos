"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { HELP_TOPICS, searchHelp, type HelpSearchEntry } from "@/lib/help/articles";

// safe-10 (accounts batch): the help center's search. It runs in the browser over the articles (accents and capitals
// do not matter); without JavaScript the form sends ?q= and the server shows the same results.
export function HelpSearch({ index, initialQuery }: { index: HelpSearchEntry[]; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(() => searchHelp(index, query), [index, query]);
  const searching = query.trim().length > 1;

  return (
    <div className="grid gap-3">
      <form role="search" action="/ayuda" method="get" onSubmit={(event) => event.preventDefault()} className="relative">
        <label htmlFor="help-search" className="sr-only">Busca en la ayuda</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-2" />
        <input
          id="help-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busca: pagar, cambiar correo, tienda verificada…"
          autoComplete="off"
          aria-describedby="help-search-status"
          className="h-12 w-full rounded-control border border-line-strong bg-surface pl-10 pr-3 text-[16px] leading-6 text-ink placeholder:text-ink-3"
        />
      </form>
      <p id="help-search-status" aria-live="polite" className={searching ? "t-meta" : "sr-only"}>
        {searching ? (results.length ? `${results.length} ${results.length === 1 ? "artículo" : "artículos"} para «${query.trim()}»` : `No encontramos artículos para «${query.trim()}».`) : ""}
      </p>
      {searching && results.length ? (
        <ul className="grid divide-y divide-subtle rounded-panel border border-subtle bg-white">
          {results.map((result) => (
            <li key={result.slug}>
              <Link href={`/ayuda/${result.slug}`} className="block px-4 py-3 hover:bg-canvas">
                <span className="block t-ui font-semibold text-ink">{result.title}</span>
                <span className="block t-meta">{HELP_TOPICS.find((topic) => topic.id === result.topic)?.title} · {result.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {searching && !results.length ? (
        <p className="t-body text-ink-2">
          Prueba con otras palabras o <a href="#contacto" className="link font-semibold">escríbenos</a>.
        </p>
      ) : null}
    </div>
  );
}
