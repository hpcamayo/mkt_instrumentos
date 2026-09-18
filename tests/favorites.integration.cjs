// Local-only API/RLS and optional actual-browser proof; always removes fixtures.
const assert=require('node:assert/strict');
const {loadEnvFile}=require('node:process');
const {createClient}=require('@supabase/supabase-js');
const {createServerClient}=require('@supabase/ssr');
loadEnvFile('.env.local');
const base=process.argv[2],url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.ok(base&&['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(url&&['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local Supabase only');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const users=[],listingIds=[],storeIds=[],objects=[];
const suffix=crypto.randomUUID();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKElEQVR4nGNQTX5NFcQwapDqaBipjqaj5NEskjxajLweLSFfD2QtAgBZoULucEia/gAAAABJRU5ErkJggg==','base64');
async function ok(result){assert.equal(result.error,null,result.error?.message);return result.data;}
async function user(label,account_type='seller'){
 const email=`s5-${label}-${suffix}@example.invalid`,password=`Qa-${crypto.randomUUID()}`;
 const data=await ok(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{account_type,full_name:label,phone:'51999999111',city:'Lima',region:'Lima'}}));users.push(data.user.id);
 let cookies=[];const client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookies,setAll:values=>{cookies=values.map(({name,value})=>({name,value}));}}});
 const account={id:data.user.id,email,password,client,cookie:''};
 account.reauthenticate=async()=>{await ok(await client.auth.signInWithPassword({email,password}));account.cookie=cookies.map(({name,value})=>`${name}=${value}`).join('; ');};
 await account.reauthenticate();return account;
}
async function listing(owner,status='approved',store=null){
 const id=crypto.randomUUID();listingIds.push(id);
 const row={id,slug:`s5-${id}`,title:'Sprint 5 pública',seller_type:store?'store':'individual',status,category:'guitars',instrument_type:'electric_guitar',attributes:{},brand:'Yamaha',model:'QA',condition:store?'Nuevo':'Usado - buen estado',price_pen:1200,city:'Lima',region:'Lima',contact_name:'QA',whatsapp_phone:'51999999111',description:'Descripción suficientemente extensa de esta publicación de pruebas Sprint 5.',owner_user_id:owner.id,store_id:store?.id??null,created_by_source:'admin'};
 row.marketplace_rules_accepted_at=new Date().toISOString();
 await ok(await service.from('listings').insert(row));
 for(let n=0;n<2;n++){const key=`${owner.id}/${id}/${n}.png`;objects.push(['listing-photos',key]);await ok(await service.storage.from('listing-photos').upload(key,png,{contentType:'image/png'}));await ok(await service.from('listing_photos').insert({listing_id:id,image_url:service.storage.from('listing-photos').getPublicUrl(key).data.publicUrl,sort_order:n}));}
 return row;
}
async function application(owner){const id=crypto.randomUUID();storeIds.push(id);const ruc='20'+String(Date.now()).slice(-9);const row={id,slug:`s5-store-${id}`,name:'Tienda Sprint 5',razon_social:'Tienda Sprint 5 SAC',ruc,email:owner.email,contact_person:'Contacto QA',whatsapp_phone:'51999999111',city:'Lima',region:'Lima',address:'Av. QA 123',owner_user_id:owner.id,status:'pending'};await ok(await service.from('stores').insert(row));return row;}
async function api(actor,body,status=200){const response=await fetch(`${base}/api/favorites`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(actor?{Cookie:actor.cookie}:{})},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,status,value.message);return value;}
async function notes(item){return await ok(await service.from('notifications').select('*').eq('listing_id',item.id).eq('event_type','listing_price_drop'));}
async function edit(actor,item,price,extra={}){return await ok(await actor.client.rpc('update_owned_listing',{p_listing_id:item.id,p_immediate:{price_pen:price},...extra}));}
(async()=>{try{
 const owner=await user('owner'),buyer=await user('buyer'),other=await user('other'),storeBuyer=await user('store-buyer','store_owner'),storeOwner=await user('store-owner','store_owner');
 const live=await listing(owner);
 await api(null,{action:'set',id:live.id,saved:true},401);
 await api(owner,{action:'set',id:live.id,saved:true},409);
 const concurrent=await Promise.all(Array.from({length:4},()=>api(buyer,{action:'set',id:live.id,saved:true})));
 assert.ok(concurrent.every(result=>result.saved));assert.equal((await ok(await service.from('favorites').select('*').eq('listing_id',live.id))).length,1);
 assert.equal((await ok(await other.client.from('favorites').select('*'))).length,0);
 assert.equal((await ok(await owner.client.from('favorites').select('*'))).length,0);
 assert.ok((await buyer.client.from('favorites').insert({user_id:other.id,listing_id:live.id})).error);
 assert.deepEqual((await api(buyer,{action:'states',ids:[live.id]})).saved,[live.id]);
 const legacy=(await ok(await service.from('listings').select('id').is('owner_user_id',null).limit(1)))[0];
 assert.deepEqual((await api(buyer,{action:'states',ids:[legacy.id,live.id]})).saved,[live.id]);
 await api(storeBuyer,{action:'set',id:live.id,saved:true});
 await edit(owner,live,1100);await edit(owner,live,1100);await edit(owner,live,1150);
 assert.equal((await notes(live)).length,2);
 const first=(await notes(live)).find(row=>row.user_id===buyer.id);assert.equal(first.old_price_pen,1200);assert.equal(first.new_price_pen,1100);assert.match(first.message,/S\/ 1200 a S\/ 1100/);
 assert.equal((await ok(await other.client.from('notifications').select('*').eq('id',first.id))).length,0);
 assert.ok((await other.client.rpc('mark_notification_read',{p_notification_id:first.id})).error);
 await ok(await buyer.client.rpc('mark_notification_read',{p_notification_id:first.id}));
 await api(buyer,{action:'set',id:live.id,saved:false});await api(buyer,{action:'set',id:live.id,saved:false});
 await edit(owner,live,1000);assert.equal((await notes(live)).length,3);
 await api(buyer,{action:'set',id:live.id,saved:true});assert.equal((await notes(live)).length,3,'No retrospective drop');
 await edit(owner,live,900);assert.equal((await notes(live)).length,5);
 const report=await ok(await owner.client.rpc('get_account_analytics',{p_days:30}));assert.equal(report.summary.favorites,2);assert.equal(report.summary.favorite_additions,3);assert.equal(report.summary.favorite_removals,1);assert.equal(report.summary.favorite_rate,null);assert.ok(!JSON.stringify(report).includes(buyer.id));
 const store=await application(storeOwner),inventory=await listing(storeOwner,'approved',store);
 await api(buyer,{action:'set',id:inventory.id,saved:true},409);
 for(const state of ['pending','rejected','hidden']){const privateListing=await listing(owner,state);await api(buyer,{action:'set',id:privateListing.id,saved:true},409);await edit(owner,privateListing,1000);assert.equal((await notes(privateListing)).length,0);}
 await edit(owner,live,900,{p_moderated:{title:'Nueva propuesta sin alerta'}});assert.equal((await notes(live)).length,5);
 if(process.env.LARIA_FAVORITES_BROWSER==='1'){
  await require('./favorites-browser-smoke.cjs').run({base,service,owner,buyer,storeBuyer,storeOwner,other,live,store,inventory,storeIds,objects});
  // Browser logout revokes that user's other refresh sessions too. Renew test
  // clients rather than treating a deliberately signed-out cookie as valid.
  for(const account of [owner,buyer,storeBuyer])await account.reauthenticate();
 }
 await ok(await owner.client.rpc('set_owned_listing_lifecycle',{p_listing_id:live.id,p_action:'hide'}));
 const hidden=await ok(await buyer.client.rpc('get_account_favorites',{}));const entry=hidden.items.find(row=>row.listing_id===live.id);assert.equal(entry.availability,'unavailable');for(const key of ['title','slug','price_pen','image_url'])assert.equal(entry[key],null);
 assert.equal(await ok(await buyer.client.rpc('get_favorite_destination',{p_listing_id:live.id})),null);
 const destination=await fetch(`${base}/mi-cuenta/favoritos/${live.id}`,{headers:{Cookie:buyer.cookie}});assert.equal(destination.status,200);assert.match(await destination.text(),/Publicación no disponible/);
 if(process.env.LARIA_FAVORITES_BROWSER==='1')await require('./favorites-browser-smoke.cjs').history({base,buyer,live,availability:'unavailable'});
 await ok(await owner.client.rpc('set_owned_listing_lifecycle',{p_listing_id:live.id,p_action:'restore'}));await ok(await owner.client.rpc('set_owned_listing_lifecycle',{p_listing_id:live.id,p_action:'sold'}));
 const sold=await ok(await buyer.client.rpc('get_account_favorites',{}));assert.equal(sold.items.find(row=>row.listing_id===live.id).availability,'sold');
 if(process.env.LARIA_FAVORITES_BROWSER==='1')await require('./favorites-browser-smoke.cjs').history({base,buyer,live,availability:'sold'});
 const copied=await ok(await owner.client.rpc('relist_sold_listing',{p_listing_id:live.id}));const copyId=typeof copied==='object'?copied.id:copied;listingIds.push(copyId);
 assert.equal((await ok(await service.from('favorites').select('*').eq('listing_id',copyId))).length,0);
 console.log('PASS FAV-001–010; PDA-001–008 in-app only; RLS/current-state/actions/fan-out/retries/history/relist/destinations; no email claim.');
}finally{
 if(users.length)await ok(await service.from('marketplace_events').delete().in('actor_user_id',users));
 if(listingIds.length){const revisions=await ok(await service.from('listing_revisions').select('id').in('listing_id',listingIds));if(revisions.length)await ok(await service.from('listing_revision_photos').delete().in('revision_id',revisions.map(row=>row.id)));await ok(await service.from('listing_revisions').delete().in('listing_id',listingIds));await ok(await service.from('listings').delete().in('id',listingIds));}
 for(const id of users){const rows=await ok(await service.from('stores').select('id').eq('owner_user_id',id));for(const row of rows??[])storeIds.push(row.id);}
 if(storeIds.length)await ok(await service.from('stores').delete().in('id',[...new Set(storeIds)]));
 for(const id of users){for(const bucket of ['store-assets']){const folders=await ok(await service.storage.from(bucket).list(id));for(const folder of folders??[]){const files=await ok(await service.storage.from(bucket).list(`${id}/${folder.name}`));for(const file of files??[])objects.push([bucket,`${id}/${folder.name}/${file.name}`]);}}}
 for(const bucket of ['listing-photos','store-assets']){const keys=[...new Set(objects.filter(([b])=>b===bucket).map(([,key])=>key))];if(keys.length)await ok(await service.storage.from(bucket).remove(keys));}
 for(const id of users)await ok(await service.auth.admin.deleteUser(id));
 const remaining=await ok(await service.auth.admin.listUsers({perPage:1000}));assert.equal(remaining.users.filter(row=>users.includes(row.id)).length,0);
 console.log('QA cleanup: users 0, stores 0, listings 0; owned listing/store assets removed.');
}})().catch(error=>{console.error(error);process.exitCode=1;});
