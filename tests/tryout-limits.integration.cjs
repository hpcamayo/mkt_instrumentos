// Buyer-wide booking limits must hold across different stores and concurrent retries.
// Usage: node tests/tryout-limits.integration.cjs [postgresql://postgres@127.0.0.1:54322/postgres]
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const url=process.argv[2]||'postgresql://postgres@127.0.0.1:54322/postgres';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error('Local test database required');
const clients=[],users=[],stores=[],listings=[];
async function connect(){const c=new Client({connectionString:url,statement_timeout:10000});await c.connect();clients.push(c);return c;}
async function user(db,type='seller'){
  const id=randomUUID();users.push(id);
  await db.query("insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)values($1,'authenticated','authenticated',$2,now(),'{}',$3)",[id,'tryout-limit-'+id+'@example.invalid',JSON.stringify({account_type:type,full_name:'Persona QA',phone:'51999995290',city:'Lima',region:'Lima'})]);return id;
}
async function listing(db){
  const owner=await user(db,'store_owner'),store=randomUUID(),id=randomUUID();stores.push(store);listings.push(id);
  await db.query(`insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified)
    values($1,$2,'Tienda QA','QA SAC','20'||lpad(floor(random()*1e9)::text,9,'0'),'qa@example.invalid','QA','QA','51999995290','Lima','Lima','Av QA 123',$3,'active','free',true)`,[store,'tryout-limit-'+store,owner]);
  const hours=Object.fromEntries(Array.from({length:7},(_,n)=>[String(n+1),[['08:00','20:00']]]));
  await db.query('insert into public.store_tryout_settings(store_id,enabled,weekly_hours,capacity,min_notice_hours)values($1,true,$2,5,1)',[store,JSON.stringify(hours)]);
  await db.query(`insert into public.listings(id,slug,title,seller_type,status,category,instrument_type,brand,model,condition,price_pen,city,region,contact_name,whatsapp_phone,description,owner_user_id,store_id,created_by_source,marketplace_rules_accepted_at)
    values($1,$2,'Instrumento para probar','store','approved','guitars','electric_guitar','Marca QA','Modelo QA','Nuevo',100,'Lima','Lima','QA','51999995290','Descripción suficientemente larga para publicar este instrumento de prueba.',$3,$4,'self_service',now())`,[id,'tryout-limit-'+id,owner,store]);
  return {id,store};
}
async function begin(c,buyer){await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:buyer})]);}
async function seed(db,buyer,store,listing,slot,n,status){
  for(let i=0;i<n;i++)await db.query(`insert into public.store_tryouts(store_id,listing_id,listing_title,buyer_user_id,buyer_name,buyer_phone,starts_at,ends_at,request_key,status,cancelled_by,cancelled_at)
    values($1,$2,'Instrumento QA',$3,'Persona QA','51999995290',$4,$4::timestamptz+interval '30 minutes',$5,$6,case when $6='cancelled' then 'buyer' end,case when $6='cancelled' then now() end)`,[store,listing,buyer,slot,'seed-'+randomUUID(),status]);
}
const request="select public.request_store_tryout($1,$2,'Persona QA','51999995290',null,$3) result";
async function race(db,a,b,buyer,pair,slot){
  await begin(a,buyer);await begin(b,buyer);
  await a.query(request,[pair[0].id,slot,'race-a-'+randomUUID()]);
  let settled=false;
  const pending=b.query(request,[pair[1].id,slot,'race-b-'+randomUUID()]).then(()=>({ok:true}),error=>({ok:false,error})).finally(()=>{settled=true;});
  let waiting=false;
  for(let n=0;n<200;n++){
    waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[b.processID])).rows[0]?.waiting;
    if(waiting||settled)break;await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.ok(waiting&&!settled,'the same buyer must wait even when the two stores differ');
  await a.query('commit');const answer=await pending;
  assert.equal(answer.ok,false,'the second booking must not bypass the buyer cap');assert.match(answer.error.message,/TRYOUT_LIMIT/);
  await b.query('rollback');
}
(async()=>{const db=await connect(),a=await connect(),b=await connect();try{
  const pair=[await listing(db),await listing(db)],seedListing=await listing(db);
  const slot=(await db.query("select min(s) slot from public.store_tryout_settings t cross join lateral laria_private.tryout_slot_starts(t)s where t.store_id=$1 and s>now()+interval '1 day'",[pair[0].store])).rows[0].slot;
  const buyer=await user(db);await seed(db,buyer,seedListing.store,seedListing.id,slot,2,'requested');
  await race(db,a,b,buyer,pair,slot);
  assert.equal((await db.query("select count(*)::int n from public.store_tryouts where buyer_user_id=$1 and status in('requested','confirmed')",[buyer])).rows[0].n,3);
  console.log('PASS simultaneous bookings at different stores keep the three-open-tryout limit');
  const dailyBuyer=await user(db);await seed(db,dailyBuyer,seedListing.store,seedListing.id,slot,9,'cancelled');
  await race(db,a,b,dailyBuyer,pair,slot);
  assert.equal((await db.query("select count(*)::int n from public.store_tryouts where buyer_user_id=$1 and created_at>now()-interval '1 day'",[dailyBuyer])).rows[0].n,10);
  console.log('PASS simultaneous bookings at different stores keep the ten-per-day limit');
  const retryBuyer=await user(db),key='retry-'+randomUUID();
  await begin(a,retryBuyer);const first=await a.query(request,[pair[0].id,slot,key]);await a.query('commit');
  await begin(b,retryBuyer);const retry=await b.query(request,[pair[0].id,slot,key]);await b.query('commit');
  assert.equal(retry.rows[0].result.id,first.rows[0].result.id);assert.equal(retry.rows[0].result.replayed,true);
  console.log('PASS an identical booking retry returns the original booking');
}finally{
  await a.query('rollback');await b.query('rollback');
  await db.query('delete from public.store_tryouts where buyer_user_id=any($1::uuid[])',[users]);
  await db.query('delete from public.listings where id=any($1::uuid[])',[listings]);
  await db.query('delete from public.stores where id=any($1::uuid[])',[stores]);
  await db.query('delete from auth.users where id=any($1::uuid[])',[users]);
  for(const c of clients)await c.end();
}})().catch(error=>{console.error(error);process.exitCode=1;});
