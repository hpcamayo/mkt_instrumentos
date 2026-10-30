"use strict";
const h = require("./harness.cjs"), { until } = require("./d-helpers.cjs");
const L=h.literal, cases=[], todo=(page)=>page.locator('section[aria-labelledby="pendientes-titulo"]');
function contact(t,item,buyer,days=5) {
  const seller=t.sql("select owner_user_id from public.listings where id="+L(item.id))[0].owner_user_id;
  t.exec("insert into public.marketplace_events(event_type,created_at,listing_id,seller_user_id,actor_user_id,source,metadata,dedupe_key) values ('whatsapp_contact',now()-make_interval(days=>"+days+"),"+L(item.id)+","+L(seller)+","+L(buyer.id)+",'detail','{}',"+L("remaining-"+t.tag())+")");
}
const listingRow=(t,id)=>t.sql("select id,status,price_pen,published_at,availability_confirmed_at,paused_until from public.listings where id="+L(id))[0];
async function failedRpc(t,signature,run) {
  if(t.live)t.skip("fault injection only runs on the disposable local database");
  const f=t.sql("select pg_get_functiondef(p.oid) as def, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as result, n.nspname||'.'||p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid="+L(signature)+"::regprocedure")[0];
  try { t.exec("create or replace function "+f.name+"("+f.args+") returns "+f.result+" language plpgsql security definer set search_path=public as $ease$ begin raise exception 'EASE simulated read failure'; end; $ease$"); await run(); }
  finally { t.exec(f.def); }
}
cases.push({id:"EASE-400",run:async(t)=>{
  const owner=t.account({kind:"particular"});
  const rejected=t.listing(owner,{status:"rejected"}),draft=t.listing(owner,{status:"draft"});
  t.exec("update public.listings set rejection_reason='Pocas fotos o fotos poco claras',rejection_codes=array['pocas_fotos'] where id="+L(rejected.id));
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta");
  const section=todo(page);
  t.check(await section.getByRole("heading",{name:"Pendientes",exact:true}).isVisible(),"account home opens with Pendientes");
  const text=await section.innerText();
  t.check(text.includes("Corrige tu publicación rechazada")&&text.includes(draft.title),"rejection and unfinished draft are actionable on the home");
  const links=await section.locator("a").allTextContents();
  t.check(links.indexOf("Corregir")<links.indexOf("Continuar"),"the rejection precedes the lower-urgency draft");
  t.check(!/Vistas totales|Contactos totales/.test(await page.locator("main").innerText()),"metrics do not replace the to-do home");
  await t.shot(page,"pendientes");
}});
cases.push({id:"EASE-401",run:async(t)=>{
  const owner=t.account({kind:"particular"}),page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta");
  t.check(await todo(page).getByRole("heading",{name:"Estás al día",exact:true}).isVisible(),"a fresh account shows Estás al día");
  t.check((await todo(page).innerText()).includes("Cuando algo necesite tu atención, aparecerá aquí primero."),"the empty state explains future pending items");
}});
cases.push({id:"EASE-402",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),page=await t.page({as:owner.email});
  await failedRpc(t,"public.get_account_pendientes()",async()=>{
    await t.goto(page,"/mi-cuenta");
    t.check(await page.getByText("No pudimos cargar tus pendientes", {exact:false}).isVisible(),"an actual RPC failure shows the read error");
    t.check(await page.getByRole("heading",{name:"Estás al día",exact:true}).count()===0,"a failed read is never presented as an empty list");
    await t.shot(page,"read-error");
  });
}});
cases.push({id:"EASE-403",run:async(t)=>{
  const seller=t.account({kind:"particular"}),buyer=t.account({kind:"buyer"});
  const yes=t.listing(seller),no=t.listing(seller);contact(t,yes,buyer);contact(t,no,buyer);
  const page=await t.page({as:buyer.email});await t.goto(page,"/mi-cuenta");
  const card=(item)=>todo(page).locator("li").filter({hasText:item.title}).first();
  t.check(await card(yes).getByRole("button",{name:"Sí, lo compré",exact:true}).getAttribute("aria-pressed")===null,"the answer is not preselected");
  await card(yes).getByRole("button",{name:"Sí, lo compré",exact:true}).click();
  await page.waitForTimeout(500);
  t.check(await until(()=>t.sql("select answer from public.purchase_checkins where listing_id="+L(yes.id)+" and buyer_user_id="+L(buyer.id))[0]?.answer==="yes"),"yes records the buyer answer");
  await t.goto(page,"/mi-cuenta");await card(no).getByRole("button",{name:"No lo compré",exact:true}).click();
  t.check(await until(()=>t.sql("select answer from public.purchase_checkins where listing_id="+L(no.id)+" and buyer_user_id="+L(buyer.id))[0]?.answer==="no"),"no records the answer and stops asking");
  await page.reload();t.check(await card(no).count()===0,"an answered negative check does not reappear");
  const notices=t.notifications(seller.id).filter(n=>n.listing_id===yes.id);
  t.check(notices.length===1,"the positive answer notifies the seller once");
}});
cases.push({id:"EASE-404",run:async(t)=>{
  const seller=t.account({kind:"particular"}),buyer=t.account({kind:"buyer"});
  const yes=t.listing(seller),no=t.listing(seller);
  for(const item of [yes,no]){contact(t,item,buyer);t.sqlAs(buyer.id,"select public.answer_purchase_checkin("+L(item.id)+",true) as r");}
  const page=await t.page({as:seller.email});await t.goto(page,"/mi-cuenta");
  const card=(item)=>todo(page).locator("li").filter({hasText:item.title}).first();
  await card(no).getByRole("button",{name:"No fue así",exact:true}).click();
  t.check(await until(()=>t.sql("select seller_decision from public.purchase_checkins where listing_id="+L(no.id))[0]?.seller_decision==="declined"),"denying the report creates no sale");
  t.check(listingRow(t,no.id).status==="approved","the denied listing stays approved");
  await card(yes).getByRole("button",{name:"Sí, me lo compró",exact:true}).click();
  await page.getByRole("alertdialog").waitFor();
  t.check(listingRow(t,yes.id).status==="approved","confirmation is required before marking the listing sold");
  await page.getByRole("alertdialog").getByRole("button",{name:"Confirmar venta",exact:true}).click();
  await page.waitForURL(/\/mi-cuenta\/transacciones\//);
  t.check(listingRow(t,yes.id).status==="sold","confirming the buyer report marks it sold");
  t.check(t.sql("select id from public.verified_transactions where listing_id="+L(yes.id)).length===1,"one verified transaction is created and opened");
}});
cases.push({id:"EASE-408",run:async(t)=>{
  const seller=t.account({kind:"particular"}),yes=t.listing(seller,{publishedDaysAgo:40}),price=t.listing(seller,{publishedDaysAgo:40}),sold=t.listing(seller,{publishedDaysAgo:40});
  t.exec("update public.listings set availability_checkin_at=now() where id in ("+[yes,price,sold].map(x=>L(x.id)).join(",")+")");
  const before=listingRow(t,yes.id).published_at,page=await t.page({as:seller.email});await t.goto(page,"/mi-cuenta");
  const card=(item)=>todo(page).locator("li").filter({hasText:item.title}).first();
  await card(yes).getByRole("button",{name:"Sí, sigue disponible",exact:true}).click();
  t.check(await until(()=>Boolean(listingRow(t,yes.id).availability_confirmed_at)),"yes records a fresh availability confirmation");
  t.check(listingRow(t,yes.id).published_at===before,"the first publication date is preserved");
  await card(price).getByRole("button",{name:"Bajar precio",exact:true}).click();
  await card(price).getByLabel("Nuevo precio").fill("1100");
  await card(price).getByRole("button",{name:/Guardar/}).click();
  t.check(await until(()=>Number(listingRow(t,price.id).price_pen)===1100&&Boolean(listingRow(t,price.id).availability_confirmed_at)),"lowering the price also confirms availability");
  await card(sold).getByRole("button",{name:"Lo vendí",exact:true}).click();
  if(await page.getByRole("alertdialog").count())await page.getByRole("alertdialog").getByRole("button",{name:"Marcar vendida",exact:true}).click();
  await page.waitForURL(/transacciones/);
  t.check(listingRow(t,sold.id).status==="sold","sold opens the buyer-selection flow");
  const visitor=await t.page();await t.goto(visitor,yes.path);
  t.check(await visitor.getByText(/confirmó que sigue disponible/).isVisible(),"the public listing shows the dated availability confirmation");
}});
cases.push({id:"EASE-410",run:async(t)=>{
  const seller=t.account({kind:"particular"}),buyer=t.account({kind:"buyer"}),other=t.account({kind:"buyer"}),item=t.listing(seller);
  contact(t,item,buyer,5);
  const page=await t.page({as:buyer.email});await t.goto(page,item.path);
  await page.getByText("¿Cómo te fue?",{exact:true}).waitFor();
  t.check(true,"a recent signed-in contact sees the purchase question");
  const anonymous=await t.page();await t.goto(anonymous,item.path);
  t.check(await anonymous.getByText("¿Cómo te fue?",{exact:true}).count()===0,"anonymous visitors see no purchase question");
  const stranger=await t.page({as:other.email});await t.goto(stranger,item.path);
  t.check(await stranger.getByText("¿Cómo te fue?",{exact:true}).count()===0,"a buyer who never contacted the listing sees no question");
}});
cases.push({id:"EASE-413",run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner,{status:"rejected"});
  t.exec("update public.listings set rejection_reason='Pocas fotos o fotos poco claras; Marca o modelo incorrectos. Nota: Revisa el modelo de prueba.',rejection_codes=array['pocas_fotos','marca_modelo'] where id="+L(item.id));
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/publicaciones/"+item.id+"/editar");
  const reasons=page.locator('section[aria-labelledby="motivo-rechazo"]');
  t.check(await reasons.getByRole("checkbox").count()===2,"rejection reasons appear as two unticked checklist choices");
  t.check(await reasons.getByRole("checkbox",{checked:true}).count()===0,"no reason is pre-ticked");
  t.check((await reasons.innerText()).includes("Revisa el modelo de prueba"),"the moderator note is shown");
  t.check(await page.getByText("Revisar",{exact:true}).count()>=2,"affected fields are marked Revisar");
  await t.shot(page,"rejection-reasons");
}});
cases.push({id:"EASE-415",run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner),page=await t.page({as:owner.email});
  await t.goto(page,"/mi-cuenta/publicaciones/"+item.id+"/editar");
  t.check(await page.getByText("Se publica al instante",{exact:true}).count()>0&&await page.getByText("Pasa por revisión",{exact:true}).count()>0,"the edit form distinguishes immediate and moderated fields");
  await page.getByLabel("Precio en soles").fill("1400");
  t.check(await page.getByText(/al instante|sin revisión/i).count()>0,"an immediate edit has a live publication explanation");
  await page.getByLabel("Título",{exact:false}).fill("Título corregido de prueba");
  t.check(await page.getByText(/revisión/).count()>0,"changing the title explains the review path");
  await t.shot(page,"edit-policy");
}});
cases.push({id:"EASE-424",run:async(t)=>{
  const owner=t.account({kind:"particular"}),other=t.account({kind:"buyer"}),page=await t.page({as:owner.email});
  const stranger=await t.page({as:other.email});
  for(const status of ["pending","hidden","draft","rejected"]){
    const item=t.listing(owner,{status}),path="/mi-cuenta/publicaciones/"+item.id+"/vista-previa";
    const response=await t.goto(page,path);
    t.check(response.status()===200&&(await page.getByRole("heading",{level:1}).innerText()).includes(item.title),status+" preview is readable by its owner");
    const robots=await page.locator('meta[name="robots"]').getAttribute("content");
    t.check(/noindex/.test(robots||""),status+" preview is noindex");
    const denied=await t.goto(stranger,path);
    t.check(denied.status()===404,status+" preview is not found for another account");
  }
}});
cases.push({id:"EASE-425",run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner),page=await t.page({as:owner.email});
  await t.goto(page,"/mi-cuenta");await page.getByRole("button",{name:"Pausar publicaciones",exact:true}).click();
  const date=page.getByLabel("Vuelvo el");
  t.check(await date.getAttribute("min")!==await date.getAttribute("max"),"the date field bounds the permitted pause range");
  await page.locator('section[aria-labelledby="vacaciones-titulo"]').getByRole("button",{name:"Guardar",exact:true}).click();
  t.check(await until(()=>Boolean(listingRow(t,item.id).paused_until)),"the owner can pause all publications");
  const visitor=await t.page();await t.goto(visitor,item.path);
  t.check(await visitor.getByText(/Vuelve el/).count()>0,"the paused listing remains public with its return date");
  t.check(await visitor.getByRole("link",{name:/WhatsApp/}).count()===0,"the pause disables buyer contact");
  await page.getByRole("button",{name:"Ya volví",exact:true}).click();
  t.check(await until(()=>listingRow(t,item.id).paused_until===null),"Ya volví ends the pause");
  t.check(await until(async()=>{await visitor.reload();await t.sleep(250);return await visitor.getByRole("link",{name:/WhatsApp/}).count()>0;},{timeout:45000,every:1500}),"contact returns after ending the pause");
  t.note("The fresh ux-my-listings SQL suite also covers date bounds and automatic expiry.");
}});
cases.push({id:"EASE-430",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner),page=await t.page({as:owner.email});
  for(const days of [7,30,90]){
    await t.goto(page,"/mi-cuenta/estadisticas?periodo="+days);
    t.check(await page.getByText(item.title,{exact:true}).count()>0,days+"-day statistics include the owned listing");
    t.check(await page.locator('[aria-label="Sugerencias"] a[href*="'+item.id+'/editar"]').count()<=2,"at most two tips point to the listing edit form");
  }
  await failedRpc(t,"public.get_listing_statistics(integer)",async()=>{
    await page.reload();
    t.check(await page.getByText("Las estadísticas del periodo no están disponibles en este momento. Intenta nuevamente más tarde.",{exact:true}).count()>0,"a real statistics read failure shows a notice");
  });
}});
module.exports=cases;
