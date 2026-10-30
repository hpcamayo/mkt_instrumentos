"use strict";
const d=require("./d-helpers.cjs"),c=require("./c-helpers.cjs"),imp=require("./remaining-import-helpers.cjs");
const cases=[];
function manual(t,reason){if(t.record.checks.some(check=>!check.ok)){t.note("Manual remainder: "+reason);return;}t.skip(reason);}
for(const [file,ids] of [["./b-media.cjs",["EASE-164","EASE-166"]],["./checks-d.cjs",["EASE-546","EASE-549"]]]){
  for(const original of require(file).filter(x=>ids.includes(x.id))){
    cases.push({...original,liveAccounts:false,run:async t=>original.run({...t,skip:reason=>manual(t,reason)})});
  }
}
cases.push({id:"EASE-512",liveAccounts:false,run:async(t)=>{
  const {owner}=d.inventoryStore(),opened=await imp.upload(t,owner,"SKU,Nombre,Precio (PEN),Stock\nCAM-A,Guitarra cámara,100,2\nCAM-B,Pedal cámara,200,3\n");
  await imp.review(t,opened,"both");const page=opened.page;
  await page.getByRole("button",{name:"Continuar",exact:true}).click();await page.getByRole("heading",{name:"Fotos",exact:true}).waitFor();
  await page.getByRole("button",{name:"Empezar sesión de fotos",exact:true}).click();
  const input=page.locator('input[id^="sesion-foto-"]');await input.waitFor({state:"attached"});
  t.check(await input.getAttribute("capture")==="environment","the session requests the rear-facing camera");
  const first=await page.locator("#sesion-fotos-actual").innerText();await input.setInputFiles(c.samples(2));
  await page.getByRole("button",{name:"Siguiente SKU",exact:true}).waitFor();
  const firstRow=t.sql("select min(row_number) as n from public.store_import_rows where session_id="+t.literal(opened.id))[0].n;
  const assets=t.sql("select row_number,sort_order from public.store_import_photo_assignments where session_id="+t.literal(opened.id)+" order by row_number,sort_order");
  t.check(assets.length===2&&assets.every(a=>a.row_number===firstRow),"two supplied photos attach to the currently displayed first SKU");
  await page.getByRole("button",{name:"Siguiente SKU",exact:true}).click();
  t.check((await page.locator("#sesion-fotos-actual").innerText())!==first,"the session advances to the next SKU without renaming files");
  await t.shot(page,"camera-session");
  manual(t,"Physical phone rear-camera selection and taking each shot remain untested; automation supplied files to the real session input.");
}});
cases.push({id:"EASE-703",live:true,run:async(t)=>{
  const page=await t.page({saveData:true});await t.goto(page,"/listados");
  const link=page.locator('main a[href^="/instrumentos/"]').first(),href=await link.getAttribute("href"),target=new URL(href,t.base).pathname;
  await page.route(url=>url.pathname===target,async route=>{await t.sleep(1800);await route.fallback();});
  await link.click({noWaitAfter:true});const status=page.getByRole("status").filter({hasText:"Cargando la página…"});await status.waitFor({state:"attached"});
  t.check(await status.count()===1,"the delayed navigation exposes exactly one loading status");
  t.check(await status.getAttribute("aria-live")!=="assertive","the status is polite rather than assertive");
  await page.waitForURL(url=>url.pathname===target);
  t.check(await d.until(()=>status.count().then(n=>n===0)),"the status clears when the new page commits");
  manual(t,"Listen with VoiceOver or TalkBack: one loading announcement, then silence on arrival. DOM status changes do not prove spoken output.");
}});
cases.push({id:"EASE-712",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner),page=await t.page();
  await t.goto(page,"/instrumentos/"+item.slug);
  const favorite=page.locator('[data-favorite-listing="'+item.id+'"] button:visible').first();await favorite.click();
  const status=page.getByRole("status").filter({hasText:"Guardado en favoritos"});await status.first().waitFor({state:"attached"});
  t.check(await status.first().getAttribute("aria-live")==="polite","favorite changes expose a polite saved announcement");
  t.check(await favorite.evaluate(el=>el===document.activeElement),"saving the favorite keeps focus on the control");
  const sell=await t.page({as:owner.email});await t.goto(sell,"/mi-cuenta/publicar");await c.fillSell(sell,{stopAfter:1});
  const summary=sell.getByRole("status").filter({hasText:/foto/i});t.check(await summary.count()>0,"the uploaded-photo summary is a live status");
  await t.goto(page,"/listados?category=guitars");
  const counts=page.locator('[role="status"],[aria-live="polite"]');
  t.check((await counts.allTextContents()).some(text=>/resultado|publicaci|instrumento/i.test(text)),"catalog result totals are exposed in a polite live region");
  manual(t,"Listen with VoiceOver or TalkBack to saved favorites, uploading-photo summaries and filtered result counts; confirm they are spoken without moving focus.");
}});
async function manifest(t,page){
  const response=await page.request.get(t.url("/manifest.webmanifest"));t.check(response.ok(),"the deployment serves its manifest");
  return response.json();
}
cases.push({id:"EASE-714",live:true,run:async(t)=>{
  const page=await t.page({phone:true}),m=await manifest(t,page);
  t.check(m.display==="standalone"&&m.short_name==="Laria","the manifest requests standalone Laria presentation");
  t.check(["Vender un instrumento","Mis favoritos"].every(name=>m.shortcuts.some(x=>x.name===name)),"both long-press shortcuts are declared");
  for(const icon of m.icons){const response=await page.request.get(t.url(icon.src));t.check(response.ok()&&response.headers()["content-type"].includes("image/png"),"the declared "+icon.sizes+" icon is served");}
  manual(t,"On a physical Android phone install from Chrome's menu, open the icon, verify the browser bar is absent and long-press both shortcuts.");
}});
cases.push({id:"EASE-716",live:true,run:async(t)=>{
  const page=await t.page({phone:true}),m=await manifest(t,page),target=m.share_target;
  t.check(target.method==="POST"&&target.enctype==="multipart/form-data"&&target.action==="/compartir/recibir","the installed-app photo share target is declared");
  t.check(target.params.files.some(x=>x.name==="fotos"&&x.accept.includes("image/heic")),"the share target accepts photos including HEIC");
  await t.goto(page,"/compartir");
  t.check(!/Application error|Internal Server Error/.test(await page.locator("body").innerText()),"the share landing page renders");
  manual(t,"Use Android gallery > Share > installed Laria with two ordered photos as Particular, store owner and signed out; verify the role's form and photos retained through sign-in. Native OS share delivery is not simulated here.");
}});
cases.push({id:"EASE-719",run:async(t)=>{
  const owner=t.account({kind:"buyer"}),page=await t.page({as:owner.email});
  await page.addInitScript(()=>{window.easePermissionCalls=0;if(window.Notification)Notification.requestPermission=async()=>{window.easePermissionCalls++;return "denied";};});
  await t.goto(page,"/");await t.goto(page,"/mi-cuenta/notificaciones");await t.sleep(400);
  t.check(await page.evaluate(()=>window.easePermissionCalls)===0,"first visit and opening notifications never request notification permission");
  t.note("Activar avisos visible: "+await page.getByRole("button",{name:"Activar avisos",exact:true}).count());
  manual(t,"On a supported physical phone, turn on Activar avisos, grant native permission and verify the sample notification and independent per-device setting. This check never opens an OS permission prompt.");
}});
module.exports=cases;
