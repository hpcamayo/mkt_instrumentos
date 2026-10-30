"use strict";
const h=require("./harness.cjs"),{until}=require("./d-helpers.cjs"),c=require("./c-helpers.cjs");
const {execFileSync}=require("node:child_process"),path=require("node:path");
const L=h.literal,cases=[];
// Supabase's local Mailpit HTTP port is the API port + 3; EASE_MAIL_URL supports custom stacks.
const mailBase=()=>{
  if(process.env.EASE_MAIL_URL)return process.env.EASE_MAIL_URL.replace(/\/$/,"");
  const api=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||"http://127.0.0.1:54321");
  if(!["localhost","127.0.0.1"].includes(api.hostname))throw new Error("Auth inbox checks require a local Supabase stack");
  api.port=String(Number(api.port||54321)+3);return api.origin;
};
async function mail(email) {
  let message;
  await until(async()=>{
    const r=await fetch(mailBase()+"/api/v1/messages");
    const data=r.ok?await r.json():{};
    message=(data.messages||[]).find(m=>(m.To||[]).some(to=>to.Address===email));
    return Boolean(message);
  },{timeout:15000});
  if(!message)throw new Error("Local test email did not arrive");
  const detail=await (await fetch(mailBase()+"/api/v1/message/"+message.ID)).json();
  return {to:detail.To,body:{html:detail.HTML,text:detail.Text}};
}
async function signup(t,page,next) {
  const email="ease-signup-"+t.tag()+"@laria.test";
  await t.goto(page,"/login?next="+encodeURIComponent(next));
  await page.getByRole("link",{name:"Crear cuenta",exact:true}).click();await page.waitForURL(/\/registro\/vendedor/);
  t.check(new URL(page.url()).searchParams.get("next")===next,"Crear cuenta carries the sign-in return path");
  t.check(await page.getByLabel(/WhatsApp|Ciudad/).count()===0,"sign-up asks no phone or city");
  await page.getByLabel("Nombre completo",{exact:true}).fill("Prueba Registro EASE");
  await page.locator("#signup-email").fill(email);await page.locator("#signup-password").fill(t.PASSWORD);
  await page.locator("#signup-rules").check();await page.getByRole("button",{name:"Crear cuenta",exact:true}).click();
  const message=await mail(email),body=(message.body?.html||"")+" "+(message.body?.text||"");
  const match=body.match(/https?:[^"'<> \r\n]+\/auth\/v1\/verify[^"'<> \r\n]+/);
  if(!match)throw new Error("Local confirmation email has no verification link");
  const url=match[0].replace(/&amp;/g,"&");
  try{await t.goto(page,url);await page.waitForURL(u=>u.origin===t.base&&u.pathname===new URL(next,t.base).pathname);}
  catch{throw new Error("Local confirmation did not return to the requested page");}
  return email;
}
cases.push({id:"EASE-208",liveAccounts:false,run:async(t)=>{
  const page=await t.page(),next="/listados?category=guitars&brand=Fender";
  const email=await signup(t,page,next);
  t.check(new URL(page.url()).search===new URL(next,t.base).search,"the actual confirmation email returns with the search query intact");
  t.check(t.sql("select email_confirmed_at from auth.users where email="+L(email))[0]?.email_confirmed_at,"the local Auth verification confirms the new account");
}});
cases.push({id:"EASE-228",liveAccounts:false,run:async(t)=>{
  const page=await t.page();await signup(t,page,"/mi-cuenta/publicar");
  t.check(await page.getByRole("heading",{name:"Completa tu perfil Particular",exact:true}).isVisible(),"first publication requires the missing WhatsApp and location");
  await page.getByRole("link",{name:"Completar perfil",exact:true}).click();await page.waitForURL(/\/mi-cuenta\/perfil/);await page.getByLabel(/WhatsApp/).waitFor();
  t.check(await page.getByLabel(/WhatsApp/).count()>0&&await page.getByLabel("Ciudad",{exact:true}).count()>0,"the linked profile form asks for WhatsApp and city");
  await t.shot(page,"first-publication-profile");
}});
cases.push({id:"EASE-227",liveAccounts:false,run:async(t)=>{
  const buyer=t.account({kind:"buyer"}),page=await t.page();
  await t.goto(page,"/login");await page.getByLabel("Correo",{exact:true}).fill(buyer.email);await page.getByLabel("Contraseña",{exact:true}).fill("incorrecta-para-prueba");
  await page.getByRole("button",{name:"Ingresar",exact:true}).click();
  await page.getByRole("button",{name:/^¿Prefieres un enlace\?/}).click();
  const message=await mail(buyer.email),to=JSON.stringify(message.to||message.header?.to||"");
  t.check(to.includes(buyer.email),"the magic link is sent to the same typed email");
  t.check(await page.getByLabel("Correo",{exact:true}).inputValue()===buyer.email,"the typed email is retained");
  const body=(message.body?.html||"")+" "+(message.body?.text||"");
  t.check(/\/auth\/v1\/verify/.test(body),"the local mailbox receives a real Supabase magic-link email");
}});
cases.push({id:"EASE-216",liveAccounts:false,run:async(t)=>{
  const buyer=t.account({kind:"buyer"});
  t.sqlAs(buyer.id,"select public.create_saved_search_alert('{\"category\":\"guitars\"}'::jsonb,'daily') as r");
  const alert=t.sql("select id,status from public.saved_search_alerts where user_id="+L(buyer.id))[0];
  t.exec("insert into public.email_preferences(user_id,price_drop_emails,follow_digest_emails) values ("+L(buyer.id)+",true,true) on conflict(user_id) do update set price_drop_emails=true,follow_digest_emails=true");
  for(const [action,label,column]of [["pause_alert","Pausar esta alerta",null],["no_price_drops","No más bajas de precio","price_drop_emails"],["no_follow_digest","No más resumen semanal","follow_digest_emails"]]){
    const payload={user:buyer.id,action,...(column?{}:{alert:alert.id})};
    const script="const M=require('node:module'),load=M._load;M._load=function(r,...args){return r==='server-only'?{}:load.call(this,r,...args)};const {createEmailLinkToken}=require('./lib/email/links.ts');process.stdout.write(createEmailLinkToken(JSON.parse(process.argv[1]))||'');";
    const token=execFileSync(process.execPath,["--require",path.resolve("tests/setup-alias.cjs"),"-e",script,JSON.stringify(payload)],{encoding:"utf8"});
    if(!token)throw new Error("Local email token could not be generated");
    const page=await t.page();await t.goto(page,"/correos/baja?token="+encodeURIComponent(token));
    const before=column?t.sql("select "+column+" as v from public.email_preferences where user_id="+L(buyer.id))[0].v:t.sql("select status from public.saved_search_alerts where id="+L(alert.id))[0].status==="active";
    t.check(before,action+" is unchanged until the confirmation tap");
    await page.getByRole("button",{name:label,exact:true}).click();
    await page.waitForURL(u=>u.pathname==="/correos/baja"&&u.searchParams.has("hecho"));
    const after=column?t.sql("select "+column+" as v from public.email_preferences where user_id="+L(buyer.id))[0].v:t.sql("select status from public.saved_search_alerts where id="+L(alert.id))[0].status==="active";
    t.check(after===false,action+" applies without signing in");
  }
}});
cases.push({id:"EASE-311",run:async(t)=>{
  const owner=t.account({kind:"particular"}),page=await t.page({as:owner.email});
  await t.goto(page,"/mi-cuenta/publicar");await c.fillSell(page,{brand:null,model:null,stopAfter:2});
  const brand=c.sellForm(page).getByLabel("Marca",{exact:true});await brand.focus();
  const id=await brand.getAttribute("list");
  const values=id?await page.locator('[id="'+id+'"] option').evaluateAll(nodes=>nodes.map(n=>n.value)):[];
  t.check(values.length>0&&values.includes("Fender"),"the chosen guitar category supplies catalog brand suggestions");
  if(!values.length){t.note("Brand list missing: "+JSON.stringify({list:id,category:await c.sellForm(page).locator('button[aria-pressed="true"]').allTextContents()}));return;}
  await brand.fill(values[0]);
  t.check(await brand.inputValue()===values[0],"a catalog suggestion can be used as the brand");
}});
module.exports=cases;
