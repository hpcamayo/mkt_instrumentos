const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");

Module._extensions[".ts"] = function compileTypeScript(mod, filename) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(compiled, filename);
};

function load(source) {
  const filename = path.resolve(source);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(compiled, filename);
  return mod.exports;
}
const { parsePage, pageHref } = load("lib/pagination.ts");
const { createSubmissionToken, readSubmissionToken } = load(
  "lib/submission-token.ts",
);
const { createPublicSubmission } = load("lib/public-submission.ts");
const {
  isInstrumentTypeValid,
  isListingPhotoCountValid,
  sanitizeListingAttributes,
} = load("lib/listing-submission.ts");
const { resolveParticularSeller } = load("lib/seller-contact.ts");
const { getLoginPath, getSafeAuthRedirect } = load("lib/auth/redirects.ts");
const { isProtectedAccountPath } = load("lib/auth/protected-paths.ts");
const { getPasswordValidationMessage } = load("lib/auth/password.ts");
const {
  getAuthCallbackDestination,
  getAuthCallbackErrorUrl,
  parseEmailOtpType,
} = load("lib/auth/callback.ts");

test("pagination rejects invalid pages and preserves repeated filters", () => {
  for (const value of [
    undefined,
    "0",
    "-1",
    "1.5",
    "Infinity",
    "100001",
    "abc",
  ])
    assert.equal(parsePage(value), 1);
  assert.equal(parsePage(["3", "4"]), 3);
  const url = new URL(
    pageHref(
      "/listados",
      {
        pickups: ["humbucker", "single_coil"],
        brand: "Fender & Co",
        page: "3",
      },
      2,
    ),
    "https://example.test",
  );
  assert.deepEqual(url.searchParams.getAll("pickups"), [
    "humbucker",
    "single_coil",
  ]);
  assert.equal(url.searchParams.get("brand"), "Fender & Co");
  assert.equal(url.searchParams.get("page"), "2");
});

test("unauthenticated /vender is protected with its return path", () => {
  assert.equal(isProtectedAccountPath("/vender"), true);
  assert.equal(getLoginPath("/vender"), "/login?next=%2Fvender");
  assert.equal(isProtectedAccountPath("/listados"), false);
});

test("authentication redirects reject external and protocol-relative targets", () => {
  assert.equal(getSafeAuthRedirect("https://evil.example"), "/mi-cuenta");
  assert.equal(getSafeAuthRedirect("//evil.example/path"), "/mi-cuenta");
  assert.equal(getSafeAuthRedirect("/vender"), "/vender");
});

test("auth callbacks support server-verifiable email flows and safe destinations", () => {
  assert.equal(parseEmailOtpType("magiclink"), "magiclink");
  assert.equal(parseEmailOtpType("recovery"), "recovery");
  assert.equal(parseEmailOtpType("signup"), "signup");
  assert.equal(parseEmailOtpType("unknown"), null);
  assert.equal(
    getAuthCallbackDestination("magiclink", "/vender"),
    "/vender",
  );
  assert.equal(
    getAuthCallbackDestination("magiclink", "https://evil.example"),
    "/mi-cuenta",
  );
  assert.equal(
    getAuthCallbackDestination("recovery", "/mi-cuenta"),
    "/restablecer-contrasena",
  );
  const errorUrl = getAuthCallbackErrorUrl(
    "https://laria.audio",
    "El enlace venció.",
  );
  assert.equal(errorUrl.origin, "https://laria.audio");
  assert.equal(errorUrl.pathname, "/login");
  assert.equal(errorUrl.searchParams.get("error"), "El enlace venció.");
});

test("account logout is never prefetched as a GET side effect", () => {
  const accountPage = fs.readFileSync("app/mi-cuenta/page.tsx", "utf8");
  assert.match(
    accountPage,
    /href="\/logout"\s+prefetch=\{false\}/,
  );
});

test("password reset/change validation requires matching 8-character values", () => {
  assert.equal(getPasswordValidationMessage("short", "short"), "Usa al menos 8 caracteres.");
  assert.equal(getPasswordValidationMessage("suficiente", "diferente"), "Las contraseñas no coinciden.");
  assert.equal(getPasswordValidationMessage("suficiente", "suficiente"), null);
});

test("submission capabilities reject tampering and wrong keys", () => {
  const created = createSubmissionToken("listing", "test-secret");
  assert.deepEqual(readSubmissionToken(created.token, "test-secret"), {
    id: created.id,
    kind: "listing",
  });
  assert.equal(readSubmissionToken(created.token, "wrong-secret"), null);
  assert.equal(readSubmissionToken(created.token + "x", "test-secret"), null);
  assert.equal(readSubmissionToken("invalid", "test-secret"), null);
});

test("listing submission capabilities are bound to the Particular owner", () => {
  const owner = "8b849f01-c815-4a39-a55e-6cd5d96a61f8";
  const created = createSubmissionToken("listing", "test-secret", owner);
  assert.deepEqual(readSubmissionToken(created.token, "test-secret"), {
    id: created.id,
    kind: "listing",
    ownerUserId: owner,
  });
});

test("listing photo limits accept 2 and 10 but reject below and above", () => {
  assert.equal(isListingPhotoCountValid(1), false);
  assert.equal(isListingPhotoCountValid(2), true);
  assert.equal(isListingPhotoCountValid(10), true);
  assert.equal(isListingPhotoCountValid(11), false);
});

