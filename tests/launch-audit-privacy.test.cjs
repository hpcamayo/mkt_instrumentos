// Launch audit A18 and A20 (supabase/migrations/20261114120000_launch_audit_privacy.sql, whose SQL suites are
// tests/launch-audit-privacy.sql and tests/launch-audit-privacy.integration.cjs): the daily sweep of uploaded files
// nothing uses, the forms' message for the daily upload limit, a restored draft dropping the files the sweep removed,
// Admin's "Anonimizar cuenta", and the privacy notice.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { removedDraftFiles, removedFilesMessage } = require("@/lib/sell-draft");
const { UploadLimitReached, uploadLimitMessage, uploadLimitReached } = require("@/lib/upload-allowance");

const read = (file) => fs.readFileSync(file, "utf8");

function loadModule(filename, mocks) {
  const Module = require("node:module");
  const ts = require("typescript");
  const source = require("node:path").resolve(filename);
  const compiled = ts.transpileModule(read(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = new Module(source, module);
  mod.filename = source;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name));
  mod._compile(compiled, source);
  return mod.exports;
}

const nextServer = { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }) } };

test("A18: the daily sweep claims, removes through Storage by bucket and reports done, and a failed batch stays queued", async () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "local-scheduler-secret";
  const SECRET = "Bearer local-scheduler-secret";
  const steps = [];
  const batches = [];
  let failing = null;
  const admin = {
    from: () => { throw new Error("the sweep goes through its two functions"); },
    rpc: async (name, args) => {
      steps.push([name, args]);
      if (failing === name) return { data: null, error: { message: "timeout" } };
      if (name === "claim_upload_removals") return { data: batches.shift() ?? [], error: null };
      return { data: args.p_paths.length, error: null };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          steps.push(["remove", bucket, paths]);
          return failing === "remove" ? { data: null, error: { message: "Storage unavailable" } } : { data: [], error: null };
        },
      }),
    },
  };
  const route = loadModule("app/api/internal/uploads/sweep/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin },
  });
  const get = async (authorization) => {
    const response = await route.GET(new Request("http://localhost/api/internal/uploads/sweep", authorization ? { headers: { Authorization: authorization } } : {}));
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const claimed = ["claim_upload_removals", { p_limit: 100 }];
  const logs = [];
  const consoleBefore = { info: console.info, error: console.error };
  console.info = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    assert.equal((await get()).status, 401);
    assert.equal((await get("Bearer ordinary-user-token")).status, 401);
    assert.equal((await get("Bearer local-scheduler-secreé")).status, 401);
    assert.deepEqual(steps, []);

    // Nothing to remove: one claim.
    assert.deepEqual(await get(SECRET), { status: 200, body: { removed: 0 }, cache: "no-store" });
    assert.deepEqual(steps.splice(0), [claimed]);

    // Each bucket's files go in one Storage call and are reported done; then the next claim finds nothing.
    batches.push([
      { bucket: "listing-photos", path: "u1/d1/0.jpg" },
      { bucket: "listing-photos", path: "u1/d1/1.jpg" },
      { bucket: "listing-sound-clips", path: "u1/d1/sonido-2.webm" },
      { bucket: "stolen-gear-photos", path: "u1/r1/a.jpg" },
    ]);
    assert.deepEqual(await get(SECRET), { status: 200, body: { removed: 4 }, cache: "no-store" });
    assert.deepEqual(steps.splice(0), [
      claimed,
      ["remove", "listing-photos", ["u1/d1/0.jpg", "u1/d1/1.jpg"]],
      ["complete_upload_removals", { p_bucket: "listing-photos", p_paths: ["u1/d1/0.jpg", "u1/d1/1.jpg"] }],
      ["remove", "listing-sound-clips", ["u1/d1/sonido-2.webm"]],
      ["complete_upload_removals", { p_bucket: "listing-sound-clips", p_paths: ["u1/d1/sonido-2.webm"] }],
      ["remove", "stolen-gear-photos", ["u1/r1/a.jpg"]],
      ["complete_upload_removals", { p_bucket: "stolen-gear-photos", p_paths: ["u1/r1/a.jpg"] }],
      claimed,
    ]);
    assert.equal(logs.at(-1), 'uploads_sweep {"removed":4}');

    // At most 20 batches a run, however many are queued.
    batches.push(...Array.from({ length: 25 }, (_, index) => [{ bucket: "store-assets", path: `u1/s1/${index}.jpg` }]));
    assert.deepEqual((await get(SECRET)).body, { removed: 20 });
    assert.equal(steps.splice(0).filter(([step]) => step === "claim_upload_removals").length, 20);
    batches.length = 0;

    // A failed step stops the run with 503 and a log line naming it, and a file Storage didn't remove is never reported done.
    const failures = [
      ["claim_upload_removals", ["claim_upload_removals"], 'uploads_sweep_failure {"step":"claim","removed":0,"message":"timeout"}'],
      ["remove", ["claim_upload_removals", "remove"], 'uploads_sweep_failure {"step":"remove","bucket":"listing-photos","removed":0,"message":"Storage unavailable"}'],
      ["complete_upload_removals", ["claim_upload_removals", "remove", "complete_upload_removals"], 'uploads_sweep_failure {"step":"complete","bucket":"listing-photos","removed":0,"message":"timeout"}'],
    ];
    for (const [step, ran, log] of failures) {
      failing = step;
      batches.push([{ bucket: "listing-photos", path: "u1/d1/5.jpg" }]);
      assert.deepEqual(await get(SECRET), { status: 503, body: { message: "No se pudo completar la limpieza." }, cache: "no-store" });
      assert.deepEqual(steps.splice(0).map(([name]) => name), ran);
      assert.equal(logs.at(-1), log);
      batches.length = 0;
    }
    failing = null;

    // Without the service key the job reports the setup, not a cleanup.
    const unset = loadModule("app/api/internal/uploads/sweep/route.ts", {
      "next/server": nextServer,
      "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => null },
    });
    const response = await unset.GET(new Request("http://localhost/api/internal/uploads/sweep", { headers: { Authorization: SECRET } }));
    assert.deepEqual([response.status, await response.json()], [503, { message: "Configuración incompleta." }]);
  } finally {
    console.info = consoleBefore.info;
    console.error = consoleBefore.error;
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});

