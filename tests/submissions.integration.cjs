// Explicit integration test only: creates pending QA records and removes them.
// Usage: node tests/submissions.integration.cjs http://localhost:3100
const assert = require('node:assert/strict');
const { loadEnvFile } = require('node:process');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
loadEnvFile('.env.local');
const base = process.argv[2];
if (!base) throw new Error('Provide the app base URL explicitly.');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=', 'base64');
async function request(body, cookie = '') {
  const response = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, 200, result.message);
  return result;
}
(async () => {
  const qaEmail = `qa-${crypto.randomUUID()}@example.invalid`;
  const qaPassword = `Qa-${crypto.randomUUID()}`;
  const createdUser = await admin.auth.admin.createUser({ email: qaEmail, password: qaPassword, email_confirm: true, user_metadata: { account_type: 'seller', full_name: 'QA Particular', phone: '+51 999 999 999', city: 'Lima', region: 'Lima' } });
  assert.equal(createdUser.error, null);
  const ownerId = createdUser.data.user.id;
  const storeEmail = `qa-store-${crypto.randomUUID()}@example.invalid`;
  const storePassword = `Qa-store-${crypto.randomUUID()}`;
  const createdStoreOwner = await admin.auth.admin.createUser({ email: storeEmail, password: storePassword, email_confirm: true, user_metadata: { account_type: 'store_owner', full_name: 'QA Store Owner', phone: '+51 999 999 998', city: 'Lima', region: 'Lima' } });
  assert.equal(createdStoreOwner.error, null);
  const storeOwnerId = createdStoreOwner.data.user.id;
  const rucRaceUsers = await Promise.all([0, 1].map(async index => {
    const result = await admin.auth.admin.createUser({ email: `qa-ruc-race-${index}-${crypto.randomUUID()}@example.invalid`, password: `Qa-ruc-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { account_type: 'store_owner', full_name: `QA RUC Owner ${index}`, phone: `5199999900${index}`, city: 'Lima', region: 'Lima' } });
    assert.equal(result.error, null);
    return result.data.user.id;
  }));
  let signupOwnerId = null;
  try {
  const createdProfile = await admin.from('profiles').select('full_name,phone,city,region').eq('id', ownerId).single();
  assert.equal(createdProfile.error, null);
  assert.deepEqual(createdProfile.data, { full_name: 'QA Particular', phone: '51999999999', city: 'Lima', region: 'Lima' });

  const signupEmail = `qa-signup-${crypto.randomUUID()}@example.invalid`;
  const signupLink = await admin.auth.admin.generateLink({
    type: 'signup',
    email: signupEmail,
    password: `Qa-signup-${crypto.randomUUID()}`,
    options: {
      redirectTo: `${base}/auth/callback?next=${encodeURIComponent('/mi-cuenta?confirmed=1')}`,
      data: { account_type: 'seller', full_name: 'QA Confirmación', phone: '+51 988 888 888', city: 'Cusco', region: 'Cusco' },
    },
  });
  assert.equal(signupLink.error, null);
  signupOwnerId = signupLink.data.user.id;
  const signupProfile = await admin.from('profiles').select('full_name,phone,city,region').eq('id', signupOwnerId).single();
  assert.equal(signupProfile.error, null);
  assert.deepEqual(signupProfile.data, { full_name: 'QA Confirmación', phone: '51988888888', city: 'Cusco', region: 'Cusco' });
  const confirmationResponse = await fetch(`${base}/auth/callback?token_hash=${encodeURIComponent(signupLink.data.properties.hashed_token)}&type=signup&next=${encodeURIComponent('/mi-cuenta?confirmed=1')}`, { redirect: 'manual' });
  assert.equal(confirmationResponse.status, 307);
  const confirmationLocation = new URL(confirmationResponse.headers.get('location'));
  assert.equal(confirmationLocation.pathname, '/mi-cuenta');
  assert.equal(confirmationLocation.searchParams.get('confirmed'), '1');
  const confirmationCookie = cookieHeaderFromResponse(confirmationResponse);
  const confirmationAccount = await fetch(`${base}/mi-cuenta?confirmed=1`, { headers: { Cookie: confirmationCookie }, redirect: 'manual' });
  assert.equal(confirmationAccount.status, 200, 'Confirmed signup must establish a protected account session');
  assert.match(await confirmationAccount.text(), /Correo confirmado/);
  await deleteAuthUser(signupOwnerId);
  signupOwnerId = null;
  let authCookies = [];
  let authenticated = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => authCookies, setAll: (values) => { authCookies = values.map(({ name, value }) => ({ name, value })); } } });
  assert.equal((await authenticated.auth.signInWithPassword({ email: qaEmail, password: qaPassword })).error, null);
  const rejectedLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: qaEmail, password: `${qaPassword}-wrong` }) });
  assert.equal(rejectedLogin.status, 401);
  assert.equal(rejectedLogin.headers.getSetCookie().length, 0);
  const loginResponse = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: qaEmail, password: qaPassword }) });
  assert.equal(loginResponse.status, 200);
  let cookie = loginResponse.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  assert.ok(cookie, 'Password login must return a server-readable auth cookie');
  const protectedResponse = await fetch(`${base}/vender`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(protectedResponse.status, 200, 'Authenticated /vender must survive a full request');

  const magicLink = await admin.auth.admin.generateLink({ type: 'magiclink', email: qaEmail, options: { redirectTo: `${base}/auth/callback?next=/vender` } });
  assert.equal(magicLink.error, null);
  assert.equal(magicLink.data.user.id, ownerId, 'Magic-link login must reuse the existing user');
  const magicResponse = await fetch(`${base}/auth/callback?token_hash=${encodeURIComponent(magicLink.data.properties.hashed_token)}&type=magiclink&next=/vender`, { redirect: 'manual' });
  assert.equal(magicResponse.status, 307);
  assert.equal(new URL(magicResponse.headers.get('location')).pathname, '/vender');
  const magicCookie = cookieHeaderFromResponse(magicResponse);
  assert.ok(magicCookie, 'Magic-link callback must return server-readable auth cookies');
  const magicProtectedResponse = await fetch(`${base}/mi-cuenta`, { headers: { Cookie: magicCookie }, redirect: 'manual' });
  assert.equal(magicProtectedResponse.status, 200, 'Magic-link session must survive navigation to /mi-cuenta');

  const recoveryLink = await admin.auth.admin.generateLink({ type: 'recovery', email: qaEmail, options: { redirectTo: `${base}/auth/callback?next=/mi-cuenta` } });
  assert.equal(recoveryLink.error, null);
  const recoveryResponse = await fetch(`${base}/auth/callback?token_hash=${encodeURIComponent(recoveryLink.data.properties.hashed_token)}&type=recovery&next=/mi-cuenta`, { redirect: 'manual' });
  assert.equal(recoveryResponse.status, 307);
  assert.equal(new URL(recoveryResponse.headers.get('location')).pathname, '/restablecer-contrasena', 'Recovery must always route to the reset UI');
  const recoveryCookies = cookiesFromResponse(recoveryResponse);
  assert.ok(recoveryCookies.length, 'Recovery callback must establish a server-readable session');

  const resetClient = createCookieClient(recoveryCookies);
  const newPassword = `Qa-reset-${crypto.randomUUID()}`;
  assert.equal((await resetClient.auth.updateUser({ password: newPassword })).error, null);
  const oldPasswordLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: qaEmail, password: qaPassword }) });
  assert.equal(oldPasswordLogin.status, 401, 'Old password must fail after recovery');
  const newPasswordLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: qaEmail, password: newPassword }) });
  assert.equal(newPasswordLogin.status, 200, 'New password must work after recovery');
  cookie = cookieHeaderFromResponse(newPasswordLogin);
  authCookies = [];
  authenticated = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => authCookies, setAll: (values) => { authCookies = values.map(({ name, value }) => ({ name, value })); } } });
  assert.equal((await authenticated.auth.signInWithPassword({ email: qaEmail, password: newPassword })).error, null);

  const invalidRecovery = await fetch(`${base}/auth/callback?token_hash=invalid-token&type=recovery&next=/mi-cuenta`, { redirect: 'manual' });
  assert.equal(invalidRecovery.status, 307);
  const invalidLocation = new URL(invalidRecovery.headers.get('location'));
  assert.equal(invalidLocation.pathname, '/login');
  assert.match(invalidLocation.searchParams.get('error'), /no es válido|venció/);
  assert.equal(invalidRecovery.headers.getSetCookie().length, 0, 'Invalid recovery links must not establish a session');
  const unauthenticatedListing = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', kind: 'listing' }) });
  assert.equal(unauthenticatedListing.status, 401);
  for (const kind of ['listing']) {
    const requestCookie = cookie;
    const started = await request({ action: 'start', kind }, requestCookie);
    const bucket = kind === 'listing' ? 'listing-photos' : 'store-assets';
    const table = kind === 'listing' ? 'listings' : 'stores';
    const paths = Array.from({ length: 2 }, (_, i) => `${started.folder}/${i}.png`);
    try {
      const invalid = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(requestCookie ? { Cookie: requestCookie } : {}) }, body: JSON.stringify({ action: 'cleanup', token: started.token + 'x' }) });
      assert.equal(invalid.status, 403);
      for (const path of paths) {
        const uploader = authenticated;
        const { error } = await uploader.storage.from(bucket).upload(path, png, { contentType: 'image/png' });
        assert.equal(error, null);
      }
      const fields = kind === 'listing'
        ? { title: 'QA temporal de envío', category: 'guitars', instrument_type: 'electric_guitar', attributes: { body_type: 'solid_body' }, brand: 'QA', model: 'QA', condition: 'Usado - buen estado', price_pen: 100, city: 'Lima', region: 'Lima', description: 'Publicación temporal de prueba. Se elimina automáticamente.', marketplace_rules_accepted: true }
        : { name: 'QA temporal de tienda', city: 'Lima', region: 'Lima', district: 'QA', address: 'QA', whatsapp_phone: '51999999999', description: 'Tienda temporal de prueba. Se elimina automáticamente.' };
      const payload = { action: 'complete', token: started.token, fields, paths, roles: paths.map(() => null) };
      assert.equal((await request(payload, requestCookie)).completed, true);
      assert.equal((await request(payload, requestCookie)).completed, true);
      const { data, error } = await admin.from(table).select('id,status,owner_user_id').eq('id', started.id);
      assert.equal(error, null); assert.equal(data.length, 1); assert.equal(data[0].status, 'pending');
      if (kind === 'listing') {
        assert.equal(data[0].owner_user_id, ownerId);
        const photos = await admin.from('listing_photos').select('id').eq('listing_id', started.id);
        assert.equal(photos.data.length, paths.length);
      }
      // Cleanup with a completed token must never delete a submitted image.
      assert.equal((await request({ action: 'cleanup', token: started.token }, requestCookie)).completed, true);
      const objects = await admin.storage.from(bucket).list(started.folder);
      assert.equal(objects.data.length, paths.length);
      console.log(`${kind}: upload, atomic finalization, retry, and cleanup protection passed`);
    } finally {
      const deleted = await admin.from(table).delete().eq('id', started.id);
      assert.equal(deleted.error, null);
      const removed = await admin.storage.from(bucket).remove(paths);
      assert.equal(removed.error, null);
    }
  }

  const storeLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: storeEmail, password: storePassword }) });
  assert.equal(storeLogin.status, 200);
  const storeCookie = cookieHeaderFromResponse(storeLogin);
  const storeUploader = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  assert.equal((await storeUploader.auth.signInWithPassword({ email: storeEmail, password: storePassword })).error, null);
  const startedStore = await request({ action: 'start', kind: 'store' }, storeCookie);
  const storePaths = [`${startedStore.folder}/0.png`, `${startedStore.folder}/1.png`];
  try {
    for (const path of storePaths) assert.equal((await storeUploader.storage.from('store-assets').upload(path, png, { contentType: 'image/png' })).error, null);
    const ruc = `20${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    const fields = { name: 'QA Tienda Sprint 2', razon_social: 'QA Tienda Sprint 2 SAC', ruc, email: storeEmail, contact_person: 'QA Store Owner', whatsapp_phone: '51999999998', city: 'Lima', region: 'Lima', district: 'Miraflores', address: 'Av. QA 200', description: 'Solicitud temporal de tienda.', instagram_url: '', facebook_url: '', tiktok_url: '', website_url: '' };
    const payload = { action: 'complete', token: startedStore.token, fields, paths: storePaths, roles: ['logo', 'store_photo'] };
    assert.equal((await request(payload, storeCookie)).completed, true);
    assert.equal((await request(payload, storeCookie)).completed, true);
    const stored = await admin.from('stores').select('owner_user_id,ruc,status,is_verified').eq('id', startedStore.id).single();
    assert.equal(stored.error, null);
    assert.deepEqual(stored.data, { owner_user_id: storeOwnerId, ruc, status: 'pending', is_verified: false });
    assert.equal((await admin.from('store_photos').select('id').eq('store_id', startedStore.id)).data.length, 1);

    const duplicateStart = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: storeCookie }, body: JSON.stringify({ action: 'start', kind: 'store' }) });
    assert.equal(duplicateStart.status, 409, 'One Store Owner cannot create a second store');

    const inventory = await request({ action: 'start', kind: 'store_listing' }, storeCookie);
    const inventoryPaths = [`${inventory.folder}/0.png`, `${inventory.folder}/1.png`];
    try {
      for (const path of inventoryPaths) assert.equal((await storeUploader.storage.from('listing-photos').upload(path, png, { contentType: 'image/png' })).error, null);
      const listingFields = { title: 'QA inventario temporal', category: 'guitars', instrument_type: 'electric_guitar', attributes: { body_type: 'solid_body' }, brand: 'QA', model: 'Store', condition: 'Nuevo', price_pen: 100, city: 'Lima', region: 'Lima', description: 'Inventario temporal con descripción válida de más de cuarenta caracteres.', marketplace_rules_accepted: true };
      await request({ action: 'complete', token: inventory.token, fields: listingFields, paths: inventoryPaths, roles: [null, null] }, storeCookie);
      const listing = await admin.from('listings').select('owner_user_id,store_id,status').eq('id', inventory.id).single();
      assert.deepEqual(listing.data, { owner_user_id: storeOwnerId, store_id: startedStore.id, status: 'pending' });

      const capacityRows = Array.from({ length: 48 }, (_, index) => ({ slug: `qa-cap-${startedStore.id}-${index}`, title: `QA cap ${index}`, seller_type: 'store', status: 'pending', category: 'guitars', city: 'Lima', region: 'Lima', whatsapp_phone: '51999999998', owner_user_id: storeOwnerId, store_id: startedStore.id }));
      assert.equal((await admin.from('listings').insert(capacityRows)).error, null);
      const raceRows = [50, 51].map(index => admin.from('listings').insert({ slug: `qa-cap-${startedStore.id}-${index}`, title: `QA cap ${index}`, seller_type: 'store', status: 'pending', category: 'guitars', city: 'Lima', region: 'Lima', whatsapp_phone: '51999999998', owner_user_id: storeOwnerId, store_id: startedStore.id }));
      const raceResults = await Promise.all(raceRows);
      assert.equal(raceResults.filter(result => !result.error).length, 1, 'Concurrent requests from 49 must produce exactly 50, never 51');
      assert.equal(raceResults.filter(result => result.error?.message.includes('STORE_INVENTORY_LIMIT_REACHED')).length, 1);
      assert.equal((await admin.from('listings').select('id', { count: 'exact', head: true }).eq('store_id', startedStore.id).in('status', ['pending', 'approved'])).count, 50);
      console.log('store: owner-bound application, pending inventory, idempotency, and 49-to-51 concurrency passed');
    } finally {
      await admin.from('listings').delete().eq('store_id', startedStore.id);
      await admin.storage.from('listing-photos').remove(inventoryPaths);
    }
  } finally {
    await admin.from('stores').delete().eq('id', startedStore.id);
    await admin.storage.from('store-assets').remove(storePaths);
  }

  const duplicateRuc = `20${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const rucRace = await Promise.all(rucRaceUsers.map((userId, index) => admin.rpc('complete_public_submission', {
    p_id: crypto.randomUUID(),
    p_kind: 'store',
    p_fields: { slug: `qa-ruc-race-${crypto.randomUUID()}`, name: `QA RUC Race ${index}`, razon_social: `QA RUC Race ${index} SAC`, ruc: duplicateRuc, email: `ruc-race-${index}@example.invalid`, contact_person: `QA RUC Owner ${index}`, whatsapp_phone: `5199999900${index}`, city: 'Lima', region: 'Lima', address: `Av. QA ${index}`, owner_user_id: userId },
    p_photos: [],
  })));
  assert.equal(rucRace.filter(result => !result.error).length, 1, 'Concurrent duplicate-RUC applications must permit at most one store');
  assert.equal(rucRace.filter(result => result.error?.message.includes('stores_ruc_unique_idx')).length, 1);
  await admin.from('stores').delete().eq('ruc', duplicateRuc);
  console.log('store: concurrent duplicate RUC race passed');
  } finally {
    if (signupOwnerId) await deleteAuthUser(signupOwnerId);
    await deleteAuthUser(ownerId);
    await deleteAuthUser(storeOwnerId);
    for (const userId of rucRaceUsers) await deleteAuthUser(userId);
  }
  console.log('All temporary users, records, and uploaded images removed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

async function deleteAuthUser(userId) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (!result.error) return;
    lastError = result.error;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.fail(`Could not remove temporary auth user: ${lastError?.message}`);
}

function cookiesFromResponse(response) {
  return response.headers.getSetCookie().map(value => {
    const pair = value.split(';', 1)[0];
    const separator = pair.indexOf('=');
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
  });
}

function cookieHeaderFromResponse(response) {
  return cookiesFromResponse(response).map(({ name, value }) => `${name}=${value}`).join('; ');
}

function createCookieClient(initialCookies) {
  const jar = new Map(initialCookies.map(cookie => [cookie.name, cookie.value]));
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
}
