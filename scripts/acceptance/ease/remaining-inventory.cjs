"use strict";
const h=require("./harness.cjs"),d=require("./d-helpers.cjs"),crypto=require("node:crypto"),fs=require("node:fs");
const L=h.literal,cases=[],INV="/mi-cuenta/tienda/inventario";
function shop(t){return d.inventoryStore({name:"Restante Música "+t.tag().slice(-5)});}
function request(t,owner,store,item,buyer=null){
  const id=crypto.randomUUID();
  t.exec("insert into public.marketplace_events(id,event_type,listing_id,store_id,seller_user_id,actor_user_id,source,metadata,dedupe_key) values ("+L(id)+",'whatsapp_contact',"+L(item.id)+","+L(store.id)+","+L(owner.id)+","+L(buyer?.id)+",'detail',"+L(JSON.stringify({intent:"purchase"}))+"::jsonb,"+L(t.tag())+")");
  return id;
}
const stock=(item)=>Number(d.item(item.id).quantity_available);
async function scan(page,code){const input=page.getByLabel("Código, SKU o nombre",{exact:true});await input.fill(code);await input.press("Enter");await page.waitForTimeout(120);}
cases.push({id:"EASE-608",server:"pilot",run:async(t)=>{
  const {owner,store}=shop(t),buyer=t.account({kind:"particular",name:"Comprador de solicitudes"});
  const item=t.listing(owner,{storeRow:store}),sku=d.sku(owner,{merchant_sku:"REQ-"+t.tag(),product_name:"Producto solicitado",listing_id:item.id},8);
  request(t,owner,store,item,buyer);request(t,owner,store,item);request(t,owner,store,item);
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/tienda/solicitudes");
  const section=page.locator('section[aria-labelledby="solicitudes-lista"]');
  t.check(await section.getByText(buyer.name,{exact:false}).count()>0,"signed-in purchase requests name the buyer");
  t.check(await section.getByText("Visitante sin cuenta",{exact:true}).count()===2,"anonymous purchase requests are labelled Visitante sin cuenta");
  t.check(await section.getByText("SKU "+sku.merchant_sku,{exact:false}).count()===3,"requests include their SKU");
  t.check((await section.innerText()).includes(item.title),"requests include the listing title");
  t.check(await section.getByRole("heading",{name:"Por atender (3)",exact:true}).isVisible(),"the waiting count is three");
  t.check((await page.getByRole("link",{name:/^Solicitudes/}).first().innerText()).includes("3"),"the account menu shows the waiting count");
}});
cases.push({id:"EASE-609",server:"pilot",run:async(t)=>{
  const {owner,store}=shop(t),item=t.listing(owner,{storeRow:store}),sku=d.sku(owner,{merchant_sku:"SALE-"+t.tag(),product_name:"Venta solicitada",listing_id:item.id},5);
  request(t,owner,store,item,t.account({kind:"buyer"}));
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/tienda/solicitudes");
  await page.getByRole("button",{name:"Vendido",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"Registrar la venta",exact:true});
  await sheet.getByLabel("Unidades vendidas",{exact:true}).fill("1");
  t.check(stock(sku)===5,"opening the confirmation does not change stock");
  await sheet.getByRole("button",{name:"Registrar venta",exact:true}).click();
  t.check(await d.until(()=>stock(sku)===4),"one confirmed unit is deducted");
  t.check(t.sql("select channel from public.store_stock_movements where item_id="+L(sku.id)+" and movement_type='sale'")[0]?.channel==="whatsapp_laria","the sale channel is WhatsApp / Laria");
  await page.getByText("No hay solicitudes aquí.",{exact:false}).waitFor();
  t.check(await page.getByRole("button",{name:"Deshacer",exact:true}).isVisible().catch(()=>false),"Undo remains available when selling the last waiting request empties the list");
  await t.shot(page,"empty-waiting-undo");
  const marked=t.sql("select status from public.store_purchase_request_marks where event_id in (select id from public.marketplace_events where listing_id="+L(item.id)+")");
  t.check(marked.some(row=>row.status==="sold"),"the request is marked Vendida");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  t.check(await d.until(()=>stock(sku)===5),"Undo restores the sold unit");
  t.check(await d.until(()=>t.sqlAs(owner.id,"select public.get_store_purchase_request_count() as n")[0].n===1),"Undo returns the request to waiting");
}});
cases.push({id:"EASE-614",run:async(t)=>{
  const {owner}=shop(t),a=d.sku(owner,{merchant_sku:"REST-A-"+t.tag(),product_name:"Sugerencia seis",low_stock_threshold:3},10),b=d.sku(owner,{merchant_sku:"REST-B-"+t.tag(),product_name:"Sugerencia tres",low_stock_threshold:2},3);
  d.move(owner,a.id,"sale",8,"tienda_fisica");d.move(owner,b.id,"sale",3,"tienda_fisica");
  const correction=d.move(owner,a.id,"sale",1,"tienda_fisica");
  t.sqlAs(owner.id,"select public.undo_stock_movements(array["+L(correction.movement.id)+"]::uuid[],"+L(t.tag())+") as r");
  const rows=t.sqlAs(owner.id,"select public.get_reorder_list() as rows")[0].rows.items;
  const ra=rows.find(r=>r.id===a.id),rb=rows.find(r=>r.id===b.id);
  t.check(Number(ra.sales_30d)===8&&Number(ra.suggested)===6,"the suggested quantity uses corrected 30-day sales and available stock");
  t.check(Number(rb.suggested)===3,"a sold-out SKU is suggested at least one unit");
  const page=await t.page({as:owner.email});await t.goto(page,INV+"/reponer");
  t.check((await page.locator("main").innerText()).includes(a.merchant_sku),"the reorder page shows the low-stock SKU");
  for(const [label,kind]of [["Descargar Excel","xlsx"],["Descargar CSV","csv"]]){
    const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("link",{name:label,exact:true}).click()]);
    const file=await download.path(),rows=kind==="xlsx"?d.xlsxRows(file):fs.readFileSync(file,"utf8").trim().split(/\r?\n/);
    t.check(rows.length===3,label+" contains the header and both reorder rows");
  }
}});
cases.push({id:"EASE-615",run:async(t)=>{
  const {owner}=shop(t),codes=["OKA","OKB","DUP","FORM","TEXT","ARCH"].map(x=>x+"-"+t.tag().slice(-4));
  const items=codes.map(code=>d.sku(owner,{merchant_sku:code,product_name:code,low_stock_threshold:3},1));
  t.sqlAs(owner.id,"select public.archive_inventory_item("+L(items[5].id)+","+L('Prueba archivado')+") as r");
  const csv="SKU,Cantidad recibida\n"+codes[0]+",2\n"+codes[1]+",3\n"+codes[2]+",1\n"+codes[2]+",2\n"+codes[3]+",=1+1\n"+codes[4]+",muchas\n"+codes[5]+",2\nDESCONOCIDO,9\n";
  const page=await t.page({as:owner.email});await t.goto(page,INV+"/reponer");
  await page.locator('input[type="file"]').setInputFiles({name:"recibido.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
  await page.getByRole("button",{name:"Revisar archivo",exact:true}).click();
  await page.getByRole("button",{name:/^Sumar /}).waitFor();
  t.check(stock(items[0])===1&&stock(items[1])===1,"the preview changes no stock");
  const text=await page.locator("main").innerText();
  t.check(["DESCONOCIDO",codes[2],codes[3],codes[4],codes[5]].every(code=>text.includes(code)),"unknown, duplicate, formula, nonnumeric and archived rows are identified");
  await page.getByRole("button",{name:/^Sumar /}).click();
  t.check(await d.until(()=>stock(items[0])===3&&stock(items[1])===4),"valid rows are added as one batch");
  t.check(stock(items[2])===2&&stock(items[3])===1&&stock(items[4])===1,"later duplicate rows, formulas and nonnumeric quantities are skipped");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  t.check(await d.until(()=>stock(items[0])===1&&stock(items[1])===1),"Undo restores both valid rows");
}});
cases.push({id:"EASE-616",run:async(t)=>{
  const {owner,store}=shop(t),high=t.listing(owner,{storeRow:store,title:"Interés mayor "+t.tag()}),low=t.listing(owner,{storeRow:store,title:"Interés menor "+t.tag()});
  const a=d.sku(owner,{merchant_sku:"HIGH-"+t.tag(),product_name:"Más interés",listing_id:high.id},0);d.sku(owner,{merchant_sku:"LOW-"+t.tag(),product_name:"Menos interés",listing_id:low.id},0);
  for(let i=0;i<3;i++){const buyer=t.account({kind:"buyer"});t.exec("insert into public.favorites(user_id,listing_id) values ("+L(buyer.id)+","+L(high.id)+")");}
  t.exec("insert into public.favorites(user_id,listing_id) values ("+L(t.account({kind:"buyer"}).id)+","+L(low.id)+")");
  t.sqlAs(owner.id,"select jsonb_agg(public.create_inventory_item(jsonb_build_object('merchant_sku','FILL-'||n||'-"+t.tag()+"','product_name','Relleno '||n),1,'"+t.tag()+"-'||n)) as rows from generate_series(1,51) n");
  const page=await t.page({as:owner.email});await t.goto(page,INV);
  const section=page.locator('section[aria-labelledby="agotados-con-interes"]');
  const titles=await section.locator("li a").allInnerTexts();
  t.check(titles[0]===high.title&&titles[1]===low.title,"sold-out interest ranks the more-favorited listing first");
  t.check((await section.innerText()).includes("3 en favoritos"),"the section reports aggregate interest");
  await t.goto(page,INV+"?q="+a.merchant_sku);
  t.check(await page.getByRole("heading",{name:"Agotados con interés",exact:true}).count()===0,"the section is absent in a filtered view");
  await t.goto(page,INV);await page.getByRole("link",{name:/^Siguiente/}).click();await page.waitForURL(u=>u.searchParams.has("despues"));
  t.check(await page.getByRole("heading",{name:"Agotados con interés",exact:true}).count()===0,"the section is absent after the first page");
}});
cases.push({id:"EASE-625",server:"pilot",run:async(t)=>{
  const {owner,store}=shop(t),page=await t.page();
  const admin=t.sql("select id from auth.users where email="+L(t.demo.admin))[0].id;
  t.exec("insert into public.store_payment_methods(store_id,method,status,reviewed_by,reviewed_at) values ("+L(store.id)+",'efectivo_al_recoger','approved',"+L(admin)+",now())");
  for(const amount of [16,3]){
    const item=t.listing(owner,{storeRow:store,price:500}),sku=d.sku(owner,{merchant_sku:"QTY-"+t.tag(),product_name:"Cantidad de compra",listing_id:item.id},amount);
    await t.goto(page,item.path);
    const group=page.getByRole("group",{name:"Cantidad",exact:true}),plus=group.getByRole("button",{name:"Una unidad más",exact:true});
    for(let i=1;i<Math.min(amount,10);i++)await plus.click();
    t.check(await plus.isDisabled(),"the stepper stops at "+Math.min(amount,10)+" units");
    const link=page.getByRole("link",{name:"Solicitar compra",exact:true}).first(),href=await link.getAttribute("href");
    t.check(new URL(href).searchParams.get("text").includes("Cantidad: "+Math.min(amount,10)),"the WhatsApp message includes the chosen quantity");
    t.check(!new RegExp("(stock|disponibles|quedan).{0,20}\\b"+amount+"\\b","i").test(await page.locator("main").innerText()),"the page does not reveal the available stock count");
    const popupPromise=page.waitForEvent("popup");await link.click();await page.waitForTimeout(100);
    if(await page.getByRole("link",{name:"Continuar con la solicitud",exact:true}).isVisible().catch(()=>false))await page.getByRole("link",{name:"Continuar con la solicitud",exact:true}).click();
    const popup=await popupPromise;await popup.close();
    t.check(stock(sku)===amount,"requesting purchase never reserves or deducts stock");
  }
}});
cases.push({id:"EASE-626",run:async(t)=>{
  const {owner,store}=shop(t),a=d.sku(owner,{merchant_sku:"POSA-"+t.tag(),product_name:"Código A",external_reference:"EASE-A-"+t.tag()},2),b=d.sku(owner,{merchant_sku:"POSB-"+t.tag(),product_name:"Código B",external_reference:"EASE-B-"+t.tag()},3);
  const page=await t.page({as:owner.email});await t.goto(page,INV+"/mostrador");
  const input=page.getByLabel("Código, SKU o nombre",{exact:true});await input.waitFor();await d.until(()=>input.isEnabled());
  await scan(page,a.merchant_sku);await scan(page,a.merchant_sku);await scan(page,a.merchant_sku);await scan(page,b.merchant_sku);
  t.check(await page.getByRole("button",{name:"Agregar una unidad de "+a.merchant_sku,exact:true}).isDisabled(),"the counter never adds beyond available stock");
  await page.getByRole("button",{name:/^Registrar venta \(/}).click();
  t.check(await d.until(()=>stock(a)===0&&stock(b)===2),"one counter sale deducts both SKU quantities");
  t.check(t.sql("select id from public.store_stock_movements where store_id="+L(store.id)+" and movement_type='sale'").length===2,"one sale movement is recorded per SKU");
  await page.getByRole("button",{name:"Deshacer",exact:true}).click();
  t.check(await d.until(()=>stock(a)===2&&stock(b)===3),"Undo restores the complete counter sale");
  t.note("Codes were typed as keyboard/scanner input; physical camera and USB hardware were not used.");
}});
cases.push({id:"EASE-627",run:async(t)=>{
  const {owner}=shop(t),item=d.sku(owner,{merchant_sku:"OFF-"+t.tag(),product_name:"Venta sin conexión"},2),page=await t.page({as:owner.email});
  await t.goto(page,INV+"/mostrador");const input=page.getByLabel("Código, SKU o nombre",{exact:true});await d.until(()=>input.isEnabled());
  await page.context().setOffline(true);await scan(page,item.merchant_sku);
  await page.getByRole("button",{name:/^Registrar venta \(/}).click();
  t.check(stock(item)===2,"an offline sale waits without changing server stock");
  t.check(await d.until(()=>page.getByText(/espera.*conexión|esperando conexión/i).count().then(n=>n>0)),"the queued sale is visible");
  await page.context().setOffline(false);
  t.check(await d.until(()=>stock(item)===1,{timeout:20000}),"reconnection records the waiting sale");
  await page.evaluate(()=>window.dispatchEvent(new Event("online")));await page.waitForTimeout(700);
  t.check(stock(item)===1,"a repeated reconnect does not record the sale twice");
  const queuedSales=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("laria:mostrador:cola:")).flatMap(k=>{try{return JSON.parse(localStorage.getItem(k))||[];}catch{return [];}}));
  const previousKeys=new Set((await queuedSales()).map(sale=>sale.key));
  await page.context().setOffline(true);await scan(page,item.merchant_sku);await page.getByRole("button",{name:/^Registrar venta \(/}).click();
  // A routed browser request can still be rejecting after click returns. Establish the queued-sale precondition
  // before reconnecting; the separate local fault-injection regression deliberately exercises the reverse order.
  if(!t.offlineRejectionAfterReconnect){
    const stored=await d.until(()=>queuedSales().then(rows=>rows.some(sale=>!previousKeys.has(sale.key)&&sale.lines?.some(line=>line.item_id===item.id))),{timeout:20000});
    t.check(stored,"the second offline sale is persisted before reconnecting");
    if(!stored)return;
  }
  d.move(owner,item.id,"sale",1,"tienda_fisica");
  await page.context().setOffline(false);await page.waitForTimeout(1800);
  const queue=await d.until(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes("mostrador")).map(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}).filter(Array.isArray).flat().filter(v=>v&&v.lines)).then(rows=>rows.some(v=>v.error)?rows:null),{timeout:20000});
  t.check(queue&&queue.some(v=>v.error),"a refused queued sale stays with its reason");
  const refused=page.getByRole("alert").filter({hasText:"No se pudo registrar una venta guardada sin conexión"});
  await refused.waitFor();t.check((await refused.innerText()).includes(item.merchant_sku),"the refusal identifies the SKU on screen");
  await page.reload();await refused.waitFor();
  t.check(true,"the refused sale and reason survive reloading the device queue");
  t.check(stock(item)===0,"a refused queued sale does not create negative or duplicate stock");
}});
module.exports=cases;