test("A18: the sweep runs daily from vercel.json, and the event retention daily from pg_cron", () => {
  const crons = JSON.parse(read("vercel.json")).crons;
  assert.deepEqual(crons.find((cron) => cron.path === "/api/internal/uploads/sweep"), { path: "/api/internal/uploads/sweep", schedule: "30 9 * * *" });
  const migration = read("supabase/migrations/20261114120000_launch_audit_privacy.sql");
  assert.match(migration, /select cron\.schedule\('marketplace-event-retention', '45 9 \* \* \*', \$\$select laria_private\.run_marketplace_event_retention\(\)\$\$\);/);
  assert.match(read("app/api/internal/uploads/sweep/route.ts"), /export const maxDuration = 60;/);
});

test("A18: a refused upload says when the account's next file fits, only when the daily limit is the reason", async () => {
  assert.equal(
    uploadLimitMessage("listing-photos", 120, "2026-10-28T19:05:00Z"),
    "Llegaste al límite de 120 fotos en 24 horas. Podrás subir otra desde el 28 de octubre a las 14:05.",
  );
  assert.match(uploadLimitMessage("listing-photos", 120, "2026-10-28T06:30:00Z"), /desde el 28 de octubre a la 01:30\.$/);
  assert.equal(
    uploadLimitMessage("listing-sound-clips", 20, null),
    "Llegaste al límite de 20 sonidos en 24 horas. Vuelve a intentarlo mañana.",
  );
  assert.match(uploadLimitMessage("store-assets", 40, "not a date"), /40 fotos en 24 horas\. Vuelve a intentarlo mañana\.$/);

  const client = (answer) => ({ rpc: async (name, args) => {
    assert.deepEqual([name, args], ["my_upload_allowance", { p_bucket: "listing-photos" }]);
    if (answer instanceof Error) throw answer;
    return answer;
  } });
  const limited = await uploadLimitReached(client({ data: { bucket: "listing-photos", limit: 120, used: 120, next_at: "2026-10-28T19:05:00Z" }, error: null }), "listing-photos");
  assert.ok(limited instanceof UploadLimitReached);
  assert.match(limited.message, /^Llegaste al límite de 120 fotos/);
  // Places left, a bucket without a limit, a failed call or no connection: the form keeps its own message.
  assert.equal(await uploadLimitReached(client({ data: { bucket: "listing-photos", limit: 120, used: 37, next_at: null }, error: null }), "listing-photos"), null);
  assert.equal(await uploadLimitReached(client({ data: { bucket: "listing-photos", limit: null }, error: null }), "listing-photos"), null);
  assert.equal(await uploadLimitReached(client({ data: null, error: { message: "Not allowed." } }), "listing-photos"), null);
  assert.equal(await uploadLimitReached(client(new Error("offline")), "listing-photos"), null);

  // Every form that uploads to a bucket with a limit asks, before any cleanup frees places.
  assert.match(read("components/selling/listing-uploads.ts"), /uploadLimitReached\(supabase, bucket\)\.then\(\(limited\) => reject\(limited \?\? new Error\("No se pudo subir\. Toca Reintentar\."\)\)\)/);
  assert.match(read("components/listing-edit-form.tsx"), /if \(error\) throw \(await uploadLimitReached\(supabase, attempt\.bucket\)\) \?\? new Error/);
  assert.match(read("components/store-registration-form.tsx"), /if \(error\) throw \(await uploadLimitReached\(supabase, "store-assets"\)\) \?\? error;/);
  assert.match(read("components/store-registration-form.tsx"), /if \(error instanceof UploadLimitReached\) return error\.message;/);
  const publicSubmission = read("lib/public-submission.ts");
  assert.ok(publicSubmission.indexOf("const limited = await uploadLimitReached(client, bucket);") < publicSubmission.indexOf('await send(attempt, { action: "cleanup" });\n            attempt = null;\n          } catch {\n            // Retain'));
});

