const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

function source(filename) {
  return fs.readFileSync(filename, "utf8");
}

function load(filename, mocks = {}) {
  const resolved = path.resolve(filename);
  const compiled = ts.transpileModule(source(resolved), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = new Module(resolved, module);
  mod.filename = resolved;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(compiled, resolved);
  return mod.exports;
}

function section(value, start, end) {
  const from = value.indexOf(start);
  assert.notEqual(from, -1, `Missing start marker: ${start}`);
  const to = value.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `Missing end marker after ${start}: ${end}`);
  return value.slice(from, to);
}

const migrationPath = "supabase/migrations/20260923120000_sprint_8_admin_reports_legacy.sql";

function revisionComparison(item) {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { AdminRevisionComparison } = load("components/admin-workbench.tsx", {
    "@/lib/admin": load("lib/admin.ts"),
    "@/lib/instrument-filters": load("lib/instrument-filters.ts"),
    "@/lib/supabase/browser-client": {},
    "next/image": ({ unoptimized, ...props }) => React.createElement("img", {
      ...props, "data-unoptimized": String(unoptimized),
    }),
  });
  return renderToStaticMarkup(React.createElement(AdminRevisionComparison, { item }));
}

test("ADMIN-005 photo-only revision renders current/proposed private images before approval", () => {
  const html = revisionComparison({
    changed_fields: ["photos"],
    current_values: { instrument_type: "electric_guitar", attributes: {} },
    proposed_values: { instrument_type: "electric_guitar", attributes: {} },
    current_photos: [{ image_url: "/api/listing-images/current.jpg", alt_text: "Frente actual" }],
    proposed_photos: [{ image_url: "/api/listing-images/proposed.jpg", alt_text: "Frente propuesto" }],
  });
  assert.match(html, /Fotos actuales/);
  assert.match(html, /Fotos propuestas/);
  assert.match(html, /src="\/api\/listing-images\/current.jpg"/);
  assert.match(html, /src="\/api\/listing-images\/proposed.jpg"/);
  assert.equal((html.match(/data-unoptimized="true"/g) ?? []).length, 2);
  assert.equal((html.match(/loading="lazy"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /\[object Object\]|<td[^>]*>—<\/td>/);
});

test("ADMIN-005 attribute-only revision renders meaningful labels, options and removed attributes", () => {
  const html = revisionComparison({
    changed_fields: ["attributes"],
    current_values: { instrument_type: "electric_guitar", attributes: { strings: "6", bridge: "fixed", pickups: ["single_coil"], handedness: "right_handed" } },
    proposed_values: { instrument_type: "electric_guitar", attributes: { strings: "7", bridge: "tremolo", pickups: ["humbucker", "p90"] } },
    current_photos: [], proposed_photos: [],
  });
  assert.match(html, /Número de cuerdas: 6; Puente: Fijo; Pastillas: Single coil; Mano: Diestro/);
  assert.match(html, /Número de cuerdas: 7; Puente: Trémolo; Pastillas: Humbucker, P90/);
  assert.doesNotMatch(html, /\[object Object\]/);
  const removed = revisionComparison({
    changed_fields: ["attributes"],
    current_values: { instrument_type: "electric_guitar", attributes: { strings: "6" } },
    proposed_values: { instrument_type: "electric_guitar", attributes: {} },
  });
  assert.match(removed, /Sin características/);
});

test("revision galleries remain bounded and unchanged photos retain current proposal context", () => {
  const photos = Array.from({ length: 12 }, (_, index) => ({ id: String(index), image_url: `/api/listing-images/${index}.jpg` }));
  const html = revisionComparison({ changed_fields: ["attributes"], current_values: { attributes: {} }, proposed_values: { attributes: {} }, current_photos: photos, proposed_photos: [] });
  assert.equal((html.match(/<img /g) ?? []).length, 20);
  assert.doesNotMatch(html, /src="\/api\/listing-images\/(10|11).jpg"/);
  const sql = source(migrationPath);
  for (const reader of ["get_admin_moderation_queue", "get_admin_domain_page"]) {
    const block = section(sql, `create or replace function public.${reader}(`, `revoke all on function public.${reader}`);
    assert.match(block, /limit 10[\s\S]{0,60}current_photos/);
    assert.match(block, /limit 10[\s\S]{0,60}proposed_photos/);
    assert.match(block, /'attributes', l\.attributes/);
    assert.match(block, /'attributes', case when 'attributes' = any\(r\.changed_fields\) then r\.attributes else l\.attributes end/);
  }
});

test("report counts use indexable target-specific predicates in both readers", () => {
  const sql = source(migrationPath);
  for (const reader of ["get_admin_moderation_queue", "get_admin_reports_page"]) {
    const block = section(sql, `create or replace function public.${reader}(`, `revoke all on function public.${reader}`);
    assert.doesNotMatch(block, /same_target\.\w+ is not distinct from/);
    for (const target of ["listing", "store", "review"]) {
      assert.match(block, new RegExp(`same_target\\.target_type = '${target}'[\\s\\S]{0,220}same_target\\.${target}_id = r\\.${target}_id`));
    }
  }
});

test("Admin transaction filters expose the authoritative verified state without empty confirmed option", () => {
  const options = section(source("components/admin-domain-view.tsx"), "  transacciones: [", "  ],");
  assert.doesNotMatch(options, /confirmed|Confirmada/);
  assert.match(options, /value: "verified", label: "Verificada"/);
});

test("every Admin page is inside one server-authorized layout and middleware covers nested routes", () => {
  const layout = source("app/admin/layout.tsx");
  const page = source("app/admin/page.tsx");
  const domainPage = source("app/admin/[section]/page.tsx");
  const middleware = source("middleware.ts");
  const adminServer = source("lib/admin-server.ts");

  assert.match(layout, /export default async function AdminLayout/);
  assert.match(layout, /requireAdmin\(\)/);
  assert.match(layout, /<AdminNavigation[\s\S]*\{children\}/);
  assert.match(page, /requireAdmin\(\)/);
  assert.match(domainPage, /requireAdmin\(\)/);
  assert.match(middleware, /"\/admin\/:path\*"/);
  assert.match(adminServer, /getCurrentUser\(\)/);
  assert.match(adminServer, /\.rpc\("is_admin"\)/);
  assert.match(adminServer, /isAdmin !== true/);
  assert.match(adminServer, /redirect\("\/mi-cuenta\?admin=denied"\)/);
  assert.doesNotMatch(layout + page + domainPage, /localStorage|sessionStorage|app_metadata|user_metadata/);
});

test("moderation queues, labels, parsing, and first-actionable default are canonical", () => {
  const admin = load("lib/admin.ts", {
    react: { cache: (fn) => fn },
    "next/navigation": { redirect: () => { throw new Error("redirect"); } },
    "@/lib/auth/session": { getCurrentUser: async () => null },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => null },
    "@/lib/supabase/database.types": {},
  });
  const expectedQueues = [
    "publicaciones",
    "revisiones",
    "tiendas",
    "verificacion",
    "reportes",
    "resenas",
  ];

  assert.deepEqual(admin.ADMIN_QUEUES, expectedQueues);
  assert.deepEqual(Object.values(admin.ADMIN_QUEUE_LABELS), [
    "Publicaciones",
    "Cambios pendientes",
    "Tiendas",
    "Verificación",
    "Reportes",
    "Reseñas",
  ]);
  assert.equal(admin.firstActionableQueue({
    publicaciones: 0,
    revisiones: 2,
    tiendas: 1,
    verificacion: 0,
    reportes: 0,
    resenas: 0,
  }), "revisiones");
  assert.equal(admin.firstActionableQueue(admin.EMPTY_ADMIN_COUNTS), "publicaciones");
  assert.equal(admin.positivePage("2"), 2);
  assert.equal(admin.positivePage("-1"), 1);
  assert.equal(admin.positivePage("1.5"), 1);
  assert.equal(admin.parseAdminQueuePayload({ queue: "desconocida", items: [] }), null);
  assert.deepEqual(admin.parseAdminCounts({
    publicaciones: 3,
    revisiones: 0,
    tiendas: 0,
    verificacion: 0,
    reportes: -2,
    resenas: "4",
  }), {
    publicaciones: 3,
    revisiones: 0,
    tiendas: 0,
    verificacion: 0,
    reportes: 0,
    resenas: 4,
  });
});

test("workbench state is URL-addressable, truthful on load failure, bounded, and keyboard reachable", () => {
  const page = source("app/admin/page.tsx");
  const domainPage = source("app/admin/[section]/page.tsx");
  const workbench = source("components/admin-workbench.tsx");
  const domain = source("components/admin-domain-view.tsx");

  assert.match(page, /searchParams: Promise<\{ cola\?: string; pagina\?: string \}>/);
  assert.match(page, /isAdminQueue\(params\.cola\)/);
  assert.match(page, /firstActionableQueue\(counts\)/);
  assert.match(page, /\.rpc\("get_admin_moderation_queue"/);
  assert.match(page, /p_page_size: 20/);
  assert.match(workbench, /href=\{`\/admin\?cola=\$\{queue\}`\}/);
  assert.match(workbench, /href=\{`\/admin\?cola=\$\{selectedQueue\}&pagina=\$\{page [-+] 1\}`\}/);
  assert.match(domainPage, /p_page_size: 24/);
  assert.match(domain, /new URLSearchParams\(\)/);
  assert.match(domain, /params\.set\("buscar", filters\.search\)/);
  assert.match(domain, /params\.set\("estado", filters\.status\)/);
  assert.match(domain, /params\.set\("pagina", String\(page\)\)/);

  // A malformed RPC payload must not be presented as a genuine empty queue.
  assert.match(page, /error \|\| !payload/);
  assert.match(page, /loadError=\{loadError\}/);
  assert.match(domainPage, /loadError=\{error \|\| !payload/);
  assert.match(workbench, /role="alert"/);
  assert.match(domain, /role="alert"/);

  // Either retain native focusable links or implement the complete roving-tab keyboard pattern.
  const hasNativeQueueLinks = !/tabIndex=\{active \? 0 : -1\}/.test(workbench);
  const hasRovingKeyboardTabs = /onKeyDown/.test(workbench) &&
    /ArrowLeft/.test(workbench) &&
    /ArrowRight/.test(workbench);
  assert.ok(hasNativeQueueLinks || hasRovingKeyboardTabs,
    "Every moderation queue must be reachable from the keyboard");
  assertVisibleFocus(workbench);
});

// UX-1 moved focus styling to one global rule (app/globals.css). A component keeps a visible focus
// indicator as long as the rule exists and the component never removes the outline.
function assertVisibleFocus(componentSource) {
  assert.match(source("app/globals.css"), /:focus-visible \{\s*outline: 2px solid var\(--ink\);\s*outline-offset: 2px;/);
  assert.doesNotMatch(componentSource, /(^|[\s"'`])(?:[a-z-]+:)*outline-none\b/);
}

test("persistent Admin navigation covers every operational domain on desktop and mobile", () => {
  const navigation = source("components/admin-navigation.tsx");
  const expected = new Map([
    ["/admin", "Moderación"],
    ["/admin/publicaciones", "Publicaciones"],
    ["/admin/revisiones", "Cambios"],
    ["/admin/tiendas", "Tiendas"],
    ["/admin/usuarios", "Usuarios"],
    ["/admin/reportes", "Reportes"],
    ["/admin/resenas", "Reseñas"],
    ["/admin/transacciones", "Transacciones"],
    ["/admin/legacy", "Publicaciones históricas"],
  ]);
  for (const [href, label] of expected) {
    assert.match(navigation, new RegExp(`href: "${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", label: "${label}"`));
  }
  assert.match(navigation, /aria-label="Navegación administrativa"/);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
  // UX-2 Admin frame: a sidebar from 1024 px, and below it a black bar whose menu button discloses the same links.
  assert.match(navigation, /<aside className="[^"]*hidden[^"]*lg:block/);
  assert.match(navigation, /lg:hidden[\s\S]*aria-expanded=\{menu\.open\}/);
  assert.match(navigation, /aria-controls="menu-admin"[\s\S]*Menú/);
  assertVisibleFocus(navigation);
});

test("Admin moderation clients use only canonical RPCs and expose no generic user mutation powers", () => {
  const workbench = source("components/admin-workbench.tsx");
  const domain = source("components/admin-domain-view.tsx");
  const clientCode = `${workbench}\n${domain}`;
  const rpcNames = [...clientCode.matchAll(/\.rpc\("([a-z0-9_]+)"/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual([...new Set(rpcNames)], [
    "link_legacy_listing_owner",
    "moderate_report",
    "moderate_review",
    "review_listing",
    "review_listing_revision",
    "review_store_application",
    "set_store_verification",
  ]);
  assert.doesNotMatch(clientCode, /\.from\(|\.update\(|\.delete\(|\.insert\(/);
  assert.doesNotMatch(clientCode, /getSupabaseAdminClient|service[_-]?role|auth\.admin|deleteUser|updateUserById|createUser|imperson/i);
  assert.match(domain, /sin poderes de suplantación, cambio de acceso o eliminación/);
  assert.match(domain, /Vista de soporte y auditoría; Admin no confirma ni altera relaciones verificadas/);
});

test("Admin preserves invite and strictly allowlisted listing/store editing", () => {
  const domain = source("components/admin-domain-view.tsx");
  const invite = source("components/admin-invite-user.tsx");
  const editors = source("components/admin-record-editors.tsx");
  const listingChanges = section(editors, "const listingChanges:", "setBusy(true);");
  const storeChanges = section(editors, "const storeChanges:", "setBusy(true);");

  assert.match(domain, /domain === "usuarios" \? <AdminInviteUser/);
  assert.match(domain, /domain === "publicaciones"[\s\S]*<AdminListingEditor/);
  assert.match(domain, /domain === "tiendas"[\s\S]*<AdminStoreEditor/);
  assert.match(invite, /fetch\("\/api\/admin\/invite-user"/);
  assert.match(invite, /method: "POST"/);
  assert.match(invite, /value="seller"/);
  assert.match(invite, /value="store_owner"/);
  assert.match(invite, /<LocationFields required=\{false\}/);
  assert.match(invite, /No crea ni muestra contraseñas temporales|no crea ni muestra contraseñas temporales/i);

  assert.deepEqual(
    [...editors.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]),
    ["listings", "listings", "stores", "stores"],
  );
  assert.doesNotMatch(editors, /\.delete\(|\.insert\(|getSupabaseAdminClient|service[_-]?role|auth\.admin/i);
  for (const field of ["title", "category", "instrument_type", "attributes", "brand", "model", "condition", "price_pen", "city", "region", "description", "contact_name", "whatsapp_phone"]) {
    assert.match(listingChanges, new RegExp(`\\b${field}:`));
  }
  assert.doesNotMatch(listingChanges, /\b(?:status|published_at|owner_user_id|store_id|seller_type|created_by_source|view_count):/);
  for (const field of ["name", "razon_social", "ruc", "email", "contact_person", "city", "region", "district", "address", "whatsapp_phone", "instagram_url", "facebook_url", "tiktok_url", "website_url", "description"]) {
    assert.match(storeChanges, new RegExp(`\\b${field}:`));
  }
  assert.doesNotMatch(storeChanges, /\b(?:status|is_verified|listing_plan|owner_user_id|rejection_reason):/);
  assert.match(editors, /status === "sold" \|\| status === "archived"/);
  assert.match(editors, /mustRemainPublishable/);
  assert.match(editors, /Una publicación aprobada debe conservar marca, modelo, estado, precio mayor a cero/);
  assert.match(editors, /\.in\("status", EDITABLE_LISTING_STATUSES\)/);
  assert.match(editors, /\.eq\("status", status as ListingStatus\)/);
  assert.match(editors, /\.eq\("status", status as StoreRow\["status"\]\)/);
  assert.match(editors, /Una Tienda activa debe conservar razón social, RUC, correo, contacto, dirección y teléfono válidos/);
  assert.match(editors, /\.eq\("is_verified", isVerified\)/);
  assert.match(editors, /sanitizeListingAttributes/);
  assert.match(editors, /Atributos del instrumento/);

  const sql = source(migrationPath);
  assert.match(sql, /sprint_8_validate_public_listing_edit/);
  assert.match(sql, /LISTING_REQUIREMENTS_INVALID: La publicación aprobada debe conservar/);
  assert.match(sql, /sprint_8_validate_active_store_edit/);
  assert.match(sql, /STORE_APPLICATION_INCOMPLETE: Una tienda activa debe conservar/);
  assert.match(sql, /listing_content_updated/);
  assert.match(sql, /store_profile_updated/);
});

test("store management links directly to bounded inventory and report context", () => {
  const domain = source("components/admin-domain-view.tsx");
  const sql = source(migrationPath);

  assert.match(domain, /`\/admin\/publicaciones\?propietario=store&buscar=\$\{encodeURIComponent\(id\)\}`/);
  assert.match(domain, /`\/admin\/reportes\?tipo=store&buscar=\$\{encodeURIComponent\(id\)\}`/);
  assert.match(domain, />Ver inventario<\/Link>/);
  assert.match(domain, />Ver reportes de la tienda<\/Link>/);
  assert.match(domain, /label="Reportes históricos" value=\{item\.report_count/);
  assert.match(sql, /coalesce\(l\.store_id::text, ''\) ilike search_pattern/);
  assert.match(sql, /s\.id::text ilike search_pattern/);
  assert.match(sql, /where r\.store_id = s\.id and r\.status = 'open'/);
});

test("Admin mark-sold uses the canonical guarded listing transition and explicit confirmation", () => {
  const sql = source(migrationPath);
  const domain = source("components/admin-domain-view.tsx");
  const workbench = source("components/admin-workbench.tsx");
  const reviewListing = section(sql, "create or replace function public.review_listing(", "create or replace function public.submit_content_report(");

  assert.match(reviewListing, /perform set_config\('app\.allow_listing_admin_fields'/);
  assert.match(reviewListing, /p_decision = 'sold'/);
  assert.match(reviewListing, /listing_record\.status <> 'approved'/);
  assert.match(reviewListing, /set status = 'cancelled'/);
  assert.match(reviewListing, /set status = 'sold', sold_at = coalesce\(sold_at, now\(\)\)/);
  assert.match(domain, /decision: "sold"/);
  assert.match(domain, /no confirma comprador, pago, entrega ni una transacción verificada/);
  assert.match(workbench, /confirmationText/);
});

test("authenticated report controls cover public listings, active stores, and revealed reviews", () => {
  // UX-4 L15: the trigger stays in content-report.tsx and the form (with the Supabase client) loads on the first press
  // from content-report-form.tsx; together they keep every label and rule below.
  const trigger = source("components/content-report.tsx");
  const form = source("components/content-report-form.tsx");
  const control = `${trigger}\n${form}`;
  const listing = source("app/instrumentos/[slug]/page.tsx");
  const store = source("app/tiendas/[slug]/page.tsx");
  const reputation = source("components/listing/reputation-section.tsx");
  assert.match(trigger, /dynamic\(\(\) => import\("@\/components\/content-report-form"\)/);
  assert.doesNotMatch(trigger, /browser-client|getSupabaseBrowserClient/);

  assert.match(control, /type ReportTarget = "listing" \| "store" \| "review"/);
  assert.match(control, /useMarketplaceAccount\(\)/);
  assert.match(control, /href=\{`\/login\?next=/);
  assert.match(control, /\.rpc\("submit_content_report"/);
  for (const copy of [
    "Posible estafa",
    "Información falsa o engañosa",
    "Artículo o contenido prohibido",
    "Contenido inapropiado",
    "Acoso",
    "Spam",
    "Otro",
    "Detalle opcional",
    "Enviar reporte",
  ]) assert.match(control, new RegExp(copy));
  assert.match(control, /maxLength=\{1000\}/);
  assert.match(control, /Ya tienes un reporte abierto para este contenido/);
  assert.match(control, /role=\{failed \? "alert" : "status"\}/);

  assert.match(listing, /targetType="listing"[\s\S]{0,100}label="Reportar publicación"/);
  assert.match(store, /targetType="store"[\s\S]{0,100}label="Reportar tienda"/);
  assert.match(reputation, /reputation\.items\.map[\s\S]*targetType="review"[\s\S]{0,100}label="Reportar reseña"/);
  assert.doesNotMatch(control, /reporter_user_id|owner_user_id/);
});

test("report storage is private, target-aware, deduplicated per reporter, and separately moderated", () => {
  const sql = source(migrationPath);
  const submission = section(sql, "create or replace function public.submit_content_report(", "create or replace function public.report_review(");
  const moderation = section(sql, "create or replace function public.moderate_report(", "create or replace function public.get_admin_moderation_counts()");

  assert.match(sql, /alter table public\.review_reports rename to reports/);
  assert.match(sql, /target_type in \('listing', 'store', 'review'\)/);
  for (const target of ["listing", "store", "review"]) {
    assert.match(sql, new RegExp(`create unique index reports_one_open_${target}_per_reporter_idx[\\s\\S]{0,180}where status = 'open' and target_type = '${target}'`));
  }
  assert.match(sql, /revoke all on public\.reports, public\.admin_audit_actions from anon, authenticated/);
  assert.match(submission, /auth\.uid\(\) is null/);
  assert.match(submission, /public\.listing_is_public\((?:l\.)?id\)/);
  assert.match(submission, /where id = p_target_id and status = 'active'/);
  assert.match(submission, /laria_private\.review_is_visible\(id\)/);
  assert.equal((submission.match(/REPORT_TARGET_UNAVAILABLE/g) ?? []).length >= 4, true,
    "Unavailable and self-owned targets must share a non-probing error");
  assert.match(submission, /target_owner is not distinct from auth\.uid\(\)/);
  assert.match(submission, /target_reporter is not distinct from auth\.uid\(\)/);
  assert.match(submission, /when unique_violation then[\s\S]*REPORT_ALREADY_SUBMITTED/);

  assert.match(moderation, /perform laria_private\.assert_admin\(\)/);
  assert.match(moderation, /p_status not in \('resolved', 'dismissed'\)/);
  assert.match(moderation, /REPORT_RESOLUTION_REASON_REQUIRED/);
  assert.doesNotMatch(moderation, /update public\.(listings|stores|transaction_reviews)/);
});

test("hidden revealed reviews remain inspectable and restorable without rewriting review content", () => {
  const sql = source(migrationPath);
  const reviewsDomain = section(sql, "elsif p_domain = 'resenas' then", "elsif p_domain = 'transacciones' then");
  const reviewQueue = section(sql, "select count(distinct r.review_id) into item_count", "return jsonb_build_object(\n    'queue'");
  const view = source("components/admin-domain-view.tsx");

  assert.match(reviewsDomain, /p_status = 'hidden' and r\.admin_hidden_at is not null/);
  assert.doesNotMatch(reviewsDomain, /laria_private\.review_is_visible\(r\.id\)/,
    "The public-visibility helper excludes hidden rows and would make restore impossible");
  assert.match(view, /hidden: !adminString\(item, "admin_hidden_at"\)/);
  assert.match(view, /Restaurar reseña/);
  assert.match(view, /La calificación y el comentario son inmutables/);
  assert.doesNotMatch(view, /name="(?:rating|comment)"|updateReview|saveReview/);
  assert.match(reviewQueue, /tr\.admin_hidden_at is null/);
});

test("verification queue is truthful without inventing an owner request state", () => {
  const sql = source(migrationPath);
  const counts = section(sql, "create or replace function public.get_admin_moderation_counts()", "create or replace function public.get_admin_moderation_queue(");
  const queue = section(sql, "elsif p_queue = 'verificacion' then", "elsif p_queue = 'reportes' then");
  assert.match(counts, /'verificacion', 0/);
  assert.match(queue, /item_count := 0/);
  assert.match(queue, /result := '\[\]'::jsonb/);
  assert.doesNotMatch(queue, /status = 'active' and not .*is_verified/);
});

test("legacy ownership linking is explicit, one-time, locked, auditable, and never auto-matched", () => {
  const sql = source(migrationPath);
  const link = section(sql, "create or replace function public.link_legacy_listing_owner(", "create or replace function public.get_admin_audit_history(");
  const view = source("components/admin-domain-view.tsx");

  assert.match(link, /perform laria_private\.assert_admin\(\)/);
  assert.match(link, /where id = p_listing_id for update/);
  assert.match(link, /owner_user_id is not null/);
  assert.match(link, /created_by_source <> 'legacy'/);
  assert.match(link, /seller_type <> 'individual'/);
  assert.match(link, /target_profile\.account_type <> 'seller'/);
  assert.match(link, /where id = listing_record\.id and owner_user_id is null/);
  assert.match(link, /LEGACY_LISTING_ALREADY_LINKED/);
  assert.match(link, /'legacy_owner_linked'/);
  assert.match(link, /laria_private\.record_admin_audit/);
  assert.doesNotMatch(link, /ilike|lower\(|similarity|levenshtein|contact_name\s*=|whatsapp_phone\s*=/i);

  assert.match(view, /type="radio" name="listing"/);
  assert.match(view, /type="radio" name="user"/);
  assert.match(view, /name="note" required minLength=\{3\}/);
  assert.match(view, /type="checkbox" checked=\{confirmed\}/);
  assert.match(view, /Esta acción no permite reasignación posterior/);
  assert.match(view, /disabled=\{busy \|\| !confirmed \|\| !listingId \|\| !userId\}/);
});

test("all new privileged RPCs are guarded and generated database types are current", () => {
  const sql = source(migrationPath);
  const types = source("lib/supabase/database.types.ts");
  for (const rpc of [
    "get_admin_moderation_counts",
    "get_admin_moderation_queue",
    "get_admin_domain_page",
    "get_admin_listings_page",
    "get_admin_reports_page",
    "get_admin_legacy_page",
    "link_legacy_listing_owner",
    "get_admin_audit_history",
  ]) {
    const block = section(sql, `create or replace function public.${rpc}(`, `revoke all on function public.${rpc}`);
    assert.match(block, /perform laria_private\.assert_admin\(\)/, `${rpc} must enforce signed-JWT Admin authority`);
    assert.match(types, new RegExp(`\\b${rpc}: \\{`));
  }
  assert.match(types, /\bsubmit_content_report: \{/);
  assert.match(types, /\bmoderate_report: \{/);
  assert.match(types, /\badmin_audit_actions: \{/);
  assert.match(types, /\breports: \{/);
  assert.match(sql, /p_page_size not between 1 and 25/);
  assert.match(sql, /p_page_size not between 1 and 50/);
  assert.match(sql, /listings_admin_status_created_idx/);
  assert.match(sql, /reports_status_created_idx/);
  assert.match(sql, /admin_audit_actions_target_idx/);
});
