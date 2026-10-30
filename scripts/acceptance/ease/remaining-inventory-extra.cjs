"use strict";
const h=require("./harness.cjs"),d=require("./d-helpers.cjs"),fs=require("node:fs"),crypto=require("node:crypto");
const L=h.literal,cases=[],INV="/mi-cuenta/tienda/inventario";
const shop=(t)=>d.inventoryStore({name:"Más pruebas "+t.tag().slice(-4)});
function approvedMethod(t,store){
  const admin=t.sql("select id from auth.users where email="+L(t.demo.admin))[0].id;
  t.exec("insert into public.store_payment_methods(store_id,method,status,holder_name,provider_label,reviewed_by,reviewed_at) values ("+L(store.id)+",'yape_plin','approved','Titular de Prueba','Yape',"+L(admin)+",now())");
}
function event(t,owner,store,item,buyer,purchase=false){
  t.exec("insert into public.marketplace_events(id,event_type,listing_id,store_id,seller_user_id,actor_user_id,session_id,source,metadata,dedupe_key) values ("+L(crypto.randomUUID())+",'whatsapp_contact',"+L(item.id)+","+L(store.id)+","+L(owner.id)+","+L(buyer.id)+","+L(crypto.randomUUID())+",'detail',"+L(JSON.stringify(purchase?{intent:"purchase"}:{}))+"::jsonb,"+L(t.tag())+")");
}
cases.push({id:"EASE-611",server:"pilot",run:async(t)=>{
  const {owner,store}=shop(t);approvedMethod(t,store);
  t.exec("insert into public.store_inventory_preferences(store_id,pickup_hours) values ("+L(store.id)+",'Lun a sáb por la tarde') on conflict(store_id) do update set pickup_hours=excluded.pickup_hours");
  const page=await t.page({as:owner.email});
  await page.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text)=>{window.__easeCopied=text;}}}));
  await t.goto(page,"/mi-cuenta/tienda/solicitudes");
  const replies=page.locator('section[aria-labelledby="respuestas-listas"]');
  const buttons=replies.getByRole("button",{name:"Copiar",exact:true});
  t.check(await buttons.count()>1,"ready replies each offer one copy button");
  const copied=[];
  for(let i=0;i<await buttons.count();i++){await buttons.nth(i).click();copied.push(await page.evaluate(()=>window.__easeCopied));}
  t.check(copied.every(text=>typeof text==="string"&&text.length>10),"every reply sends its full text to the clipboard API");
  t.check(copied.some(text=>text.includes("Yape")&&text.includes("Titular de Prueba")),"approved method and holder appear in the replies");
  t.check(copied.some(text=>text.includes("Lun a sáb por la tarde")&&text.includes("Av. Prueba 123")),"pickup reply includes the owner's location and hours");
  t.check(copied.every(text=>!/\b\d{8,}\b|https?:\/\/|www\.|wa\.me/i.test(text)),"replies contain no phone/account numbers or links");
  t.note("The clipboard API was captured in the browser; the operating-system clipboard was not changed.");
}});
cases.push({id:"EASE-619",run:async(t)=>{
  const {owner,store}=shop(t),items=Array.from({length:10},(_,i)=>d.sku(owner,{merchant_sku:"CAMP-"+i+"-"+t.tag(),product_name:"Guitarra campaña "+i,unit_price_pen:100+i*20},2));
  for(const item of items)t.sqlAs(owner.id,"select public.set_inventory_item_category("+L(item.id)+",'guitars',"+d.item(item.id).version+") as r");
  const before=items.map(item=>Number(d.item(item.id).unit_price_pen)),page=await t.page({as:owner.email});
  await t.goto(page,INV+"/precios");await page.getByLabel("SKU a cambiar",{exact:true}).selectOption("guitars");
  await page.getByRole("button",{name:"Elegir el cambio",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"Cambiar precios",exact:true});
  await sheet.getByLabel("Porcentaje (negativo para bajar)",{exact:true}).fill("-15");
  await sheet.getByRole("checkbox",{name:/Redondear a precios terminados en 9/}).check();
  await sheet.getByLabel("Nombre del cambio",{exact:false}).fill("Prueba restante");
  await sheet.getByRole("button",{name:"Revisar cambios",exact:true}).click();
  await sheet.getByRole("button",{name:"Aplicar a 10 SKU",exact:true}).waitFor();
  for(const item of items)t.check(await sheet.getByText(item.merchant_sku,{exact:true}).count()===1,"preview includes "+item.merchant_sku);
  t.check(items.every((item,i)=>Number(d.item(item.id).unit_price_pen)===before[i]),"preview writes no prices");
  await sheet.getByRole("button",{name:"Aplicar a 10 SKU",exact:true}).click();
  t.check(await d.until(()=>items.every((item,i)=>Number(d.item(item.id).unit_price_pen)<before[i]&&Number(d.item(item.id).unit_price_pen)%10===9)),"the campaign reduces every selected price and rounds to 9");
  const first=d.item(items[0].id);
  t.sqlAs(owner.id,"select public.update_inventory_item("+L(first.id)+",'{\"unit_price_pen\":777}'::jsonb,"+first.version+") as r");
  await page.getByRole("button",{name:"Volver a precios anteriores",exact:true}).click();
  t.check(await d.until(()=>items.slice(1).every((item,i)=>Number(d.item(item.id).unit_price_pen)===before[i+1])),"revert restores unchanged campaign prices");
  t.check(Number(d.item(items[0].id).unit_price_pen)===777,"revert preserves the manual price change");
  const campaign=t.sql("select id from public.store_price_campaigns where store_id="+L(store.id))[0];
  t.check(t.sqlAs(owner.id,"select public.revert_inventory_price_campaign("+L(campaign.id)+") as r")[0].r.replayed===true,"repeating a revert replays its result");
}});
cases.push({id:"EASE-620",run:async(t)=>{
  const {owner,store}=shop(t),prefix="VIEW-"+t.tag().slice(-4),listing=t.listing(owner,{storeRow:store,price:1500});
  const a=d.sku(owner,{merchant_sku:prefix+"-A",product_name:"Vista cara",listing_id:listing.id,unit_price_pen:1500},2),b=d.sku(owner,{merchant_sku:prefix+"-B",product_name:"Vista barata",unit_price_pen:500},2);
  d.sku(owner,{merchant_sku:"OTHER-"+t.tag(),product_name:"Fuera del filtro"},2);
  const page=await t.page({as:owner.email});await t.goto(page,INV+"?q="+prefix+"&orden=price_desc");
  const expected=[a.merchant_sku,b.merchant_sku];
  for(const [format,publication]of [["xlsx",false],["csv",false],["xlsx",true]]){
    const links=page.locator('a[href^="/api/store/inventory/export"]').filter({hasText:publication?"Excel con datos de la publicación":format==="xlsx"?"Excel":"CSV"});
    const hrefs=await links.evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href")));
    const href=hrefs.find(v=>v.includes("vista=")&&v.includes("format="+format)&&(publication?v.includes("publicacion=1"):!v.includes("publicacion=1")));
    if(!href)throw new Error("filtered view export link unavailable");
    const [download]=await Promise.all([page.waitForEvent("download"),page.locator('a[href="'+href+'"]').first().click()]);
    const file=await download.path();
    const rows=format==="xlsx"?d.xlsxRows(file):fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"").trim().split(/\r?\n/).map(line=>line.split(",").map(cell=>cell.replace(/^"|"$/g,"")));
    t.note("Export sample: "+JSON.stringify(rows.slice(0,4)));
    t.check(rows.length===3&&rows.slice(1).map(r=>r[0]).join("|")===expected.join("|"),format+" export preserves exactly the filtered view and order");
    if(publication)t.check(rows[0].length>10&&JSON.stringify(rows).includes(listing.title),"publication export adds the listing's public fields");
  }
}});
cases.push({id:"EASE-406",server:"pilot",run:async(t)=>{
  const {owner,store}=shop(t),buyer=t.account({kind:"buyer"}),listing=t.listing(owner,{storeRow:store});
  d.sku(owner,{merchant_sku:"TODAY-"+t.tag(),product_name:"Bajo hoy",low_stock_threshold:3,listing_id:listing.id},1);
  const soldOut=t.listing(owner,{storeRow:store});d.sku(owner,{merchant_sku:"SAVED-"+t.tag(),product_name:"Guardado sin stock",listing_id:soldOut.id},0);
  t.exec("insert into public.favorites(user_id,listing_id) values ("+L(buyer.id)+","+L(soldOut.id)+")");
  d.sku(owner,{merchant_sku:"UNLINK-"+t.tag(),product_name:"Sin publicar"},1);
  event(t,owner,store,listing,buyer,true);
  const session=t.sqlAs(owner.id,"select public.create_store_import_session('pendiente.csv','csv',100) as r")[0].r.session;
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta");
  const todo=page.locator('section[aria-labelledby="pendientes-titulo"]');
  t.check(await todo.getByRole("heading",{name:"Hoy en tu tienda",exact:true}).isVisible(),"the store home opens on Hoy en tu tienda");
  for(const [label,href]of [["Ver solicitudes","/mi-cuenta/tienda/solicitudes"],["Ver agotados",INV+"?stock=out"],["Ver stock bajo",INV+"?stock=low"],["Ver SKU",INV+"?publicacion=none"],["Retomar",INV+"/importar/"+session.id]]){
    t.check(await todo.getByRole("link",{name:label,exact:true}).getAttribute("href")===href,"the "+label+" card links to the correct view");
  }
  t.check((await todo.innerText()).includes("pendiente.csv")&&/descarta|vence|día/i.test(await todo.innerText()),"the unfinished import shows its expiry");
}});
cases.push({id:"EASE-431",server:"pilot",run:async(t)=>{
  const {owner,store}=shop(t),buyer=t.account({kind:"buyer"}),listing=t.listing(owner,{storeRow:store});
  d.sku(owner,{merchant_sku:"STAT-"+t.tag(),product_name:"Estadísticas",listing_id:listing.id},4);
  event(t,owner,store,listing,buyer);event(t,owner,store,listing,buyer,true);
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/tienda/estadisticas");
  await page.getByText("Ver los datos por semana",{exact:true}).click();
  const weekly=page.getByRole("table",{name:"Vistas y contactos por semana, últimas 12 semanas"});
  t.check(await weekly.locator("tbody tr").count()===12,"the weekly data table contains 12 weeks");
  for(const title of ["Lo más visto","Lo más consultado","Más solicitudes de compra"]){
    const section=page.locator("section").filter({has:page.getByRole("heading",{name:title,exact:true})}).last();
    t.check(await section.count()===1&&await section.locator("ol > li").count()<=5,title+" shows at most five listings");
  }
  const contacts=page.getByRole("heading",{name:"Contactos sin venta en 30 días",exact:true}).locator("..");
  t.check((await contacts.innerText()).includes(listing.title),"the 30-day unsold-contact section includes the contacted active listing");
}});
module.exports=cases;
