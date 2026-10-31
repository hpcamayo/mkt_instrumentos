// Concurrent PR #54 counter confirmations: serialize both the same-store and global buyer caps.
// Usage: node tests/pilot-counter-limits.integration.cjs [postgresql://postgres@127.0.0.1:54322/postgres]
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { Client } = require('pg');
const url = process.argv[2] || 'postgresql://postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local test database required');
const users = [], stores = [], sales = [];
const clients = [];
async function connect() {
  const client = new Client({ connectionString: url, statement_timeout: 10000 });
  await client.connect(); clients.push(client); return client;
}
async function user(db, type='seller') {
  const id=randomUUID(); users.push(id);
  await db.query("insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,now(),'{}',$3)",
    [id,`counter-limit-${id}@example.invalid`,JSON.stringify({account_type:type,full_name:'Persona QA',phone:'51999996101',city:'Lima',region:'Lima'})]);
  return id;
}
async function store(db) {
  const owner=await user(db,'store_owner'), id=randomUUID(); stores.push(id);
  await db.query("insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified) values($1,$2,'Tienda QA','Tienda QA SAC',$3,'qa@example.invalid','QA','QA','51999996101','Lima','Lima','Av. QA',$4,'active','free',true)",
    [id,`counter-limit-${id}`,`20${String(stores.length).padStart(9,'0')}`,owner]);
  return {id,owner};
}
async function code(db, store) {
  const id=randomUUID(), token=randomUUID().replaceAll('-',''); sales.push(id);
  await db.query("insert into public.store_counter_sales(id,store_id,sale_key,lines,token_hash,created_by,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '1 hour')",
    [id,store.id,`counter-limit-${id}`,JSON.stringify([{name:'Guitarra QA',quantity:1}]),createHash('sha256').update(token).digest('hex'),store.owner]);
  return token;
}
async function begin(client, buyer) {
  await client.query('begin'); await client.query('set local role authenticated');
  await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:buyer,aal:'aal1'})]);
}
async function race(db, a, b, buyer, tokens, expected) {
  await begin(a,buyer); await begin(b,buyer);
  await a.query('select public.claim_counter_purchase($1)',[tokens[0]]);
  let settled=false;
  const other=b.query('select public.claim_counter_purchase($1)',[tokens[1]])
    .then(()=>({ok:true}),error=>({ok:false,error})).finally(()=>{settled=true;});
  let waiting=false;
  for(let attempt=0;attempt<200;attempt++) {
    waiting=(await db.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",[b.processID])).rows[0]?.waiting;
    if(waiting||settled)break;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.ok(waiting&&!settled,'second code must wait for the buyer lock, even though its sale row differs');
  await a.query('commit');
  const outcome=await other;
  assert.equal(outcome.ok,false,'the racing confirmation must not create a second verified transaction');
  assert.ok(outcome.error.message.includes(expected),outcome.error.message);
  await b.query('rollback');
}
(async()=>{
  const db=await connect(), a=await connect(), b=await connect();
  try {
    const buyer=await user(db), first=await store(db);
    await race(db,a,b,buyer,[await code(db,first),await code(db,first)],'COUNTER_STORE_DAILY_LIMIT');
    assert.equal((await db.query('select count(*)::int as n from public.verified_transactions where buyer_user_id=$1',[buyer])).rows[0].n,1);
    console.log('PASS same buyer, different codes at one store: one confirmed, one refused');
    const otherBuyer=await user(db);
    for(let n=0;n<4;n++) {
      const token=await code(db,await store(db));
      await begin(a,otherBuyer); await a.query('select public.claim_counter_purchase($1)',[token]); await a.query('commit');
    }
    const tokens=[await code(db,await store(db)),await code(db,await store(db))];
    await race(db,a,b,otherBuyer,tokens,'COUNTER_DAILY_LIMIT');
    assert.equal((await db.query('select count(*)::int as n from public.verified_transactions where buyer_user_id=$1',[otherBuyer])).rows[0].n,5);
    console.log('PASS fifth/sixth concurrent confirmations at different stores: global cap stays five');
  } finally {
    await a.query('rollback'); await b.query('rollback');
    // This local-only suite owns these exact fixture IDs. Bypass append-only guards only while removing them.
    await db.query('begin'); await db.query("set local session_replication_role='replica'");
    await db.query('delete from public.notifications where user_id=any($1::uuid[])',[users]);
    await db.query('delete from public.marketplace_events where actor_user_id=any($1::uuid[]) or store_id=any($2::uuid[])',[users,stores]);
    await db.query('delete from public.verified_transactions where buyer_user_id=any($1::uuid[])',[users]);
    await db.query('delete from public.store_counter_sales where id=any($1::uuid[])',[sales]);
    await db.query('delete from public.stores where id=any($1::uuid[])',[stores]);
    await db.query('delete from public.profiles where id=any($1::uuid[])',[users]);
    await db.query('delete from auth.users where id=any($1::uuid[])',[users]);
    await db.query('commit');
    for(const client of clients)await client.end();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
