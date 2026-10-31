// PR #54 final review: exercise the production rotation path with a single-use provider and controlled DB faults.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
let rpc;
const load = Module._load;
Module._load = function(request, ...rest) {
  if (request === 'server-only') return {};
  if (request === '@/lib/supabase/admin-client') return { getSupabaseAdminClient: () => ({ rpc: (...args) => rpc(...args) }) };
  return load.call(this, request, ...rest);
};
const { ownerConnection } = require('../lib/mercadolibre/server.ts');
const { encryptToken, decryptToken } = require('../lib/mercadolibre/crypto.ts');
const config = { key: Buffer.alloc(32, 7), clientId: '12345', clientSecret: 'fake', redirectUri: 'https://example.invalid/callback' };
function fixture(options = {}) {
  const store = randomUUID(), owner = randomUUID();
  let current = { store_id: store, ml_user_id: 1234, access_token_enc: encryptToken(config.key, store, 'old-access'),
    refresh_token_enc: encryptToken(config.key, store, 'old-refresh'), expires_at: new Date(Date.now()-1000).toISOString() };
  let lease, consumed = false, providerCalls = 0, saves = 0, failures = options.failures ?? 0;
  const history = [];
  rpc = async (name, args) => {
    history.push(name);
    if (name === 'get_mercadolibre_tokens') return { data: current && { ...current }, error: null };
    if (name === 'claim_mercadolibre_refresh') {
      if (current?.access_token_enc !== args.p_previous_access_token_enc) return { data: 'changed', error: null };
      if (options.busy || (lease && lease !== args.p_claim_id)) return { data: 'busy', error: null };
      lease = args.p_claim_id; return { data: 'claimed', error: null };
    }
    if (name === 'release_mercadolibre_refresh') { if (lease === args.p_claim_id) lease = null; return { data: null, error: null }; }
    if (name === 'finish_mercadolibre_refresh') {
      saves++;
      if (options.reconnect && saves === 1) current = { ...current, access_token_enc: encryptToken(config.key, store, 'reconnected-access'), expires_at: new Date(Date.now()+3600000).toISOString() };
      if (failures-- > 0) return { data: null, error: { message: 'Simulated database outage' } };
      if (current?.access_token_enc === args.p_access_token_enc) return { data: true, error: null };
      if (!current || current.access_token_enc !== args.p_previous_access_token_enc || lease !== args.p_claim_id) return { data: false, error: null };
      current = { ...current, access_token_enc: args.p_access_token_enc, refresh_token_enc: args.p_refresh_token_enc, expires_at: args.p_expires_at };
      lease = null;
      if (options.lostSaveResponse && saves === 1) return { data: null, error: { message: 'Committed, response lost' } };
      return { data: true, error: null };
    }
    throw Error(name);
  };
  const fetcher = async (_url, init) => {
    providerCalls++;
    assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'old-refresh');
    if (consumed || options.invalid) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    consumed = true;
    if (options.disconnect) current = null;
    await new Promise(resolve => setTimeout(resolve, 20));
    return Response.json({ access_token: 'replacement-access', refresh_token: 'replacement-refresh', user_id: 1234, expires_in: 21600 });
  };
  return { owner, fetcher, history, current: () => current, counts: () => ({ providerCalls, saves }), recover: () => { failures = 0; } };
}

test('ML: concurrent readers rotate once and use the persisted replacement', async () => {
  const f = fixture();
  const responses = await Promise.all([ownerConnection(config, f.owner, f.fetcher), ownerConnection(config, f.owner, f.fetcher)]);
  assert.deepEqual(responses.map(r => r.accessToken), ['replacement-access', 'replacement-access']);
  assert.equal(f.counts().providerCalls, 1);
  assert.equal(decryptToken(config.key, f.current().store_id, f.current().refresh_token_enc), 'replacement-refresh');
});

test('ML: a transient save failure retries the same replacement without refreshing again', async () => {
  const f = fixture({ failures: 1 });
  assert.equal((await ownerConnection(config, f.owner, f.fetcher)).accessToken, 'replacement-access');
  assert.deepEqual(f.counts(), { providerCalls: 1, saves: 2 });
  assert.equal((await ownerConnection(config, f.owner, f.fetcher)).accessToken, 'replacement-access');
  assert.equal(f.counts().providerCalls, 1);
});

test('ML: a committed save with a lost response is idempotently acknowledged', async () => {
  const f = fixture({ lostSaveResponse: true });
  assert.equal((await ownerConnection(config, f.owner, f.fetcher)).accessToken, 'replacement-access');
  assert.deepEqual(f.counts(), { providerCalls: 1, saves: 2 });
});

test('ML: prolonged save errors return temporary failure and retain ciphertext for a warm retry', async () => {
  const f = fixture({ failures: 10 });
  await assert.rejects(ownerConnection(config, f.owner, f.fetcher), error => error.code === 'MERCADOLIBRE_UNAVAILABLE' && error.status === 503);
  assert.equal(decryptToken(config.key, f.current().store_id, f.current().refresh_token_enc), 'old-refresh');
  f.recover();
  assert.equal((await ownerConnection(config, f.owner, f.fetcher)).accessToken, 'replacement-access');
  assert.equal(f.counts().providerCalls, 1, 'do not consume the old single-use token again');
});

test('ML: a reconnect wins a save race and its access token is returned', async () => {
  const f = fixture({ reconnect: true });
  assert.equal((await ownerConnection(config, f.owner, f.fetcher)).accessToken, 'reconnected-access');
  assert.equal(f.counts().providerCalls, 1);
});

test('ML: a disconnect during refresh is not resurrected', async () => {
  const f = fixture({ disconnect: true });
  assert.equal(await ownerConnection(config, f.owner, f.fetcher), null);
  assert.equal(f.counts().providerCalls, 1);
});

test('ML: an actual rejected refresh releases its claim and reports authentication failure', async () => {
  const f = fixture({ invalid: true });
  await assert.rejects(ownerConnection(config, f.owner, f.fetcher), error => error.code === 'MERCADOLIBRE_AUTH');
  assert.ok(f.history.includes('release_mercadolibre_refresh'));
});

test('ML: a slow peer gives bounded temporary unavailability without calling the provider', async () => {
  const f = fixture({ busy: true });
  await assert.rejects(ownerConnection(config, f.owner, f.fetcher), error => error.code === 'MERCADOLIBRE_BUSY' && error.status === 503);
  assert.equal(f.counts().providerCalls, 0);
});
