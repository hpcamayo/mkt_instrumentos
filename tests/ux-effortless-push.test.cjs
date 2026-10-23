// Effortless Laria, speed batch: push notices (big-12, docs/ux-effortless/speed.md). Encryption follows the RFC 8291
// example byte for byte, VAPID signatures verify, only browser push services are reached, the worker waits for the
// morning, and signing out turns the device's notices off. The database side is tests/ux-effortless-push.sql.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const serverOnly = { "server-only": {} };

function load(file, mocks = {}, cache = new Map()) {
  const resolved = path.resolve(root, file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(resolved, module);
  mod.filename = resolved;
  mod.paths = module.paths;
  cache.set(resolved, mod);
  const original = mod.require.bind(mod);
  mod.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    const relative = name.startsWith("@/") ? name.slice(2) : name.startsWith(".") ? path.relative(root, path.resolve(path.dirname(resolved), name)) : null;
    if (relative !== null) {
      for (const ext of [".ts", ".tsx"]) {
        if (fs.existsSync(path.join(root, relative + ext))) return load(relative + ext, mocks, cache);
      }
    }
    return original(name);
  };
  mod._compile(compiled, resolved);
  return mod.exports;
}

const b64 = (value) => Buffer.from(value).toString("base64url");
const unb64 = (value) => Buffer.from(value, "base64url");

function browserKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, p256dh: b64(ecdh.getPublicKey()), auth: b64(crypto.randomBytes(16)) };
}

function vapidEnv() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { NEXT_PUBLIC_VAPID_PUBLIC_KEY: b64(ecdh.getPublicKey()), VAPID_PRIVATE_KEY: b64(ecdh.getPrivateKey()), VAPID_SUBJECT: "mailto:soporte@laria.audio" };
}

// What the browser does with a message body (RFC 8291 section 3.4 and RFC 8188).
function decryptAsBrowser(body, keys) {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const keyLength = body.readUInt8(20);
  const serverKey = body.subarray(21, 21 + keyLength);
  const record = body.subarray(21 + keyLength);
  const shared = keys.ecdh.computeSecret(serverKey);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), keys.ecdh.getPublicKey(), serverKey]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, unb64(keys.auth), info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, "the only record is marked as the last one");
  return { recordSize, keyLength, text: plain.subarray(0, plain.length - 1).toString() };
}