test("instrument type and attributes reuse the supported filter definitions", () => {
  assert.equal(isInstrumentTypeValid("guitars", "electric_guitar"), true);
  assert.equal(isInstrumentTypeValid("guitars", "drums"), false);
  assert.deepEqual(
    sanitizeListingAttributes("electric_guitar", {
      body_type: "solid_body",
      pickups: ["humbucker", "single_coil"],
    }),
    {
      body_type: "solid_body",
      pickups: ["humbucker", "single_coil"],
    },
  );
  assert.equal(
    sanitizeListingAttributes("electric_guitar", { body_type: "invalid" }),
    null,
  );
  assert.deepEqual(sanitizeListingAttributes("electric_guitar", {}), {});
  assert.equal(isInstrumentTypeValid("guitars", "other"), true);
  assert.equal(isInstrumentTypeValid("audio interfaces", "other"), true);
  assert.deepEqual(sanitizeListingAttributes("other", {}), {});
  assert.equal(
    sanitizeListingAttributes("other", { parallel_taxonomy: "invalid" }),
    null,
  );
});

test("owned listings resolve current profile contact and legacy listings keep snapshots", () => {
  const listing = {
    seller_type: "individual",
    owner_user_id: "8b849f01-c815-4a39-a55e-6cd5d96a61f8",
    profiles: {
      full_name: "Nombre actual",
      phone: "51911111111",
      city: "Cusco",
      region: "Cusco",
      created_at: "2026-01-01T00:00:00Z",
    },
    contact_name: "Nombre anterior",
    whatsapp_phone: "51999999999",
    city: "Lima",
    region: "Lima",
    created_at: "2025-01-01T00:00:00Z",
  };
  assert.deepEqual(resolveParticularSeller(listing), {
    usesProfile: true,
    name: "Nombre actual",
    phone: "51911111111",
    city: "Cusco",
    region: "Cusco",
    createdAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(
    resolveParticularSeller({ ...listing, owner_user_id: null, profiles: null })
      .phone,
    "51999999999",
  );
});

const file = {
  name: "photo.jpg",
  type: "image/jpeg",
  size: 100,
  lastModified: 1,
};
function mockResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test("a lost commit response retries the same submission without reuploading", async () => {
  let uploads = 0;
  const calls = [];
  let completeCalls = 0;
  const previous = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.action === "start")
      return mockResponse({ id: "id-1", token: "token-1" });
    if (body.action === "complete" && ++completeCalls === 1)
      throw new Error("lost response");
    return mockResponse({ ok: true, completed: true });
  };
  try {
    const submit = createPublicSubmission({
      storage: {
        from: () => ({
          upload: async () => {
            uploads++;
            return { error: null };
          },
        }),
      },
    });
    await assert.rejects(submit("listing", { title: "Guitarra" }, [file]));
    await submit("listing", { title: "Guitarra" }, [file]);
    assert.equal(uploads, 1);
    assert.equal(calls.filter((call) => call.action === "start").length, 1);
    assert.deepEqual(
      calls
        .filter((call) => call.action === "complete")
        .map((call) => call.token),
      ["token-1", "token-1"],
    );
    assert.equal(calls.filter((call) => call.action === "cleanup").length, 0);
  } finally {
    global.fetch = previous;
  }
});

test("partial upload failure cleans storage and never creates a record", async () => {
  let uploads = 0;
  const calls = [];
  const previous = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.action);
    return mockResponse(
      body.action === "start" ? { id: "id-1", token: "token-1" } : { ok: true },
    );
  };
  try {
    const submit = createPublicSubmission({
      storage: {
        from: () => ({
          upload: async () => ({
            error: ++uploads === 2 ? { statusCode: "500" } : null,
          }),
        }),
      },
    });
    await assert.rejects(
      submit("listing", { title: "Guitarra" }, [file, file]),
    );
    assert.deepEqual(calls, ["start", "cleanup"]);
    await submit("listing", { title: "Guitarra" }, [file, file]);
    assert.deepEqual(calls, ["start", "cleanup", "start", "complete"]);
  } finally {
    global.fetch = previous;
  }
});

test("changed data cannot silently replace an uncertain submission", async () => {
  const previous = global.fetch;
  global.fetch = async (_url, options) =>
    JSON.parse(options.body).action === "start"
      ? mockResponse({ id: "id-1", token: "token-1" })
      : mockResponse({ message: "Retry" }, 503);
  try {
    const submit = createPublicSubmission({
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    });
    await assert.rejects(submit("store", { name: "Tienda" }, [file, file]));
    await assert.rejects(
      submit("store", { name: "Otra tienda" }, [file, file]),
      /mismos datos/,
    );
  } finally {
    global.fetch = previous;
  }
});

test("out-of-range database responses recover without hiding other failures", () => {
  const { getPageRedirect } = load("lib/pagination.ts");
  assert.equal(getPageRedirect(999, null, { code: "PGRST103" }), 1);
  assert.equal(getPageRedirect(3, 25, null), 2);
  assert.equal(getPageRedirect(1, 25, null), null);
  assert.equal(getPageRedirect(3, null, { code: "PGRST000" }), null);
});
