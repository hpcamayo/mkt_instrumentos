const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { profileFieldErrors, storeFieldErrors } = require("../lib/form-validation.ts");
const { validateSellerProfileInput } = require("../lib/auth/profile.ts");
const { getStoreSubmissionErrorMessage } = require("../components/store-registration-form.tsx");
const { ReviewChecklist } = require("../components/admin-workbench.tsx");

const profile = { fullName: "Lucía Prueba", phone: "+51 999 111 222", city: "Lima", region: "Lima" };

test("onboarding field checks preserve the existing profile-validation boundary", () => {
  for (const input of [
    profile, { ...profile, fullName: " " }, { ...profile, phone: "123" },
    { ...profile, phone: "1234567890123456" }, { ...profile, city: "" },
    { ...profile, region: "No existe" }, { ...profile, region: "lima" },
  ]) {
    assert.equal(Object.keys(profileFieldErrors(input)).length === 0, validateSellerProfileInput(input).ok);
  }
  assert.deepEqual(Object.keys(profileFieldErrors({ fullName: "", phone: "", city: "", region: "" })), ["fullName", "phone", "city", "region"]);
});

test("store application reports every missing required datum without making optional media mandatory", () => {
  const valid = { name: "Tienda Prueba", razon_social: "Prueba SAC", ruc: "20987654321", email: "tienda@example.invalid", contact_person: "Rosa", whatsapp_phone: "51999888777", city: "Lima", region: "Lima", address: "Av. Prueba 123" };
  assert.deepEqual(storeFieldErrors(valid), {});
  const missing = Object.fromEntries(Object.keys(valid).map((name) => [name, ""]));
  assert.deepEqual(Object.keys(storeFieldErrors(missing)), ["name", "razon_social", "ruc", "email", "contact_person", "whatsapp_phone", "city", "region", "address"]);
  assert.deepEqual(Object.keys(storeFieldErrors({ ...valid, ruc: "123", email: "incorrecto" })), ["ruc", "email"]);
});

test("review guides start unchecked and introduce no required approval gate in any queue", () => {
  for (const queue of ["publicaciones", "revisiones", "tiendas", "verificacion", "reportes", "resenas"]) {
    const html = renderToStaticMarkup(React.createElement(ReviewChecklist, { queue }));
    assert.equal((html.match(/type="checkbox"/g) || []).length, 4);
    assert.doesNotMatch(html, /checked=""|required=""|disabled=""/);
    assert.match(html, /Guía de revisión/);
    assert.match(html, /0 de 4 puntos revisados/);
  }
});

test("duplicate RUC is recognized for both submission exceptions and PostgREST update errors", () => {
  const detail = 'duplicate key value violates unique constraint "stores_ruc_unique_idx"';
  for (const error of [detail, new Error(detail), { code: "23505", message: detail }]) {
    assert.equal(getStoreSubmissionErrorMessage(error), "Este RUC ya está registrado en Laria.");
  }
  for (const error of [null, {}, { message: "connection error" }]) {
    assert.equal(getStoreSubmissionErrorMessage(error), "No se pudieron guardar los cambios. Intenta nuevamente.");
  }
});