test("push messages are encrypted for the browser exactly as RFC 8291 describes (big-12)", () => {
  const { encryptPushPayload } = load("lib/push/web-push.ts", serverOnly);
  // RFC 8291 Appendix A.
  const body = encryptPushPayload(
    Buffer.from("When I grow up, I want to be a watermelon"),
    { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
    { salt: unb64("DGv6ra1nlYgDCS1FRnbzlw"), serverPrivateKey: unb64("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") },
  );
  assert.equal(
    b64(body),
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  );
  // A real message, opened the way the phone opens it; a fresh salt and key every time.
  const keys = browserKeys();
  const message = JSON.stringify({ title: "Bajó de precio un favorito", body: "Fender Stratocaster bajó de S/ 3,500 a S/ 3,200.", url: "/mi-cuenta/favoritos/x" });
  const first = encryptPushPayload(Buffer.from(message), keys);
  const second = encryptPushPayload(Buffer.from(message), keys);
  assert.notEqual(b64(first), b64(second));
  assert.deepEqual(decryptAsBrowser(first, keys), { recordSize: 4096, keyLength: 65, text: message });
  assert.equal(decryptAsBrowser(second, keys).text, message);
  assert.throws(() => encryptPushPayload(Buffer.from("x"), { p256dh: keys.p256dh.slice(4), auth: keys.auth }), /PUSH_KEYS_INVALID/);
  assert.throws(() => encryptPushPayload(Buffer.from("x"), { p256dh: keys.p256dh, auth: b64(crypto.randomBytes(8)) }), /PUSH_KEYS_INVALID/);
});

test("VAPID signs for the push service's origin with Laria's key pair, which must be whole and match (big-12)", () => {
  const { readVapidKeys, vapidAuthorization } = load("lib/push/web-push.ts", serverOnly);
  const env = vapidEnv();
  const keys = readVapidKeys(env);
  const now = Date.UTC(2026, 9, 19, 15, 0, 0);
  const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc:123", keys, now);
  const [, token, publicKey] = header.match(/^vapid t=([^,]+), k=(\S+)$/);
  assert.equal(publicKey, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const [encodedHeader, encodedClaims, signature] = token.split(".");
  assert.deepEqual(JSON.parse(unb64(encodedHeader)), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(JSON.parse(unb64(encodedClaims)), { aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 60 * 60, sub: "mailto:soporte@laria.audio" });
  const point = unb64(publicKey);
  const verifier = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64(point.subarray(1, 33)), y: b64(point.subarray(33)) }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${encodedHeader}.${encodedClaims}`), { key: verifier, dsaEncoding: "ieee-p1363" }, unb64(signature)));

  assert.equal(readVapidKeys({}), null, "no keys: local and preview builds");
  assert.throws(() => readVapidKeys({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY }), /PUSH_CONFIG_INVALID/);
  assert.throws(() => readVapidKeys({ ...env, VAPID_PRIVATE_KEY: vapidEnv().VAPID_PRIVATE_KEY }), /PUSH_CONFIG_INVALID/, "a private key from another pair");
  assert.throws(() => readVapidKeys({ ...env, VAPID_SUBJECT: "soporte" }), /PUSH_CONFIG_INVALID/);
  assert.equal(readVapidKeys({ ...env, VAPID_SUBJECT: "", NEXT_PUBLIC_SITE_URL: "https://laria.audio" }).subject, "https://laria.audio");
});

test("a push goes only to a browser's push service, keeps a day and replaces an older Laria message (big-12)", async () => {
  const { sendWebPush, createPushSender, readVapidKeys, PUSH_TTL_SECONDS } = load("lib/push/web-push.ts", serverOnly);
  const keys = readVapidKeys(vapidEnv());
  const browser = browserKeys();
  const device = { id: "d1", endpoint: "https://fcm.googleapis.com/fcm/send/abc:123", p256dh: browser.p256dh, auth: browser.auth };
  const message = { title: "Publicación aprobada", body: "Fender Strat: tu publicación fue aprobada.", url: "/mi-cuenta/publicaciones" };
  const requests = [];
  const answer = (status) => async (url, init) => {
    requests.push({ url, init });
    if (status instanceof Error) throw status;
    return new Response(null, { status });
  };
  assert.deepEqual(await sendWebPush(device, message, keys, answer(201)), { status: "sent", code: "201" });
  const [{ url, init }] = requests;
  assert.equal(url, device.endpoint);
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.equal(init.headers["Content-Encoding"], "aes128gcm");
  assert.equal(init.headers.TTL, String(PUSH_TTL_SECONDS));
  assert.equal(PUSH_TTL_SECONDS, 86400);
  assert.equal(init.headers.Topic, "laria-avisos");
  assert.equal(init.headers.Urgency, "normal");
  assert.match(init.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
  assert.equal(decryptAsBrowser(Buffer.from(init.body), browser).text, JSON.stringify(message));
  for (const [status, expected] of [[410, "gone"], [404, "gone"], [429, "retry"], [503, "retry"], [403, "failed"], [413, "failed"], [new Error("reset"), "retry"]]) {
    assert.equal((await sendWebPush(device, message, keys, answer(status))).status, expected, String(status));
  }
  // Anything else a browser could hand over is never contacted.
  requests.length = 0;
  for (const endpoint of ["https://laria.audio/api/x", "http://fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com.evil.pe/x", "https://169.254.169.254/latest"]) {
    assert.deepEqual(await sendWebPush({ ...device, endpoint }, message, keys, answer(201)), { status: "gone", code: "endpoint_unsupported" });
  }
  assert.equal(requests.length, 0);
  for (const endpoint of ["https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QH8", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
    assert.equal((await sendWebPush({ ...device, endpoint }, message, keys, answer(201))).status, "sent", endpoint);
  }
  // Without keys nothing leaves the server; the message is only logged.
  const logged = [];
  const info = console.info;
  console.info = (...args) => logged.push(args.join(" "));
  try {
    const sender = createPushSender({}, answer(201));
    assert.equal(sender.mode, "log");
    assert.deepEqual(await sender.send(device, message), { status: "sent", code: "logged" });
  } finally {
    console.info = info;
  }
  assert.match(logged[0], /^push_log_provider \{"device_id":"d1","title":"Publicación aprobada","url":"\/mi-cuenta\/publicaciones"\}$/);
  assert.equal(createPushSender(vapidEnv()).mode, "live");
});

const notice = (fields) => ({
  delivery_id: crypto.randomUUID(),
  message: "",
  created_at: "2026-10-19T15:00:00Z",
  listing_id: null,
  listing_title: null,
  store_id: null,
  claim_id: null,
  transaction_id: null,
  old_price_pen: null,
  new_price_pen: null,
  ...fields,
});

test("one notice reads like its row in Notificaciones, with the listing's name; several become one (big-12)", () => {
  const { pushMessageFor, pushNoticeLabel } = load("lib/push/notice.ts");
  const drop = notice({ event_type: "listing_price_drop", listing_id: "l1", listing_title: "Fender Stratocaster Player", old_price_pen: 3500, new_price_pen: 3200, message: "Una publicación de tus favoritos bajó de S/ 3500 a S/ 3200." });
  assert.deepEqual(pushMessageFor([drop]), { title: "Bajó de precio un favorito", body: "Fender Stratocaster Player bajó de S/\u00a03,500 a S/\u00a03,200.", url: "/mi-cuenta/favoritos/l1" }, "prices as Laria writes them, with a no-break space");
  const approved = notice({ event_type: "listing_approved", listing_id: "l2", listing_title: "Boss DS-1", message: "Tu publicación fue aprobada y ya puede mostrarse en Laria." });
  assert.deepEqual(pushMessageFor([approved]), { title: "Publicación aprobada", body: "Boss DS-1: tu publicación fue aprobada y ya puede mostrarse en Laria.", url: "/mi-cuenta/publicaciones" });
  const confirm = notice({ event_type: "transaction_confirmation_requested", listing_id: "l3", listing_title: "Yamaha P-45", claim_id: "c1", message: "El vendedor indicó que compraste este artículo. Confirma si corresponde." });
  assert.equal(pushMessageFor([confirm]).url, "/mi-cuenta/transacciones/c1");
  const store = notice({ event_type: "store_verified", store_id: "s1", message: "Tu tienda fue verificada y ahora figura como Tienda Verificada." });
  assert.deepEqual(pushMessageFor([store]), { title: "Tienda verificada", body: "Tu tienda fue verificada y ahora figura como Tienda Verificada.", url: "/mi-cuenta/tienda" });
  const storeListing = notice({ event_type: "listing_approved", listing_id: "l4", store_id: "s1", listing_title: "Ibanez RG", message: "Tu publicación fue aprobada y ya puede mostrarse en Laria." });
  assert.equal(pushMessageFor([storeListing]).url, "/mi-cuenta/tienda/inventario");
  const long = notice({ event_type: "listing_approved", listing_id: "l5", listing_title: "Guitarra ".repeat(20), message: "Tu publicación fue aprobada y ya puede mostrarse en Laria." });
  assert.ok(pushMessageFor([long]).body.length <= 180);
  assert.match(pushMessageFor([long]).body, /^Guitarra( Guitarra)+…: tu publicación/);
  // Newest first, as the worker claims them.
  assert.deepEqual(pushMessageFor([confirm, drop]), { title: "2 avisos nuevos en Laria", body: "Confirma una compra y bajó de precio un favorito.", url: "/mi-cuenta/notificaciones" });
  assert.deepEqual(pushMessageFor([confirm, drop, approved]), { title: "3 avisos nuevos en Laria", body: "Confirma una compra y 2 más.", url: "/mi-cuenta/notificaciones" });
  assert.throws(() => pushMessageFor([]), /PUSH_NOTICES_EMPTY/);
  // The same labels and pages as the notifications list: both read lib/notifications.ts.
  const shared = source("lib/notifications.ts");
  const labels = [...shared.matchAll(/^\s+([a-z_]+): "([^"]+)",$/gm)].map(([, event, label]) => [event, label]);
  assert.ok(labels.length >= 25);
  for (const [event, label] of labels) assert.equal(pushNoticeLabel(event), label, event);
  assert.equal(pushNoticeLabel("unknown"), "Actualización de tu cuenta");
  assert.match(source("components/notifications-list.tsx"), /import \{ notificationHref, notificationLabel \} from "@\/lib\/notifications";/);
  assert.match(source("lib/push/notice.ts"), /import \{ notificationHref, notificationLabel \} from "@\/lib\/notifications";/);
  // Notices other batches added open where their row does; an alert match opens the listing (by id: no slug here).
  const { pushNoticeHref } = load("lib/push/notice.ts");
  assert.equal(pushNoticeHref({ event_type: "listing_question_asked", listing_id: "l9", store_id: null, claim_id: null, transaction_id: null }), "/instrumentos/l9#preguntas");
  assert.equal(pushNoticeHref({ event_type: "listing_alert_match", listing_id: "l9", store_id: null, claim_id: null, transaction_id: null }), "/instrumentos/l9");
  assert.equal(pushNoticeHref({ event_type: "listing_availability_checkin", listing_id: "l9", store_id: null, claim_id: null, transaction_id: null }), "/mi-cuenta");
  assert.equal(pushNoticeHref({ event_type: "store_stock_summary", listing_id: null, store_id: "s1", claim_id: null, transaction_id: null }), "/mi-cuenta/tienda/inventario?stock=low");
  assert.equal(pushNoticeHref({ event_type: "listing_rejected", listing_id: "l9", store_id: null, claim_id: null, transaction_id: null }), "/mi-cuenta/publicaciones/l9/editar");
});

test("the worker sends nothing from 22:00 to 08:00 in Lima and reports each person's outcome (big-12)", async () => {
  const { isPushQuietHour, processPushBatch } = load("lib/push/push-worker.ts", serverOnly);
  // Lima is UTC-5 all year.
  assert.equal(isPushQuietHour(new Date("2026-10-19T03:00:00Z")), true, "22:00");
  assert.equal(isPushQuietHour(new Date("2026-10-19T12:59:00Z")), true, "07:59");
  assert.equal(isPushQuietHour(new Date("2026-10-19T13:00:00Z")), false, "08:00");
  assert.equal(isPushQuietHour(new Date("2026-10-19T02:59:00Z")), false, "21:59");

  const calls = [];
  const people = [
    { user_id: "u1", notices: [notice({ event_type: "transaction_confirmation_requested", claim_id: "c1", message: "Confirma." }), notice({ event_type: "listing_price_drop", listing_id: "l1", old_price_pen: 10, new_price_pen: 9, message: "Bajó." })], devices: [{ id: "u1-phone", endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: "k", auth: "a" }, { id: "u1-old", endpoint: "https://fcm.googleapis.com/fcm/send/2", p256dh: "k", auth: "a" }] },
    { user_id: "u2", notices: [notice({ event_type: "store_approved", store_id: "s1", message: "Aprobada." })], devices: [{ id: "u2-phone", endpoint: "https://fcm.googleapis.com/fcm/send/3", p256dh: "k", auth: "a" }] },
    { user_id: "u3", notices: [notice({ event_type: "review_revealed", transaction_id: "t1", message: "Reseñas." })], devices: [] },
  ];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: name === "claim_push_deliveries" ? people : 1, error: null }; } };
  const sent = [];
  const sender = { mode: "live", send: async (device, message) => {
    sent.push([device.id, message]);
    return { "u1-phone": { status: "sent", code: "201" }, "u1-old": { status: "gone", code: "410" }, "u2-phone": { status: "retry", code: "429" } }[device.id];
  } };

  const quiet = await processPushBatch({ client, sender, now: new Date("2026-10-19T04:00:00Z") });
  assert.deepEqual(quiet, { quiet: true, people: 0, sent: 0, retried: 0, failed: 0, skipped: 0 });
  assert.equal(calls.length, 0, "nothing is claimed at night");

  const result = await processPushBatch({ client, sender, now: new Date("2026-10-19T15:00:00Z"), workerId: "w1", limit: 50 });
  assert.deepEqual(result, { quiet: false, people: 3, sent: 1, retried: 1, failed: 0, skipped: 1 });
  assert.deepEqual(calls[0], ["claim_push_deliveries", { p_worker_id: "w1", p_limit: 50 }]);
  assert.deepEqual(sent.find(([id]) => id === "u1-phone")[1], { title: "2 avisos nuevos en Laria", body: "Confirma una compra y bajó de precio un favorito.", url: "/mi-cuenta/notificaciones" });
  const finished = Object.fromEntries(calls.filter(([name]) => name === "finish_push_deliveries").map(([, args]) => [args.p_delivery_ids[0], args]));
  const finish = (index) => finished[people[index].notices[0].delivery_id];
  assert.deepEqual(finish(0), { p_worker_id: "w1", p_delivery_ids: people[0].notices.map((item) => item.delivery_id), p_outcome: "sent", p_failure_code: null, p_sent_device_ids: ["u1-phone"], p_failed_device_ids: [], p_gone_device_ids: ["u1-old"] });
  assert.equal(finish(1).p_outcome, "retry");
  assert.equal(finish(1).p_failure_code, "429");
  assert.equal(finish(2).p_outcome, "skipped");
  assert.equal(finish(2).p_failure_code, "no_device");

  const failing = { rpc: async () => ({ data: null, error: { message: "denied", code: "42501" } }) };
  await assert.rejects(processPushBatch({ client: failing, sender, now: new Date("2026-10-19T15:00:00Z") }), /PUSH_CLAIM_FAILED:42501/);
});

test("the push worker route needs CRON_SECRET and runs without keys in log mode (big-12)", async () => {
  const calls = [];
  const admin = { rpc: async (name) => { calls.push(name); return { data: [], error: null }; } };
  const route = load("app/api/internal/push/process/route.ts", { ...serverOnly, "@/lib/supabase/admin-client": { getSupabaseAdminClient: () => admin } });
  const saved = { secret: process.env.CRON_SECRET, publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  process.env.CRON_SECRET = "s3cret-de-prueba";
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  const info = console.info;
  console.info = () => {};
  try {
    const get = (authorization) => route.GET(new Request("https://laria.audio/api/internal/push/process", { headers: authorization ? { authorization } : {} }));
    assert.equal((await get()).status, 401);
    assert.equal((await get("Bearer otro-secreto-xx")).status, 401);
    const response = await get("Bearer s3cret-de-prueba");
    const body = await response.json();
    // The answer depends on the hour in Lima; either way it is a log-mode run with nothing to send.
    assert.equal(response.status, 200);
    assert.equal(body.mode, "log");
    assert.equal(body.people, 0);
    assert.deepEqual(calls, body.quiet ? [] : ["claim_push_deliveries"]);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapidEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    assert.equal((await get("Bearer s3cret-de-prueba")).status, 503, "half a key pair is a configuration error");
  } finally {
    console.info = info;
    for (const [key, value] of [["CRON_SECRET", saved.secret], ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", saved.publicKey], ["VAPID_PRIVATE_KEY", saved.privateKey]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("signing out turns this device's notices off before the session ends (big-12)", async () => {
  const { PUSH_DEVICE_COOKIE } = load("lib/push/device.ts");
  const device = crypto.randomUUID();
  const steps = [];
  const supabase = { rpc: async (name, args) => { steps.push([name, args]); return { data: true, error: null }; }, auth: { signOut: async () => { steps.push(["signOut"]); } } };
  // The route reads the cookie from the request, so it needs nothing from Next's request scope.
  const route = load("app/logout/route.ts", { "@/lib/supabase/server-client": { getSupabaseServerClient: async () => supabase } });
  const post = (cookie) => route.POST(new Request("https://laria.audio/logout", { method: "POST", headers: { origin: "https://laria.audio", ...(cookie ? { cookie } : {}) } }));
  const response = await post(`theme=oscuro; ${PUSH_DEVICE_COOKIE}=${device}`);
  assert.equal(response.status, 303);
  assert.deepEqual(steps, [["delete_push_subscription", { p_subscription_id: device }], ["signOut"]]);
  assert.match(response.headers.get("set-cookie"), new RegExp(`^${PUSH_DEVICE_COOKIE}=;`));
  steps.length = 0;
  const without = await post(undefined);
  assert.deepEqual(steps, [["signOut"]]);
  assert.equal(without.headers.get("set-cookie"), null);
  steps.length = 0;
  await post(`${PUSH_DEVICE_COOKIE}=no-es-un-id`);
  assert.deepEqual(steps, [["signOut"]], "only a device id reaches the database");
});

test("the switch waits for the browser before showing anything, and lives on the notifications page (big-12)", () => {
  const { PushSettings } = load("components/push-settings.tsx", { "@/lib/supabase/browser-client": { getSupabaseBrowserClient: () => ({ rpc: async () => ({ data: null, error: null }) }) } });
  assert.equal(renderToStaticMarkup(React.createElement(PushSettings, { publicKey: vapidEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY })), "");
  const settings = source("components/push-settings.tsx");
  assert.match(settings, /userVisibleOnly: true, applicationServerKey: key/);
  assert.match(settings, /Nunca de 10\\u00a0p\.\\u00a0m\. a 8\\u00a0a\.\\u00a0m\./, "the hours never split across lines");
  assert.match(settings, /Ajustes > Notificaciones > Laria/, "an iPhone app that blocked them says where to allow them");
  assert.match(settings, /los correos siguen como siempre/);
  assert.match(settings, /<p role="status" className="sr-only">\{announcement\}<\/p>/);
  const page = source("app/mi-cuenta/notificaciones/page.tsx");
  assert.match(page, /<PushSettings \/>\s*<NotificationsList/);
  const { applicationServerKey } = load("lib/push/device.ts");
  const key = vapidEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  assert.deepEqual(Buffer.from(applicationServerKey(key)), unb64(key));
});
