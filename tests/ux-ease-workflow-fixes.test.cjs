"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const counter=require(path.resolve("lib/inventory-counter.ts"));
const sale=(key)=>({key,channel:"tienda_fisica",lines:[{item_id:key,merchant_sku:key,quantity:1}],created_at:new Date().toISOString()});
const refusal={ok:false,code:"STOCK_INSUFFICIENT",message:"No hay stock disponible suficiente.",detail:{quantity_available:0}};

test("offline replay coalesces overlapping runs and preserves a newer sale and its refusal",async()=>{
  let queue=[sale("first")],finish;
  const calls=[],recorded=[];
  const flush=counter.createCounterQueueFlusher({
    read:()=>queue,update:change=>{queue=change(queue);},
    send:entry=>{calls.push(entry.key);return entry.key==="first"?new Promise(resolve=>{finish=resolve;}):Promise.resolve(refusal);},
    onRecorded:count=>recorded.push(count),
  });
  const first=flush(),overlap=flush();
  assert.equal(first,overlap);
  queue.push(sale("newer"));
  finish({ok:true,data:{}});
  await first;
  assert.deepEqual(queue.map(entry=>entry.key),["newer"]);
  assert.deepEqual(calls,["first"]);
  assert.deepEqual(recorded,[1]);
  await flush();
  assert.equal(queue[0].error,refusal.message);
  await flush();await flush();
  assert.deepEqual(calls,["first","newer"],"a refused sale is retained and not retried");
});

test("a late refusal cannot resurrect a discarded sale or erase another one",async()=>{
  let queue=[sale("discarded")],finish;
  const flush=counter.createCounterQueueFlusher({
    read:()=>queue,update:change=>{queue=change(queue);},
    send:()=>new Promise(resolve=>{finish=resolve;}),onRecorded:()=>{},
  });
  const pending=flush();
  const kept=sale("keep");queue=[kept];
  finish(refusal);
  await pending;
  assert.deepEqual(queue,[kept]);
});

test("connection failure leaves the sale and idempotency key for the next replay",async()=>{
  let queue=[sale("same-key")],online=false;
  const keys=[];
  const flush=counter.createCounterQueueFlusher({
    read:()=>queue,update:change=>{queue=change(queue);},
    send:async entry=>{keys.push(entry.key);return online?{ok:true,data:{}}:{ok:false,code:"NETWORK",message:"Sin conexión",detail:null};},
    onRecorded:()=>{},
  });
  await flush();
  assert.equal(queue.length,1);assert.equal(queue[0].error,undefined);
  online=true;await flush();
  assert.deepEqual(keys,["same-key","same-key"]);assert.deepEqual(queue,[]);
});

function loadRoute(mocks){
  const Module=require("node:module"),ts=require("typescript"),filename=path.resolve("app/api/listings/refresh/route.ts");
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
  const original=mod.require.bind(mod);mod.require=name=>Object.hasOwn(mocks,name)?mocks[name]:original(name);
  mod._compile(compiled,filename);return mod.exports;
}
function refreshFixture(){
  const owner="f1000000-0000-4000-8000-000000000001",queries=[],cleared=[];
  let signedIn=owner,failedPage=-1;
  const admin={from:table=>{
    const call={table};queries.push(call);
    const builder={
      select:value=>{call.select=value;return builder;},
      eq:(field,value)=>{call.owner=[field,value];return builder;},
      gte:(field,value)=>{call.recent=[field,value];return builder;},
      order:field=>{call.order=field;return builder;},
      range:async(from,to)=>{
        call.range=[from,to];
        return from===failedPage?{data:null,error:{message:"unavailable"}}:
          {data:from===0?Array.from({length:1000},(_,i)=>({slug:"mine-"+i})):[{slug:"mine-last"}],error:null};
      },
    };return builder;
  }};
  const route=loadRoute({
    "next/server":{NextResponse:{json:(body,options={})=>new Response(JSON.stringify(body),options)}},
    "@/lib/supabase/server-client":{getSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:signedIn}:null}})}})},
    "@/lib/supabase/admin-client":{getSupabaseAdminClient:()=>admin},
    "@/lib/listing-cache":{dropListingPages:slugs=>cleared.push(...slugs)},
  });
  return{owner,queries,cleared,signOut:()=>{signedIn=null;},failSecond:()=>{failedPage=1000;},
    post:body=>route.POST(new Request("https://laria.audio/api/listings/refresh",{method:"POST",body:JSON.stringify(body)}))};
}

test("vacation refresh paginates the signed-in owner's recent pages and ignores supplied ownership",async()=>{
  const f=refreshFixture(),response=await f.post({owned:true,owner_user_id:"someone-else"});
  assert.equal(response.status,200);assert.equal((await response.json()).refreshed,1001);
  assert.equal(f.cleared.length,1001);assert.equal(f.cleared.at(-1),"mine-last");
  assert.deepEqual(f.queries.map(q=>q.range),[[0,999],[1000,1999]]);
  for(const query of f.queries){
    assert.deepEqual(query.owner,["owner_user_id",f.owner]);
    assert.equal(query.recent[0],"updated_at");
    assert.ok(Math.abs(Date.now()-Date.parse(query.recent[1])-600000)<5000);
  }
});

test("vacation refresh refuses anonymous and ambiguous requests without reading listings",async()=>{
  const f=refreshFixture();f.signOut();
  assert.equal((await f.post({owned:true})).status,401);assert.equal(f.queries.length,0);
  assert.equal((await f.post({owned:true,listings:[f.owner]})).status,400);assert.equal(f.queries.length,0);
});

test("vacation refresh reports a read failure without clearing an incomplete list",async()=>{
  const f=refreshFixture();f.failSecond();
  assert.equal((await f.post({owned:true})).status,503);assert.deepEqual(f.cleared,[]);
});
