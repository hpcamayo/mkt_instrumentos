"use strict";
const h=require("./harness.cjs"),{until}=require("./d-helpers.cjs");
const L=h.literal,cases=[],BASE="/mi-cuenta/publicaciones";
const row=(page,title)=>page.locator("tbody tr").filter({hasText:title}).first();
const state=(t,id)=>t.sql("select * from public.listings where id="+L(id))[0];
function contact(t,item,buyer){
  const seller=state(t,item.id).owner_user_id;
  t.exec("insert into public.marketplace_events(event_type,created_at,listing_id,seller_user_id,actor_user_id,source,metadata,dedupe_key) values ('whatsapp_contact',now()-interval '5 days',"+L(item.id)+","+L(seller)+","+L(buyer.id)+",'detail','{}',"+L(t.tag())+")");
}
function verified(t){
  const owner=t.account({kind:"particular"}),buyer=t.account({kind:"particular"}),item=t.listing(owner);
  contact(t,item,buyer);t.sqlAs(buyer.id,"select public.answer_purchase_checkin("+L(item.id)+",true) as r");
  const check=t.sql("select id from public.purchase_checkins where listing_id="+L(item.id))[0];
  const result=t.sqlAs(owner.id,"select public.decide_purchase_checkin("+L(check.id)+",true) as r")[0].r;
  return{owner,buyer,item,result};
}
cases.push({id:"EASE-414",run:async(t)=>{
  for(const status of ["rejected","draft"]){
    const owner=t.account({kind:"particular"}),item=t.listing(owner,{status}),page=await t.page({as:owner.email});
    await t.goto(page,BASE+"/"+item.id+"/editar");
    const send=page.getByRole("button",{name:"Guardar y enviar a revisión",exact:true});
    t.check(await send.count()===1,status+" has one save-and-send button");
    await send.click();
    t.check(await until(()=>state(t,item.id).status==="pending"),status+" sends for review even with unchanged fields");
  }
  const owner=t.account({kind:"store_owner"}),store=t.store(owner,{verified:true}),item=t.listing(owner,{storeRow:store,status:"draft"}),page=await t.page({as:owner.email});
  await t.goto(page,BASE+"/"+item.id+"/editar");
  await page.getByRole("button",{name:"Guardar y publicar",exact:true}).click();
  t.check(await until(()=>state(t,item.id).status==="approved"),"a verified store's save-and-publish button publishes the draft");
}});
cases.push({id:"EASE-418",liveAccounts:false,run:async(t)=>{
  const item=t.listing(t.account({kind:"particular"}),{status:"pending"}),page=await t.page({as:t.demo.admin});
  t.exec("update public.listings set created_at=now()-interval '365 days' where id="+L(item.id));
  await t.goto(page,"/admin?cola=publicaciones");
  await page.locator('[data-queue-item-id="'+item.id+'"]').click();
  const detail=page.locator("#moderation-detail");
  await detail.locator('footer[aria-label="Decisiones del pendiente"]').scrollIntoViewIfNeeded();
  await detail.getByRole("button",{name:/^Rechazar:/}).click();
  const form=detail.locator("form").filter({has:page.getByText("Motivos del rechazo",{exact:true})});
  t.check(await form.getByRole("checkbox").count()===10&&await form.getByRole("checkbox",{checked:true}).count()===0,"the listing rejection offers ten unselected reasons");
  await form.getByRole("button",{name:"Confirmar: Rechazar",exact:true}).click();
  t.check(await form.getByRole("alert").count()>0&&state(t,item.id).status==="pending","without a reason or note the rejection cannot be sent");
  await form.getByRole("checkbox").nth(0).check();await form.getByRole("checkbox").nth(1).check();
  await form.getByRole("button",{name:"Confirmar: Rechazar",exact:true}).click();
  t.check(await until(()=>state(t,item.id).status==="rejected"),"a selected reason permits rejection without a note");
  const owner=t.account({kind:"particular"}),published=t.listing(owner);
  t.sqlAs(owner.id,"select public.update_owned_listing("+L(published.id)+",'{}'::jsonb,'{\"title\":\"Título revisado EASE\"}'::jsonb) as r");
  const revision=t.sql("select id from public.listing_revisions where listing_id="+L(published.id)+" order by created_at desc limit 1")[0];
  await t.goto(page,"/admin?cola=revisiones");await page.locator('[data-queue-item-id="'+revision.id+'"]').click();
  await detail.locator('footer[aria-label="Decisiones del pendiente"]').scrollIntoViewIfNeeded();
  await detail.getByRole("button",{name:/^Rechazar cambios:/}).click();
  const revisionForm=detail.locator("form").filter({has:page.getByText("Motivos del rechazo",{exact:true})});
  t.check(await revisionForm.getByRole("checkbox").count()===10&&await revisionForm.getByRole("checkbox",{checked:true}).count()===0,"revision rejection also offers ten unselected reasons");
  await revisionForm.getByRole("checkbox").first().check();await revisionForm.getByRole("button",{name:"Confirmar: Rechazar cambios",exact:true}).click();
  t.check(await until(()=>t.sql("select status from public.listing_revisions where id="+L(revision.id))[0].status==="rejected"),"revision can be rejected by reason without a note");
}});
cases.push({id:"EASE-419",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),items=[];
  for(let i=0;i<60;i++)items.push(t.listing(owner,{title:"Serie restante "+String(i).padStart(2,"0"),photos:2,status:i===59?"draft":"approved"}));
  const page=await t.page({as:owner.email});await t.goto(page,BASE);
  t.check(await page.locator("tbody tr").count()===50,"the owner's list is paged at 50");
  t.check(await page.locator("tbody img").count()===50,"each listed row has its photo");
  t.check((await page.getByRole("navigation",{name:"Publicaciones por estado"}).innerText()).includes("Todas · 60"),"status tabs give counts");
  await page.getByRole("link",{name:"Siguiente",exact:true}).click();
  await page.waitForURL(/pagina=2/);
  t.check(await page.locator("tbody tr").count()===10,"page two contains the remaining ten rows");
  await page.getByLabel("Buscar por título").fill("Serie restante 01");await page.getByRole("search",{name:"Buscar en mis publicaciones"}).getByRole("button",{name:"Buscar",exact:true}).click();
  t.check(await page.locator("tbody tr").count()===1,"title search filters the list");
  const buyer=t.account({kind:"buyer"});
  t.exec("update public.listings set view_count=3 where id="+L(items[0].id));
  for(let i=0;i<3;i++)t.exec("insert into public.marketplace_events(event_type,listing_id,seller_user_id,session_id,source,metadata,dedupe_key) values ('listing_view',"+L(items[0].id)+","+L(owner.id)+","+L(require("node:crypto").randomUUID())+",'detail','{}',"+L(t.tag())+")");
  for(let i=0;i<2;i++)contact(t,items[1],buyer);
  await page.getByLabel("Buscar por título").fill("");
  for(const order of ["vistas","contactos"]){
    await page.getByLabel("Ordenar por").selectOption(order);await page.getByRole("search",{name:"Buscar en mis publicaciones"}).getByRole("button",{name:"Buscar",exact:true}).click();
    await page.waitForURL(url=>url.searchParams.get("orden")===order);
    const expected=order==="vistas"?items[0]:items[1];
    t.check((await page.locator("tbody tr").first().innerText()).includes(expected.title),"the "+order+" sort puts the listing with the most actual events first");
  }
}});
cases.push({id:"EASE-420",run:async(t)=>{
  const owner=t.account({kind:"particular"}),items=Array.from({length:3},()=>t.listing(owner)),page=await t.page({as:owner.email});
  await t.goto(page,BASE);
  await row(page,items[0].title).getByRole("button",{name:"Cambiar precio de "+items[0].title,exact:true}).click();
  await row(page,items[0].title).getByLabel("Nuevo precio",{exact:true}).fill("1250");
  await row(page,items[0].title).getByRole("button",{name:"Guardar",exact:true}).click();
  t.check(await until(()=>Number(state(t,items[0].id).price_pen)===1250),"inline price editing persists");
  for(const item of items)await row(page,item.title).getByRole("checkbox").check();
  await page.getByRole("button",{name:"Ocultar seleccionadas",exact:true}).click();
  t.check(await until(()=>items.every(item=>state(t,item.id).status==="hidden")),"all three selected listings hide in one action");
  t.check(await page.getByText(/(ocult.*3|3.*ocult)/i).count()>0,"the result reports the changed count");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  t.check(await until(()=>items.every(item=>state(t,item.id).status==="approved")),"Undo restores the selected listings");
}});
cases.push({id:"EASE-421",run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner),page=await t.page({as:owner.email});
  await t.goto(page,BASE);await row(page,item.title).getByRole("button",{name:"Ocultar",exact:true}).click();
  t.check(await until(()=>state(t,item.id).status==="hidden"),"hide applies immediately");
  t.check(await page.getByRole("alertdialog").count()===0,"hide uses Undo instead of a confirmation");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  t.check(await until(()=>state(t,item.id).status==="approved"),"Undo restores the listing");
  await row(page,item.title).getByRole("button",{name:"Marcar vendida",exact:true}).click();
  t.check(await page.getByRole("alertdialog").count()===1,"marking sold keeps its confirmation");
  await page.getByRole("alertdialog").getByRole("button",{name:"Cancelar",exact:true}).click();
  t.check(state(t,item.id).status==="approved","cancelling sold leaves the listing active");
}});
cases.push({id:"EASE-423",run:async(t)=>{
  const owner=t.account({kind:"particular"}),approved=t.listing(owner),sold=t.listing(owner,{status:"sold"}),page=await t.page({as:owner.email});
  for(const [item,label]of [[approved,"Duplicar"],[sold,"Republicar"]]){
    const before=JSON.stringify(state(t,item.id));await t.goto(page,BASE);
    await row(page,item.title).getByRole("button",{name:label,exact:true}).click();await page.waitForURL(/\/publicaciones\/[a-f0-9-]+\/editar/);
    const id=/\/publicaciones\/([a-f0-9-]+)\/editar/.exec(new URL(page.url()).pathname)[1],copy=state(t,id);
    t.check(id!==item.id&&copy.status==="draft",label+" opens a new draft identity");
    t.check(copy.title===item.title&&copy.brand===state(t,item.id).brand&&Number(copy.price_pen)===item.price,label+" copies the text and price");
    t.check(t.sql("select id from public.listing_photos where listing_id="+L(id)).length===2,label+" copies both photos");
    t.check(JSON.stringify(state(t,item.id))===before,label+" preserves the original");
  }
}});
cases.push({id:"EASE-426",run:async(t)=>{
  const owner=t.account({kind:"particular"}),buyer=t.account({kind:"particular",name:"Persona Compradora Uno",phone:"51987654321"}),other=t.account({kind:"particular",name:"Persona Compradora Dos",phone:"51987654654"}),item=t.listing(owner);
  contact(t,item,buyer);contact(t,item,other);t.sqlAs(buyer.id,"select public.answer_purchase_checkin("+L(item.id)+",true) as r");
  t.sqlAs(owner.id,"select public.set_owned_listing_lifecycle("+L(item.id)+",'sold') as r");
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/transacciones/"+item.id);
  const choices=page.getByRole("group",{name:"¿Quién te lo compró?"});
  t.check(await choices.getByRole("radio").count()===2&&await choices.getByRole("radio",{checked:true}).count()===0,"both recognizable buyers are offered with no preselection");
  const text=await choices.innerText();
  t.check(text.includes(buyer.name)&&text.includes(other.name)&&text.includes("321")&&text.includes("654"),"buyer cards show names and only the last three WhatsApp digits");
  t.check(text.includes("Dice que te lo compró")&&/Te escribió el/.test(text),"cards show contact date and the buyer report");
}});
cases.push({id:"EASE-427",run:async(t)=>{
  const f=verified(t),page=await t.page({as:f.buyer.email});await t.goto(page,"/mi-cuenta/transacciones/"+f.result.transaction_id);
  const stars=page.getByRole("group",{name:"Calificación"});
  t.check(await stars.getByRole("radio").count()===5&&await stars.getByRole("radio",{checked:true}).count()===0,"five labelled stars have no default rating");
  const first=stars.getByRole("radio",{name:"1 estrella",exact:true});await first.focus();await first.press("Space");await first.press("ArrowRight");
  t.check(await stars.getByRole("radio",{name:"2 estrellas",exact:true}).isChecked(),"keyboard arrows select the next radio star");
  const comment=page.getByLabel("Comentario",{exact:false});
  t.check(await comment.count()===1,"the comment field sits below the rating");
  const starBottom=await stars.evaluate(el=>el.getBoundingClientRect().bottom),commentTop=await comment.evaluate(el=>el.getBoundingClientRect().top);
  t.check(commentTop>=starBottom,"the comment follows the rating visually");
}});
cases.push({id:"EASE-428",run:async(t)=>{
  const owner=t.account({kind:"particular"}),buyer=t.account({kind:"particular"}),item=t.listing(owner);
  contact(t,item,buyer);t.sqlAs(owner.id,"select public.set_owned_listing_lifecycle("+L(item.id)+",'sold') as r");
  const claim=t.sqlAs(owner.id,"select public.create_transaction_claim("+L(item.id)+","+L(buyer.id)+") as r")[0].r;
  const claimId=typeof claim==="string"?claim:claim.id||claim.claim_id;
  const page=await t.page({as:buyer.email});await t.goto(page,"/mi-cuenta/transacciones/"+claimId);
  await page.getByRole("button",{name:"Sí, lo compré",exact:true}).click();
  await page.getByText("Que lo disfrutes",{exact:true}).waitFor();
  t.check(await page.getByRole("radio",{name:"1 estrella",exact:true}).count()===1,"the warm closing panel leads directly into the review");
  const seller=await t.page({as:owner.email});
  const tx=t.sql("select id from public.verified_transactions where listing_id="+L(item.id))[0];
  await t.goto(seller,"/mi-cuenta/transacciones/"+tx.id);
  t.check(await seller.getByText("Tu primera venta verificada en Laria",{exact:true}).isVisible(),"the first verified sale shows the seller milestone");
  await seller.reload();
  t.check(await seller.getByText("Tu primera venta verificada en Laria",{exact:true}).count()===0,"the milestone appears only once");
}});
module.exports=cases;
