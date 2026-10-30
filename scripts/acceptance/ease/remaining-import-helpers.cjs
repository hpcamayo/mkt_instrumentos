"use strict";
const d=require("./d-helpers.cjs"),h=require("./harness.cjs"),fs=require("node:fs");
const L=h.literal,INV="/mi-cuenta/tienda/inventario";
const session=(t,id)=>t.sql("select * from public.store_import_sessions where id="+L(id))[0];
async function upload(t,owner,csv,page=null){
  if(t.live)t.skip("import writes run only on the isolated local stack");
  page=page||await t.page({as:owner.email});
  await t.goto(page,INV+"/importar");
  await page.getByLabel("Archivo de inventario",{exact:true}).setInputFiles({name:"ease-restantes.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
  await page.getByRole("button",{name:"Subir y revisar",exact:true}).click();
  await page.waitForURL(/\/importar\/[a-f0-9-]+/);
  const id=new URL(page.url()).pathname.split("/").pop();
  await page.getByRole("heading",{name:"¿Qué dato tiene cada columna?",exact:true}).waitFor({timeout:60000});
  return{page,id,owner};
}
async function review(t,opened,scope="both"){
  const {page,id}=opened;
  const radios=page.locator('input[type="radio"][value="'+scope+'"]');
  if(await radios.count())await radios.check();
  await page.getByRole("button",{name:"Revisar filas",exact:true}).click();
  await page.getByRole("heading",{name:"Revisa los cambios",exact:true}).waitFor({timeout:60000});
  if(!await d.until(()=>session(t,id).status==="ready",{timeout:60000}))throw new Error("the import did not become ready");
  return opened;
}
function commit(t,opened){
  const {owner,id}=opened,v=session(t,id).version;
  t.sqlAs(owner.id,"select public.start_store_import_commit("+L(id)+","+v+") as r");
  const token=t.sqlAs(owner.id,"select public.claim_store_import_step("+L(id)+") as r")[0].r.lock_token;
  const rows=t.sql("select row_number from public.store_import_rows where session_id="+L(id)+" order by row_number").map(r=>r.row_number);
  for(let n=0;n<rows.length;n+=50)t.sqlAs(owner.id,"select public.commit_store_import_chunk("+L(id)+","+L(token)+",array["+rows.slice(n,n+50).join(",")+"]::integer[]) as r");
  const result=t.sqlAs(owner.id,"select public.finish_store_import_commit("+L(id)+","+L(token)+") as r")[0].r;
  t.note("After the real upload/mapping/review UI, this check commits through the same authenticated public RPCs used by the import worker.");
  return result;
}
async function roundTrip(t){
  const {owner,store}=d.inventoryStore(),item=d.sku(owner,{merchant_sku:"ROUND-"+t.tag(),product_name:"Round trip de prueba",unit_price_pen:100},10),page=await t.page({as:owner.email});
  await t.goto(page,INV);
  const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("link",{name:"CSV",exact:true}).first().click()]);
  const lines=fs.readFileSync(await download.path(),"utf8").replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  const headers=lines[0].split(",").map(v=>v.replace(/^"|"$/g,"")),data=lines[1].split(",");
  data[headers.indexOf("Precio (PEN)")]="150";
  await t.sleep(1100);d.move(owner,item.id,"sale",3,"tienda_fisica");
  return{owner,store,item,page,csv:[lines[0],data.join(",")].join("\n")+"\n"};
}
module.exports={session,upload,review,commit,roundTrip};
