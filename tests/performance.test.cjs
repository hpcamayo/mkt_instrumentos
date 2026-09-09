const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");

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