test("A18: a draft kept on the device comes back without the files the sweep removed, and says so", () => {
  const draft = {
    photos: [{ path: "u1/d1/0.jpg", slot: 0 }, { path: "u1/d1/1.jpg", slot: 1 }, { path: "u1/d1/4.jpg", slot: 4 }],
    soundClip: { path: "u1/d1/sonido-3.webm", duration: 8, type: "audio/webm" },
  };
  const all = { "listing-photos": ["u1/d1/0.jpg", "u1/d1/1.jpg", "u1/d1/4.jpg", "u1/d1/9.jpg"], "listing-sound-clips": ["u1/d1/sonido-3.webm"] };
  assert.deepEqual(removedDraftFiles(draft, all), { photos: [], clip: false });
  assert.deepEqual(removedDraftFiles(draft, { "listing-photos": ["u1/d1/1.jpg"], "listing-sound-clips": [] }), { photos: ["u1/d1/0.jpg", "u1/d1/4.jpg"], clip: true });
  assert.deepEqual(removedDraftFiles({ photos: draft.photos, soundClip: null }, {}), { photos: draft.photos.map((photo) => photo.path), clip: false });

  const tip = " Un borrador que solo está en este dispositivo conserva sus archivos 48 horas; con Guardar borrador se quedan en tu cuenta.";
  assert.equal(removedFilesMessage(1, false), `Una foto de este borrador ya no estaba guardada. Agrégala otra vez.${tip}`);
  assert.equal(removedFilesMessage(3, false), `3 fotos de este borrador ya no estaban guardadas. Agrégalas otra vez.${tip}`);
  assert.equal(removedFilesMessage(0, true), `El sonido de este borrador ya no estaba guardado. Grábalo otra vez.${tip}`);
  assert.equal(removedFilesMessage(2, true), `2 fotos y el sonido de este borrador ya no estaban guardados. Agrégalos otra vez.${tip}`);

  // Publishing a draft whose file is gone is refused by the database, and the seller is told what to do. The form drops
  // the missing files only for the draft it restored.
  const route = read("app/api/submissions/route.ts");
  assert.match(route, /if \(error\?\.message\.includes\("UPLOAD_REMOVED"\)\)\n {4}return failure\("Una de las fotos ya no está guardada en Laria\. Quítala y vuelve a subirla\.", 409\);/);
  const form = read("components/sell-listing-form.tsx");
  assert.match(form, /void renew\(draft\.submission\)\.then\(\(renewed\) => dropRemovedFiles\(draft, renewed\)\)/);
  assert.match(form, /if \(!renewed\.present \|\| submission\.current\?\.id !== renewed\.id\) return;/);
  // The renewed token is kept without the file list, which would otherwise be saved with the draft.
  assert.match(form, /submission\.current = \{ id: renewed\.id, token: renewed\.token, folder: renewed\.folder \};/);
});

