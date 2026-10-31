// PR #54 pilot security checks on the full local app + Supabase Auth, PostgREST and Storage.
// Run through scripts/acceptance/full-stack.sh, or pass its local app URL as the first argument.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { enrollTwoStep } = require('./support/two-step.cjs');
const base=process.argv[2] || 'http://localhost:3100';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(line=>{const at=line.indexOf('=');return[line.slice(0,at),line.slice(at+1)];}));
const api=env.NEXT_PUBLIC_SUPABASE_URL, anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for (const value of [base,api]) if(!['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname)) throw new Error('Disposable local stack required');
const admin=createClient(api,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[], files=[];
const password=randomUUID()+'Qa9!';
const client=()=>createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});
function ok(result, label){assert.equal(result.error,null,label+': '+result.error?.message);return result.data;}
async function account(role='seller') {
  const email=`pilot-security-${randomUUID()}@example.invalid`;
  const data=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:role==='admin'?{role:'admin'}:{},user_metadata:{full_name:'Persona QA',account_type:role==='store_owner'?'store_owner':'seller',phone:'51999996101',city:'Lima',region:'Lima'}}),'create user');
  users.push(data.user.id);return {id:data.user.id,email};
}
async function signIn(user) {const result=client();ok(await result.auth.signInWithPassword({email:user.email,password}),'sign in');return result;}
async function post(path, body, cookie, ip) {
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{}),...(ip?{'x-forwarded-for':ip,'x-real-ip':ip}:{})},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json(),cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
(async()=>{
 let provider, service;
 try {
  const providerUser=await account();provider=await signIn(providerUser);
  service=ok(await provider.rpc('save_service',{p_service_id:null,p_fields:{category:'clases',title:'Clases de guitarra para principiantes',provider_name:'Persona QA',description:'Clases de guitarra acústica y eléctrica para todas las edades, con material incluido y repertorio a tu gusto.',price_from_pen:50,price_unit:'clase',modalities:['en_linea'],skills:['guitarra'],city:'Lima',region:'Lima',whatsapp_phone:'51999996101'}}),'create service');
  const adminUser=await account('admin'), elevated=await signIn(adminUser);
  await enrollTwoStep(elevated);
  ok(await elevated.rpc('admin_review_service',{p_service_id:service.id,p_decision:'approve',p_reason:null,p_expected_version:service.version??1}),'approve service');
  const codes=ok(await elevated.rpc('create_my_recovery_codes'),'recovery codes');
  const passwordOnly=await signIn(adminUser);
  const oldPasswordToken=(await passwordOnly.auth.getSession()).data.session.access_token;
  const oldElevatedToken=(await elevated.auth.getSession()).data.session.access_token;
  const login=await post('/api/auth/login',{email:adminUser.email,password});
  assert.equal(login.status,200);assert.equal(login.body.needsCode,true);
  assert.match((await passwordOnly.rpc('export_my_data')).error.message,/TWO_STEP_REQUIRED/);
  const denied=await post('/api/services/events',{eventId:randomUUID(),serviceId:service.id,kind:'contact'},login.cookie);
  assert.equal(denied.status,403);
  console.log('PASS enrolled Admin aal1 cannot persist a service contact through the service role');

  // Previously enrolled non-Admin accounts also use ordinary sign-in during the pilot.
  for(const role of ['seller','store_owner']) {
   const user=await account(role), enrolled=await signIn(user);await enrollTwoStep(enrolled);
   const signed=await post('/api/auth/login',{email:user.email,password});
   assert.equal(signed.status,200);assert.equal(signed.body.needsCode,false);
   const plain=await signIn(user);
   ok(await plain.rpc('export_my_data'),'pilot non-Admin export');
   const response=await fetch(base+'/mi-cuenta/seguridad',{headers:{Cookie:signed.cookie}});
   assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/id="dos-pasos"/);
   const event=await post('/api/services/events',{eventId:randomUUID(),serviceId:service.id,kind:'contact'},signed.cookie);
   assert.equal(event.status,200);assert.equal(event.body.recorded,true);
   // Supabase Auth itself must not force the second step for an ordinary pilot password change.
   const changed=await plain.auth.updateUser({password:password+'Next'});
   assert.equal(changed.error,null,'non-Admin password change must not need a second step: '+changed.error?.message);
  }
  assert.equal((await post('/api/services/events',{eventId:randomUUID(),serviceId:service.id,kind:'contact'})).status,200);
  console.log('PASS Particular/service and store accounts have no code prompt or enrollment panel; ordinary and anonymous contacts work');

  const file=`${adminUser.id}/${randomUUID()}/1.jpg`;files.push(file);
  ok(await admin.storage.from('stolen-gear-photos').upload(file,Buffer.from([1,2,3]),{contentType:'image/jpeg'}),'private fixture');
  ok(await elevated.storage.from('stolen-gear-photos').download(file),'Admin aal2 private file');
  const recovered=await post('/api/account/two-step/recovery',{code:codes[0]},login.cookie);
  assert.equal(recovered.status,200,JSON.stringify(recovered.body));
  for(const token of [oldPasswordToken,oldElevatedToken]) {
   const response=await fetch(api+'/rest/v1/rpc/export_my_data',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
   assert.equal(response.status,403);assert.match(await response.text(),/AUTH_SESSION_REVOKED/);
  }
  assert.ok((await passwordOnly.storage.from('stolen-gear-photos').download(file)).error);
  assert.ok((await elevated.storage.from('stolen-gear-photos').download(file)).error);
  assert.ok((await passwordOnly.auth.refreshSession()).error,'old aal1 refresh token must be revoked');
  assert.ok((await elevated.auth.refreshSession()).error,'old aal2 refresh token must be revoked');
  const fresh=await signIn(adminUser);
  const requirement=ok(await fresh.rpc('my_two_step_requirement'),'post-recovery requirement');
  assert.equal(requirement.required,true);assert.equal(requirement.has_factor,false);assert.equal(requirement.recovery_codes_left,0);
  console.log('PASS recovery revokes aal1/aal2 refresh tokens, blocks issued JWTs and private files, clears remaining codes, and keeps Admin enrollment required');

  const direct=await fetch(api+'/rest/v1/rpc/submit_help_ticket',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'},body:JSON.stringify({p_name:'Persona QA',p_email:'direct@example.invalid',p_topic:'otro',p_message:'Consulta de prueba con texto suficiente'})});
  assert.ok([401,403].includes(direct.status),'anon cannot call the help writer directly');
  const ip='198.51.100.54';
  for(let n=0;n<11;n++) {
   const answer=await post('/api/help/tickets',{name:'Persona QA',email:`pilot-help-${randomUUID()}@example.invalid`,topic:'otro',message:'Consulta de prueba con texto suficiente'},null,ip);
   assert.equal(answer.status,n<10?200:429,JSON.stringify(answer.body));
  }
  console.log('PASS anonymous direct help RPC is refused; server route enforces ten-per-client limit across different emails');
 } finally {
  if(service&&provider)await provider.rpc('delete_service',{p_service_id:service.id});
  if(files.length)await admin.storage.from('stolen-gear-photos').remove(files);
  for(const id of users)await admin.auth.admin.deleteUser(id);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
