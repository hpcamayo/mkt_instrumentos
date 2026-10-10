// UX-7, the Admin workbench (docs/ux-redesign/ux-7-admin.md): queue photos inline (W1), approve and reject look
// different (W2), verifying and revoking ask first (W3), audit times in Lima time (W4), identifiers out of the title
// line (W5). Moderation calls and their arguments are unchanged.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadWorkbench() {
  const load = Module._load;
  Module._load = function mockNext(request, ...rest) {
    if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/admin" };
    return load.call(this, request, ...rest);
  };
  try {
    return require(path.join(root, "components/admin-workbench.tsx"));
  } finally {
    Module._load = load;
  }
}

test("reject-like decisions use the danger button and approve-like ones the secondary one", () => {
  const { isNegativeMutation } = loadWorkbench();
  const negative = [
    { kind: "listing", id: "x", decision: "reject" },
    { kind: "listing", id: "x", decision: "hide" },
    { kind: "revision", id: "x", version: 1, decision: "reject" },
    { kind: "store", id: "x", decision: "reject" },
    { kind: "store", id: "x", decision: "hide" },
    { kind: "verification", id: "x", verified: false },
    { kind: "report", id: "x", status: "dismissed" },
    { kind: "review", id: "x", hidden: true },
  ];
  const positive = [
    { kind: "listing", id: "x", decision: "approve" },
    { kind: "listing", id: "x", decision: "restore" },
    { kind: "revision", id: "x", version: 1, decision: "approve" },
    { kind: "store", id: "x", decision: "approve" },
    { kind: "verification", id: "x", verified: true },
    { kind: "report", id: "x", status: "resolved" },
    { kind: "review", id: "x", hidden: false },
  ];
  for (const mutation of negative) assert.equal(isNegativeMutation(mutation), true, JSON.stringify(mutation));
  for (const mutation of positive) assert.equal(isNegativeMutation(mutation), false, JSON.stringify(mutation));
  assert.match(source("components/admin-workbench.tsx"), /variant: isNegativeMutation\(mutation\) \? "danger" : "secondary"/);
});

test("verifying and revoking a store ask first, from the queue and from the store record", () => {
  const { verificationConfirmation } = loadWorkbench();
  assert.match(verificationConfirmation(true), /Tienda verificada/);
  assert.match(verificationConfirmation(false), /volverán a pasar por revisión/);
  assert.match(source("components/admin-workbench.tsx"), /label="Verificar tienda"\s*confirmationText=\{verificationConfirmation\(true\)\}/);
  assert.match(source("components/admin-domain-view.tsx"), /confirmationText=\{verificationConfirmation\(item\.is_verified !== true\)\}/);
  // The call itself is unchanged.
  assert.match(source("components/admin-workbench.tsx"), /supabase\.rpc\("set_store_verification", \{\s*p_store_id: mutation\.id,\s*p_verified: mutation\.verified,/);
});

test("queue photos are shown inline and still open full size", () => {
  const workbench = source("components/admin-workbench.tsx");
  assert.match(workbench, /<ul className="[^"]*" aria-label="Fotos para revisar">/);
  for (const label of ['label="Foto principal"', 'label="Logo"', 'label="Banner"', "label={`Foto de tienda ${index + 1}`}"]) assert.ok(workbench.includes(label), label);
  assert.match(workbench, /function QueuePhoto[\s\S]*target="_blank" rel="noreferrer"[\s\S]*<Image[\s\S]*unoptimized=\{href\.startsWith\("\/api\/listing-images\/"\)\}/);
});

test("audit times are Lima time and identifiers leave the title lines", () => {
  const audit = source("app/admin/auditoria/[targetType]/[targetId]/page.tsx");
  assert.match(audit, /AUDIT_DATE_FORMATTER = new Intl\.DateTimeFormat\("es-PE", \{[^}]*timeZone: "America\/Lima"/);
  assert.match(audit, /Identificador: <code/);
  const workbench = source("components/admin-workbench.tsx");
  assert.doesNotMatch(workbench, /En espera desde \{adminDate\(createdAt\)\} · \{id\}/);
  assert.match(workbench, /Identificador: <code className="break-all font-mono text-\[13px\]">\{id\}<\/code>/);
});