test("A18: renewing a draft's token also says which of its files are still stored, by bucket", async () => {
  const crypto = require("node:crypto");
  const tokens = require("@/lib/submission-token");
  const owner = crypto.randomUUID();
  const listed = [];
  let storage = "up";
  const admin = {
    storage: {
      from: (bucket) => ({
        list: async (folder, options) => {
          listed.push([bucket, folder, options]);
          if (storage === "error") return { data: null, error: { message: "unavailable" } };
          if (storage === "throws") throw new Error("fetch failed");
          return { data: bucket === "listing-photos" ? [{ name: "0.jpg" }, { name: "3.webp" }] : [], error: null };
        },
      }),
    },
  };
  const server = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "QA", phone: "51999999999", city: "Lima", region: "Lima", account_type: "seller" }, error: null }) }) }) }),
  };
  const route = loadModule("app/api/submissions/route.ts", {
    "next/server": nextServer,
    "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin },
    "@/lib/supabase/server-client": { getSupabaseServerClient: async () => server },
    "@/lib/marketplace-events-server": { getMarketplaceSession: async () => null, recordMarketplaceEvent: async () => undefined },
  });
  const before = process.env.SUBMISSION_TOKEN_SECRET;
  process.env.SUBMISSION_TOKEN_SECRET = "s".repeat(32);
  try {
    const { id, token } = tokens.createSubmissionToken("listing", "s".repeat(32), owner);
    const renew = async () => {
      const response = await route.POST(new Request("https://laria.audio/api/submissions", { method: "POST", body: JSON.stringify({ action: "renew", token }) }));
      return { status: response.status, body: await response.json() };
    };
    const folder = `${owner}/${id}`;
    const renewed = await renew();
    assert.equal(renewed.status, 200, renewed.body.message);
    assert.deepEqual(renewed.body.present, { "listing-photos": [`${folder}/0.jpg`, `${folder}/3.webp`], "listing-sound-clips": [] });
    assert.deepEqual(listed.splice(0), [["listing-photos", folder, { limit: 100 }], ["listing-sound-clips", folder, { limit: 100 }]]);
    // When Storage can't say, the token is still renewed and the draft keeps its files.
    for (const failing of ["error", "throws"]) {
      storage = failing;
      const unknown = await renew();
      assert.deepEqual([unknown.status, unknown.body.id, unknown.body.folder, unknown.body.present], [200, id, folder, null]);
    }
  } finally {
    if (before === undefined) delete process.env.SUBMISSION_TOKEN_SECRET;
    else process.env.SUBMISSION_TOKEN_SECRET = before;
  }
});

test("A20: Admin anonymises an account from Usuarios with a reason and a confirmation, and its history is in the audit", () => {
  const control = read("components/admin-anonymize-account.tsx");
  assert.match(control, /\.rpc\("admin_anonymize_account", \{ p_user_id: userId, p_reason: reason\.trim\(\) \}\)/);
  assert.match(control, /if \(reason\.trim\(\)\.length < 3\) \{/);
  assert.match(control, /if \(!confirmed\) \{/);
  // The database's own message, without its code (ANONYMIZE_ACTIVE_STORE: …), is what Admin reads.
  assert.match(control, /\/\^\[A-Z_\]\+: \(\.\+\)\$\/\.exec\(runError\?\.message \?\? ""\)\?\.\[1\]/);
  const view = read("components/admin-domain-view.tsx");
  assert.match(view, /\{domain === "usuarios" && id \? <AdminAnonymizeAccount userId=\{id\} onComplete=\{onComplete\} \/> : null\}/);
  assert.match(view, /: domain === "usuarios"\n {14}\? "account"/);
  assert.match(read("app/admin/auditoria/[targetType]/[targetId]/page.tsx"), /"legacy_link",\n {2}"account",\n\] as const;/);
  const { adminValueLabel } = require("@/lib/admin");
  assert.equal(adminValueLabel("account"), "Cuenta");
  assert.equal(adminValueLabel("anonymize_account"), "Cuenta anonimizada");
});

test("A20: the privacy notice names the push services, the retention periods, the deadlines and what cancellation keeps", () => {
  const page = read("app/privacidad/page.tsx");
  assert.match(page, /\(Google, Apple, Mozilla o Microsoft\)/);
  assert.match(page, /a los 90 días, y los demás registros de las estadísticas, como los clics en WhatsApp, a los 365 días/);
  assert.match(page, /se borran pasadas 48 horas/);
  assert.match(page, /8 días hábiles para información, 20 para acceso y portabilidad, y 10 para rectificación, cancelación u oposición/);
  assert.match(page, /tu nombre pasa a ser «Cuenta eliminada»/);
  assert.match(page, /los reclamos del Libro de Reclamaciones con los datos que pide la ley/);
  assert.match(read("lib/legal-pages.ts"), /export const LEGAL_LAST_UPDATED = "27 de octubre de 2026";/);
  assert.match(read("docs/privacy/arco.md"), /\*\*Pending legal review\.\*\*/);
});
