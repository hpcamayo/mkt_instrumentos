const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(file, mocks) {
  const filename=path.resolve(file), mod=new Module(filename,module);
  mod.filename=filename;mod.paths=module.paths;
  const real=mod.require.bind(mod);mod.require=(name)=>Object.hasOwn(mocks,name)?mocks[name]:real(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  return mod.exports;
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const request=(body)=>new Request('https://laria.audio/api/test',{method:'POST',headers:{Origin:'https://laria.audio','Content-Type':'application/json'},body:JSON.stringify(body)});

test('pilot: only Admin receives an authenticator prompt, including previously enrolled store/service accounts',async()=>{
 const {getAssurance}=require('@/lib/auth/two-step');
 for(const role of [undefined,'store_owner','seller','admin']){
  const state=await getAssurance({auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal2'}})},getClaims:async()=>({data:{claims:{app_metadata:{role}}}})}});
  assert.equal(state.needsCode,role==='admin');assert.equal(state.hasFactor,role==='admin');
 }
});

test('recovery: revoke globally before deleting factors; report errors and invalidate remaining codes',async()=>{
 for(const failure of [null,'revoke','factor','finish']){
  const calls=[];
  const supabase={rpc:async()=>({data:true}),auth:{getSession:async()=>({data:{session:{access_token:'verified-session-token'}}}),signOut:async()=>{calls.push('local');return{};}}};
  const admin = {
    auth: {
      admin: {
        signOut: async (token, scope) => {
          assert.equal(token, 'verified-session-token');
          assert.equal(scope, 'global');
          calls.push('revoke');
          return { error: failure === 'revoke' ? {} : null };
        },
        mfa: {
          listFactors: async () => ({ data: { factors: [{ id: 'factor' }] } }),
          deleteFactor: async () => {
            calls.push('factor');
            return { error: failure === 'factor' ? {} : null };
          },
        },
      },
    },
    rpc: async (name, args) => {
      assert.equal(name, 'service_finish_two_step_recovery');
      assert.equal(args.p_user_id, 'admin-user');
      calls.push('finish');
      return { error: failure === 'finish' ? {} : null };
    },
  };
  const {POST}=load('app/api/account/two-step/recovery/route.ts',{
   '@/lib/account/route-helpers':{accountClient:async()=>({supabase,user:{id:'admin-user',app_metadata:{role:'admin'}}}),accountError:(message,status)=>json({message},status),accountJson:json},
   '@/lib/supabase/admin-client':{getSupabaseAdminClient:()=>admin},
  });
  const response=await POST(request({code:'ABCD-2345'}));
  assert.equal(response.status,failure?503:200);
  assert.deepEqual(calls,failure==='revoke'?['revoke']:failure==='factor'?['revoke','factor']:failure==='finish'?['revoke','factor','finish']:['revoke','factor','finish','local']);
 }
});

test('service events: refuse an incomplete Admin session before a service-role write; allow ordinary pilot users and anonymous contact',async()=>{
 for(const [actor,owes,status] of [['admin',true,403],['provider',false,200],[null,false,200]]){
  let writes=0,checks=0;
  const {POST}=load('app/api/services/events/route.ts',{
   'next/server':{NextResponse:{json:(b,init={})=>json(b,init.status??200)}},
   '@/lib/marketplace-event-payload':{isUuid:()=>true},
   '@/lib/marketplace-events-server':{sameOriginEventRequest:()=>true,getMarketplaceSession:async()=>'session'},
   '@/lib/supabase/server-client':{getSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})}})},
   '@/lib/auth/complete-session':{sessionOwesTwoStep:async()=>{checks++;return owes;}},
   '@/lib/supabase/admin-client':{getSupabaseAdminClient:()=>({})},
   '@/lib/services-db':{servicesDb:()=>({rpc:async(_,args)=>{writes++;assert.equal(args.p_actor_user_id,actor);return{data:{recorded:true}};}})},
  });
  assert.equal((await POST(request({eventId:'e',serviceId:'s',kind:'contact'}))).status,status);
  assert.equal(writes,status===200?1:0);assert.equal(checks,actor?1:0);
 }
});

test('pilot factor retirement removes only a verified non-Admin user\'s older factors and keeps Admin factors', async () => {
  const removed=[];
  const {retirePilotNonAdminFactors}=load('lib/auth/pilot-two-step.ts',{
    'server-only':{},
    '@/lib/supabase/admin-client':{getSupabaseAdminClient:()=>({auth:{admin:{mfa:{deleteFactor:async(args)=>{removed.push(args);return {error:null};}}}}})},
  });
  await retirePilotNonAdminFactors({id:'admin',app_metadata:{role:'admin'},factors:[{id:'admin-factor'}]});
  await retirePilotNonAdminFactors({id:'ordinary',app_metadata:{},factors:[]});
  assert.deepEqual(removed,[]);
  await retirePilotNonAdminFactors({id:'ordinary',app_metadata:{},factors:[{id:'old-factor'}]});
  assert.deepEqual(removed,[{userId:'ordinary',id:'old-factor'}]);
});
