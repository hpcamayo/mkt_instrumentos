# Google Search site name

The preferred site name is **Laria**. This is the first line beside the favicon in
Google results, separate from the page title and URL.

The homepage renders one `WebSite` JSON-LD item through `buildWebsiteJsonLd()` in
`lib/seo.ts`, using `SITE_NAME` and the canonical root URL. The existing Organization
data, `og:site_name` and application name also identify Laria. The page title remains
`Laria | Compra y vende instrumentos musicales en Perú`.

## Verification and release

Confirm deployment and Google's displayed name separately; a source change or local
test alone does not establish either result.

1. Run `node --require ./tests/setup-alias.cjs --test tests/sprint-9.test.cjs tests/seo-smoke.test.cjs tests/ux-home.test.cjs`.
2. In the rendered homepage HTML, confirm exactly one `application/ld+json` script
   with `"@type":"WebSite"`, `"name":"Laria"` and `"url":"https://laria.audio/"`
   when using the production site origin. Confirm `og:site_name` is also `Laria`.
3. After deployment, inspect `https://laria.audio/` in the verified Search Console
   property, run the live URL test, and request indexing once to ask for a recrawl.

Google chooses the displayed name automatically. Recrawling and processing may take
days or weeks; the change cannot guarantee the chosen name or its timing. Google's
Rich Results Test does not validate site names; use a schema validator and URL
Inspection for the markup and crawlability checks.

Reference: [Google Search Central: site names](https://developers.google.com/search/docs/appearance/site-names).
