"use strict";
const h=require("./harness.cjs"),d=require("./d-helpers.cjs"),x=require("./remaining-import-helpers.cjs");
const L=h.literal,cases=[];
cases.push({id:"EASE-500",liveAccounts:false,run:async(t)=>{
  const f=await x.roundTrip(t),opened=await x.upload(t,f.owner,f.csv,f.page);await x.review(t,opened,"both");
  t.check(x.session(t,opened.id).options.stale_stock==="keep","a re-import keeps today's stock by default");
  t.check(await opened.page.getByRole("button",{name:"Usar el stock del archivo",exact:true}).count()===1,"the review exposes the later movements explicitly");
  x.commit(t,opened);
  const after=d.item(f.item.id);
  t.check(Number(after.quantity_available)===7&&Number(after.unit_price_pen)===150,"re-importing a real export changes the price while keeping sales made after the export");
  t.check(t.sql("select id from public.store_stock_movements where item_id="+L(f.item.id)+" and movement_type='stock_count'").length===0,"the protected SKU receives no stock reconciliation");
}});
cases.push({id:"EASE-501",liveAccounts:false,run:async(t)=>{
  for(const scope of ["prices","stock","both"]){
    const {owner}=d.inventoryStore(),item=d.sku(owner,{merchant_sku:"SCOPE-"+t.tag(),product_name:"Alcance de importación",unit_price_pen:100},5);
    const opened=await x.upload(t,owner,"SKU,Nombre,Stock,Precio\n"+item.merchant_sku+",Alcance de importación,20,200\n");
    const radios=opened.page.locator('input[type="radio"][value="prices"],input[type="radio"][value="stock"],input[type="radio"][value="both"]');
    t.check(await radios.count()===3,"stock and price columns ask for an update scope");
    t.check(await opened.page.locator('input[type="radio"]:checked').count()===0,"no update scope is preselected");
    await x.review(t,opened,scope);x.commit(t,opened);
    const after=d.item(item.id);
    t.check(Number(after.quantity_available)===(scope==="prices"?5:20)&&Number(after.unit_price_pen)===(scope==="stock"?100:200),scope+" changes only its permitted fields");
  }
  for(const [header,value]of [["Precio","200"],["Stock","20"]]){
    const {owner}=d.inventoryStore(),item=d.sku(owner,{merchant_sku:"ONE-"+t.tag(),product_name:"Una columna",unit_price_pen:100},5);
    const opened=await x.upload(t,owner,"SKU,"+header+"\n"+item.merchant_sku+","+value+"\n");
    t.check(await opened.page.getByText("¿Qué actualiza este archivo en los SKU que ya tienes?",{exact:true}).count()===0,"a "+header+"-only file needs no scope answer");
  }
}});
cases.push({id:"EASE-502",liveAccounts:false,run:async(t)=>{
  const f=await x.roundTrip(t),opened=await x.upload(t,f.owner,f.csv,f.page);await x.review(t,opened);
  await opened.page.getByRole("button",{name:"Usar el stock del archivo",exact:true}).click();
  await opened.page.getByRole("button",{name:"Mantener el stock de hoy",exact:true}).waitFor();
  t.check(x.session(t,opened.id).options.stale_stock==="apply","the owner explicitly chooses file stock after a newer sale");
  const rows=t.sql("select issues,changes from public.store_import_rows where session_id="+L(opened.id));
  t.check(rows.every(r=>Number(r.changes?.quantity_on_hand?.to)===10),"the review recalculates the row to the file's stock");
  t.check(await opened.page.getByText(/reemplaza|sustituye|movimientos posteriores|stock del archivo/i).count()>0,"the review warns about replacing stock after later movements");
  await t.shot(opened.page,"file-stock-override");
  await opened.page.getByRole("button",{name:"Mantener el stock de hoy",exact:true}).click();
  await opened.page.getByRole("button",{name:"Usar el stock del archivo",exact:true}).waitFor();
  t.check(x.session(t,opened.id).options.stale_stock==="keep"&&Number(d.item(f.item.id).quantity_available)===7,"the owner can return to keeping today's stock without any write");
}});
cases.push({id:"EASE-506",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"store_owner"}),store=t.store(owner,{plan:"growth_50"});
  t.listing(owner,{storeRow:store});t.listing(owner,{storeRow:store,status:"pending"});
  const page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/tienda");
  t.check(await page.getByText("Cupo de publicaciones",{exact:true}).count()>0,"Mi tienda calls the allowance Cupo de publicaciones");
  const text=await page.locator("main").innerText();
  t.check(/2\s*(de|\/)\s*50/.test(text),"the allowance meter counts published and pending listings");
  for(let i=0;i<48;i++)t.listing(owner,{storeRow:store,status:"pending"});
  await t.goto(page,"/mi-cuenta/tienda/publicar");
  t.check(await page.getByText(/Usaste todo tu cupo de publicaciones/).count()>0,"the full allowance uses the same cupo name");
  t.check(await page.getByRole("link",{name:"Mi tienda",exact:true}).count()>0,"the limit notice points to Mi tienda");
}});
cases.push({id:"EASE-511",liveAccounts:false,timeout:300000,run:async(t)=>{
  const {owner}=d.inventoryStore(),rows=[];
  for(let i=0;i<90;i++)rows.push("EXC-"+i+",Instrumento "+i+",1,100,"+(i<60?"Guitarras":"Pedales"));
  const opened=await x.upload(t,owner,"SKU,Nombre,Stock,Precio,Categoría\n"+rows.join("\n")+"\n");await x.review(t,opened);
  await opened.page.getByRole("button",{name:/^Nuevos SKU/}).click();
  await opened.page.getByRole("button",{name:"Guitarras (60)",exact:true}).click();
  await opened.page.getByRole("button",{name:"Excluir todas estas filas",exact:true}).click();
  const dialog=opened.page.getByRole("alertdialog");await dialog.waitFor();
  t.check((await dialog.innerText()).includes("60 filas"),"the confirmation names all 60 matching rows beyond the loaded page");
  await dialog.getByRole("button",{name:"Excluir",exact:true}).click();
  t.check(await d.until(()=>t.sql("select count(*)::int as n from public.store_import_rows where session_id="+L(opened.id)+" and owner_decision='exclude'")[0].n===60,{timeout:30000}),"all 60 guitar rows are excluded");
  t.check(t.sql("select count(*)::int as n from public.store_import_rows where session_id="+L(opened.id)+" and owner_decision='include'")[0].n===30,"the other category remains included");
}});
module.exports=cases;
