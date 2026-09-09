// Explicit integration test only: creates pending QA records and removes them.
// Usage: node tests/submissions.integration.cjs http://localhost:3100
const assert = require('node:assert/strict');
const { loadEnvFile } = require('node:process');
const { createClient } = require('@supabase/supabase-js');
loadEnvFile('.env.local');
const base = process.argv[2];
if (!base) throw new Error('Provide the app base URL explicitly.');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=', 'base64');
async function request(body) {
  const response = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, 200, result.message);
  return result;
}
(async () => {
  for (const kind of ['listing', 'store']) {
    const started = await request({ action: 'start', kind });
    const bucket = kind === 'listing' ? 'listing-photos' : 'store-assets';
    const table = kind === 'listing' ? 'listings' : 'stores';
    const paths = Array.from({ length: kind === 'listing' ? 1 : 2 }, (_, i) => `pending/${started.id}/${i}.png`);
    try {
      const invalid = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', token: started.token + 'x' }) });
      assert.equal(invalid.status, 403);
      for (const path of paths) {
        const { error } = await anon.storage.from(bucket).upload(path, png, { contentType: 'image/png' });
        assert.equal(error, null);
      }
      const fields = kind === 'listing'
        ? { title: 'QA temporal de envío', category: 'guitars', brand: 'QA', model: 'QA', condition: 'Usado - buen estado', price_pen: 100, city: 'Lima', contact_name: 'QA', whatsapp_phone: '51999999999', description: 'Publicación temporal de prueba. Se elimina automáticamente.' }
        : { name: 'QA temporal de tienda', city: 'Lima', region: 'Lima', district: 'QA', address: 'QA', whatsapp_phone: '51999999999', description: 'Tienda temporal de prueba. Se elimina automáticamente.' };
      const payload = { action: 'complete', token: started.token, fields, paths };
      assert.equal((await request(payload)).completed, true);
      assert.equal((await request(payload)).completed, true);
      const { data, error } = await admin.from(table).select('id,status').eq('id', started.id);
      assert.equal(error, null); assert.equal(data.length, 1); assert.equal(data[0].status, 'pending');
      if (kind === 'listing') {
        const photos = await admin.from('listing_photos').select('id').eq('listing_id', started.id);
        assert.equal(photos.data.length, 1);
      }
      // Cleanup with a completed token must never delete a submitted image.
      assert.equal((await request({ action: 'cleanup', token: started.token })).completed, true);
      const objects = await admin.storage.from(bucket).list(`pending/${started.id}`);
      assert.equal(objects.data.length, paths.length);
      console.log(`${kind}: upload, atomic finalization, retry, and cleanup protection passed`);
    } finally {
      const deleted = await admin.from(table).delete().eq('id', started.id);
      assert.equal(deleted.error, null);
      const removed = await admin.storage.from(bucket).remove(paths);
      assert.equal(removed.error, null);
    }
  }
  const lookup = await anon.rpc('auth_email_exists', { p_email: 'qa@example.invalid' });
  assert.ok(lookup.error, 'Anonymous email lookup must be forbidden');
  console.log('All temporary records and uploaded images removed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
