# Optional catalog workload recovery switch

`LARIA_CATALOG_ENRICHMENT_DISABLED=true` temporarily skips optional catalog database reads. Leave it unset for normal operation.

When enabled, the server skips facet counts, data-derived price shortcuts, empty-search rescue counts and fallback suggestions, optional brand/menu aggregates, the home page's category counts and total, type counts, the search box's brand and model suggestions, and the "Reservado" badge on catalog cards (the listing page itself still shows it). The existing empty-data fallbacks keep the filters usable without fabricated numbers. The facet endpoint returns HTTP 200 with JSON `null` and a 60-second CDN cache lifetime; the suggestion endpoint returns HTTP 200 with an empty list, and submitting a search works as usual.

The sell form's brand suggestions come from the reference instrument catalog, not from listing aggregates, so they stay available with the switch on.

Outside containment, the same optional reads are bounded on their own: time budgets, shared caches, cool-downs after failures and no automatic retries ([catalog-performance.md](catalog-performance.md)). The switch remains the way to remove them entirely.

Core listing queries, chosen filters, pagination and all publication, authorization and mutation rules retain their normal behavior. The switch changes no database schema or data.

Set the variable on the intended deployment environment and deploy again to activate it. Test the facet endpoint and a real catalog search. Re-enable the optional reads only after the relevant query cost and concurrent request fan-out have been measured and addressed: remove the variable or set it to `false`, deploy again, and allow the endpoint cache to expire. A healthy database after a restart alone is insufficient evidence to re-enable the optional workload.

Verification:

- `pnpm test`: includes checks proving the optional database calls are skipped (server renders, the facet endpoint and the suggestion endpoint, before any database client is created), that every direct caller of an optional aggregate checks the switch, that the sell form keeps its reference brands, and that core search still runs with its real filters and pagination.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- In a contained deployment, `GET /api/catalog/facets?category=guitars` returns HTTP 200 and JSON `null`, and `GET /api/catalog/suggest?q=fe` returns `[]`, without a Supabase request.

Live incident details and provider account identifiers belong in private operational records, not this public runbook. This document changes no V1 acceptance status.
