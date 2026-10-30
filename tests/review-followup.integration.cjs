// PR #54 follow-up regressions on the full disposable local stack. Run with scripts/acceptance/full-stack.sh.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID, createHash } = require('node:crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { readSpreadsheet } = require('../lib/store-import/sheet.ts');
const base = process.argv[2] || 'http://localhost:3100';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
const api=env.NEXT_PUBLIC_SUPABASE_URL, anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for(const address of [base,api]) if(!['127.0.0.1','localhost','[::1]'].includes(new URL(address).hostname)) throw Error('Disposable local stack required');
assert.equal(new URL(api).port,'55321','use the isolated acceptance stack');
const admin=createClient(api,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const db=new Client({host:'127.0.0.1',port:55322,user:'postgres',password:'postgres',database:'postgres'});
const users=[];let store;
const password=randomUUID()+'Qa9!';
function ok(result,label){assert.equal(result.error,null,label+': '+result.error?.message);return result.data;}
async function account(kind='seller') {
  const email=`review-followup-${randomUUID()}@example.invalid`;
  const {user}=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{account_type:kind,full_name:'Persona QA',phone:'51999995199',city:'Lima',region:'Lima'}}),'create user');
  users.push(user.id);
  const jar=new Map();
  const client=createServerClient(api,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const cookie of values)if(cookie.value)jar.set(cookie.name,cookie.value);else jar.delete(cookie.name);}}});
  ok(await client.auth.signInWithPassword({email,password}),'sign in');
  return {id:user.id,client,cookie:()=>[...jar].map(([name,value])=>`${name}=${value}`).join('; ')};
}
(async()=>{await db.connect();try {
  const owner=await account('store_owner'),buyer=await account(),other=await account();store=randomUUID();
  await db.query(`insert into public.stores(id,slug,name,razon_social,ruc,email,contact_person,contact_name,whatsapp_phone,city,region,address,owner_user_id,status,listing_plan,is_verified)
    values($1,$2,'Tienda QA','Tienda QA SAC','20'||lpad(floor(random()*1e9)::text,9,'0'),'qa@example.invalid','QA','QA','51999995199','Lima','Lima','Av. QA 123',$3,'active','free',true)`,[store,'review-followup-'+store,owner.id]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:randomUUID(),aal:'aal2',app_metadata:{role:'admin'}})]);
  await db.query("select public.admin_set_store_inventory_enabled($1,true,'Prueba local de regresión')",[store]);
  await db.query('begin');await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:owner.id})]);
  const items=(await db.query(`select public.create_inventory_item(jsonb_build_object('merchant_sku','FOLLOWUP-'||n,'product_name','Equipo QA '||n,'unit_price_pen',100),6,'followup-create-'||n) item from generate_series(1,200)n`)).rows.map(row=>row.item.item.id);
  await db.query('commit');
  const locations=[];
  for(let n=0;n<6;n++)locations.push(ok(await owner.client.rpc('save_store_location',{p_location_id:null,p_fields:{name:'Sede QA '+n,region:'Lima',city:'Lima'}}),'location').location.id);
  await db.query('begin');
  await db.query(`insert into public.store_location_stock(location_id,item_id,store_id,quantity_on_hand)
    select l.id,i.id,$1,1 from public.store_locations l cross join public.store_inventory_items i
    where l.store_id=$1 and i.store_id=$1 on conflict(location_id,item_id)do update set quantity_on_hand=1`,[store]);
  await db.query('commit');
  for(const format of ['csv','xlsx']) {
    const response=await fetch(base+`/api/store/inventory/export?format=${format}`,{headers:{Cookie:owner.cookie()}});
    assert.equal(response.status,200);
    const sheet=readSpreadsheet(new Uint8Array(await response.arrayBuffer()),format);
    const indices=sheet.headers.flatMap((header,index)=>header.startsWith('Stock Sede QA ')?[index]:[]);
    assert.equal(sheet.rows.length,200);assert.equal(indices.length,6);
    for(const row of sheet.rows)for(const index of indices)assert.equal(Number(row.cells[index].v),1,`${format}: a populated location must never become zero`);
  }
  console.log('PASS CSV and XLSX exports retain all 1,200 location counts across the PostgREST 1,000-row cap');

  const args={p_location_id:locations[0],p_item_id:items[0],p_type:'restock',p_quantity:1,p_channel:null,p_reference:null,p_reason:null,p_expected_version:null,p_idempotency_key:'followup-replay-key'};
  const first=ok(await owner.client.rpc('record_location_stock_movement',args),'movement');
  assert.equal(ok(await owner.client.rpc('record_location_stock_movement',args),'replay').movement.id,first.movement.id);
  for(const changes of [{p_quantity:2},{p_item_id:items[1]},{p_type:'damage_or_loss'},{p_reference:'Otra referencia'},{p_reason:'Otro motivo'}]) {
    const answer=await owner.client.rpc('record_location_stock_movement',{...args,...changes});
    assert.match(answer.error?.message??'',/IDEMPOTENCY_KEY_REUSED/);
  }
  console.log('PASS identical location movements replay once; changed item, quantity, type, reference and reason are refused');

  const gear=ok(await buyer.client.rpc('save_gear_item',{p_id:null,p_fields:{category:'guitars',instrument_type:'electric_guitar',brand:'Marca QA',model:'Modelo QA',serial:'FOLLOWUP-OWN-SERIAL'}}),'gear');
  ok(await other.client.rpc('save_gear_item',{p_id:null,p_fields:{category:'guitars',instrument_type:'electric_guitar',brand:'Marca privada',serial:'FOREIGN-SERIAL-NEVER-EXPORT'}}),'foreign gear');
  const sale=randomUUID(),token=randomUUID().replaceAll('-','');
  await db.query(`insert into public.store_counter_sales(id,store_id,sale_key,lines,token_hash,created_by,expires_at)
    values($1,$2,$3,$4,$5,$6,now()+interval '1 hour')`,[sale,store,'followup-counter-'+sale,JSON.stringify([{name:'Equipo de mostrador QA',quantity:1}]),createHash('sha256').update(token).digest('hex'),owner.id]);
  ok(await buyer.client.rpc('claim_counter_purchase',{p_token:token}),'counter purchase');
  const response=await fetch(base+'/api/account/data',{headers:{Cookie:buyer.cookie()}});assert.equal(response.status,200);
  const data=await response.json();
  assert.ok(data.gear_items.some(item=>item.id===gear&&item.serial==='FOLLOWUP-OWN-SERIAL'));
  assert.equal(data.purchases_and_sales.length,1);assert.equal(data.purchases_and_sales[0].origin,'counter');
  assert.equal(data.purchases_and_sales[0].listing,'Equipo de mostrador QA');
  assert.ok(!JSON.stringify(data).includes('FOREIGN-SERIAL-NEVER-EXPORT'));
  console.log('PASS Descargar mis datos includes Mi equipo and counter purchases while excluding another account’s gear');
}finally {
  try {
    await db.query('rollback');
    if(store) {
      await db.query('begin');await db.query("set local session_replication_role='replica'");
      for(const table of ['laria_private.store_location_movement_requests','public.store_stock_movements','public.store_inventory_changes'])await db.query(`delete from ${table} where store_id=$1`,[store]);
      await db.query('delete from public.verified_transactions where buyer_user_id=any($1::uuid[])',[users]);
      await db.query('delete from public.store_counter_sales where store_id=$1',[store]);
      await db.query('commit');
      await db.query('delete from public.store_inventory_items where store_id=$1',[store]);
      await db.query('delete from public.store_locations where store_id=$1',[store]);
      await db.query('delete from public.stores where id=$1',[store]);
    }
    for(const id of users)ok(await admin.auth.admin.deleteUser(id),'remove fixture account');
  } finally { await db.end(); }
}})().catch(error=>{console.error(error);process.exitCode=1;});
