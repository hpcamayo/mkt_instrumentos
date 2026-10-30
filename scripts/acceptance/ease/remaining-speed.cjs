"use strict";
const d=require("./d-helpers.cjs"),c=require("./c-helpers.cjs");
const cases=[],CAT="/listados";
async function firstListing(t,page){await t.goto(page,CAT);const link=page.locator('main a[href^="/instrumentos/"]').first();await link.waitFor();return link;}
async function slow(t,page,link,label){
  const href=await link.getAttribute("href"),target=new URL(href,t.base).pathname;
  await link.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);
  await page.route(url=>url.pathname===target,async route=>{await t.sleep(1900);await route.fallback();});
  await link.click({noWaitAfter:true});
  await page.locator(".navigation-skeleton").waitFor({timeout:5000});
  const geometry=await page.locator(".navigation-skeleton").evaluate(el=>({top:el.getBoundingClientRect().top,main:Math.max(0,document.getElementById("contenido").getBoundingClientRect().top)}));
  t.check(Math.abs(geometry.top-geometry.main)<=2,label+" skeleton covers the old content below its header");
  t.check(await page.locator('#contenido[aria-busy="true"]').count()===1,label+" marks the old main busy");
  t.check(await page.getByRole("status").filter({hasText:"Cargando la página…"}).count()===1,label+" has one polite loading status");
  await t.shot(page,"slow-"+label);
  await page.waitForURL(url=>url.pathname===target);await page.locator(".navigation-skeleton").waitFor({state:"detached"});
  await page.unroute(url=>url.pathname===target);
  t.check(await page.getByRole("status").filter({hasText:"Cargando la página…"}).count()===0,label+" clears the loading announcement on arrival");
  await page.goBack({waitUntil:"load"});await t.sleep(500);
  t.check(Math.abs(await page.evaluate(()=>scrollY)-before)<=5,label+" Back restores the previous scroll position");
}
cases.push({id:"EASE-701",live:true,run:async(t)=>{
  const page=await t.page({saveData:true}),link=await firstListing(t,page),href=await link.getAttribute("href");
  await page.route(url=>url.pathname===new URL(href,t.base).pathname,async route=>{await t.sleep(700);await route.fallback();});
  await page.evaluate(()=>{window.easeBar=[];new MutationObserver(()=>window.easeBar.push({state:document.querySelector(".navigation-bar").dataset.state,at:performance.now()})).observe(document.querySelector(".navigation-bar"),{attributes:true});window.easeStart=performance.now();});
  await link.click({noWaitAfter:true});await page.locator('.navigation-bar[data-state="start"],.navigation-bar[data-state="wait"]').waitFor();
  await page.waitForURL(url=>url.pathname===new URL(href,t.base).pathname);await t.sleep(450);
  const states=await page.evaluate(()=>({states:window.easeBar,start:window.easeStart}));
  const visible=states.states.find(x=>["start","wait"].includes(x.state));
  t.check(visible&&visible.at-states.start>=90,"a delayed page change shows the bar after the 100 ms threshold");
  t.check(states.states.some(x=>x.state==="done")&&await page.locator(".navigation-bar").getAttribute("data-state")==="idle","the bar completes and returns to idle on arrival");
  await page.unrouteAll({behavior:"wait"}); // Context-level live guard remains installed.
  await page.goBack({waitUntil:"load"});await t.sleep(450);
  await page.evaluate(()=>{
    window.easeBar=[];window.easeFast={clicked:null,committed:null};
    document.addEventListener("click",()=>{window.easeFast.clicked=performance.now();},{once:true,capture:true});
    const push=history.pushState;history.pushState=function(...args){const result=push.apply(this,args);window.easeFast.committed=performance.now();return result;};
  });
  await page.locator('main a[href="'+href+'"]').first().click();await page.waitForURL(url=>url.pathname===new URL(href,t.base).pathname);await t.sleep(450);
  const fast=await page.evaluate(()=>({states:window.easeBar,...window.easeFast})),elapsed=fast.committed-fast.clicked;
  t.note("Fast-branch browser click-to-commit: "+elapsed+" ms");
  if(!fast.committed||elapsed>=100){
    if(t.record.checks.some(check=>!check.ok))return;
    t.skip("Slow-navigation bar verified; this environment's cached click was not under 100 ms, so it did not meet the fast-branch precondition.");
  }
  t.check(!fast.states.some(x=>["start","wait"].includes(x.state)),"a measured sub-100-ms navigation displays no progress bar");
}});
cases.push({id:"EASE-702",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner),merchant=t.account({kind:"store_owner"}),store=t.store(merchant,{verified:true}),page=await t.page({saveData:true,as:owner.email});
  await t.goto(page,CAT+"?q="+encodeURIComponent(item.title));await slow(t,page,page.locator('main a[href="/instrumentos/'+item.slug+'"]').first(),"listing");
  await t.goto(page,"/tiendas");await slow(t,page,page.locator('main a[href="/tiendas/'+store.slug+'"]').first(),"store");
  await t.goto(page,"/");await page.getByRole("button",{name:"Mi cuenta",exact:true}).click();await slow(t,page,page.locator('a[href="/mi-cuenta"]:visible').first(),"account");
}});
cases.push({id:"EASE-706",run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner,{photos:4}),page=await t.page({phone:true,saveData:true});
  await t.goto(page,"/");await page.locator('a[href="/listados"]:visible').first().click();await page.waitForURL(/\/listados/);
  const cards=page.locator('main article img');
  await cards.first().waitFor();
  const catalog=await cards.evaluateAll(nodes=>nodes.map(x=>({sizes:x.sizes,srcset:x.srcset})));
  t.check(catalog.some(x=>x.sizes.includes("0.75")&&x.srcset.includes("w=")),"catalog images created after navigation scale their sizes to 1.5x on a 2x phone");
  await t.goto(page,"/instrumentos/"+item.slug);
  const requests=[];page.on("request",r=>{if(r.resourceType()==="image")requests.push(r.url());});
  await page.getByRole("button",{name:/^Ampliar foto 1/}).click();const dialog=page.getByRole("dialog");await dialog.waitFor();
  const images=dialog.locator(".lightbox-photo img");await images.first().waitFor();
  t.check(await d.until(()=>images.first().evaluate(el=>el.complete&&el.naturalWidth>0)),"the reduced-data lightbox image actually loads");
  const evidence=await images.evaluateAll(nodes=>nodes.map(x=>({sizes:x.sizes,srcset:x.srcset,current:x.currentSrc,css:x.getBoundingClientRect().width})));
  t.check(evidence.some(x=>x.sizes.includes("0.75")&&x.srcset.includes("w=")),"new lightbox images use the same responsive srcset at reduced density");
  t.note(JSON.stringify({catalog:catalog.slice(0,2),gallery:evidence,requests}));
}});
cases.push({id:"EASE-707",live:true,run:async(t)=>{
  for(const phone of [false,true]){
    const page=await t.page({phone,saveData:true}),requests=[];
    page.on("request",r=>{const u=new URL(r.url());if(u.origin===new URL(t.base).origin&&/^\/instrumentos\/[^/]+$/.test(u.pathname))requests.push({method:r.method(),path:u.pathname,prefetch:r.headers()["next-router-prefetch"]||null});});
    await t.goto(page,CAT);const links=page.locator('main a[href^="/instrumentos/"]');await links.first().waitFor();
    await links.first().hover();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await t.sleep(1500);
    t.check(requests.length===0,(phone?"phone":"desktop")+" data saver performs no listing-page request on view, hover or scroll");
  }
}});
cases.push({id:"EASE-709",run:async(t)=>{
  const owner=t.account({kind:"particular"}),item=t.listing(owner,{photos:4}),page=await t.page({as:owner.email});
  await t.goto(page,"/instrumentos/"+item.slug);
  await page.getByRole("button",{name:"Ver foto 2 de 4",exact:true}).click();
  t.check(await page.getByRole("button",{name:"Ver foto 2 de 4",exact:true}).getAttribute("aria-current")==="true","thumbnail selects the second photo");
  await page.getByRole("button",{name:"Foto siguiente",exact:true}).click();
  t.check(await page.getByRole("button",{name:"Ver foto 3 de 4",exact:true}).getAttribute("aria-current")==="true","gallery next button selects the third photo");
  await page.getByRole("button",{name:"Foto anterior",exact:true}).click();
  await page.getByRole("button",{name:/^Ampliar foto 2/}).click();const dialog=page.getByRole("dialog");await dialog.waitFor();
  await dialog.getByRole("button",{name:"Foto siguiente",exact:true}).click();
  t.check((await dialog.innerText()).includes("3 de 4"),"lightbox next button changes the photo");
  await dialog.getByRole("button",{name:"Foto anterior",exact:true}).click();
  t.check((await dialog.innerText()).includes("2 de 4"),"lightbox previous button changes it back");
  await dialog.getByRole("button",{name:"Acercar",exact:true}).click();
  t.check(await dialog.getByRole("button",{name:"Alejar",exact:true}).isEnabled(),"zoom-in enables zoom-out");
  await dialog.getByRole("button",{name:"Alejar",exact:true}).click();
  await page.keyboard.press("Escape");await t.goto(page,"/mi-cuenta/publicar");await c.fillSell(page,{stopAfter:1});
  const photos=page.locator('ol[aria-label="Fotos de la publicación"] li img'),before=await photos.evaluateAll(nodes=>nodes.map(n=>n.src));
  await page.getByRole("button",{name:"Mover foto 1 después",exact:true}).click();
  t.check((await photos.first().getAttribute("src"))===before[1],"move-after swaps the actual photo order");
  await page.getByRole("button",{name:"Mover foto 2 antes",exact:true}).click();
  t.check((await photos.first().getAttribute("src"))===before[0],"move-before restores the original order");
}});
async function focusSweep(t,page,label){
  await page.evaluate(()=>{document.activeElement?.blur();document.body.tabIndex=-1;document.body.focus();});
  const seen=new Set(),covered=[];
  for(let i=0;i<350;i++){
    await page.keyboard.press("Tab");await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await page.evaluate(()=>{
      const el=document.activeElement;if(!el||el===document.body)return{key:"body",covered:false};
      const key=el.tagName+"|"+(el.id||el.getAttribute("aria-label")||el.textContent||el.name||"")+"|"+[...document.querySelectorAll("a,button,input,select,textarea,summary")].indexOf(el);
      const b=el.getBoundingClientRect(),bars=[...document.querySelectorAll("[data-bottom-bar],.contact-bar")].filter(x=>{const s=getComputedStyle(x),r=x.getBoundingClientRect();return["fixed","sticky"].includes(s.position)&&s.visibility!=="hidden"&&s.display!=="none"&&r.height>0&&r.bottom>0;});
      return{key,covered:bars.some(bar=>{if(bar.contains(el))return false;const r=bar.getBoundingClientRect();return b.bottom>r.top+1&&b.top<r.bottom-1&&b.right>r.left&&b.left<r.right;})};
    });
    if(seen.has(result.key))break;seen.add(result.key);if(result.covered)covered.push(result.key);
  }
  t.check(seen.size>5,label+" traversed actual keyboard focus stops");
  t.check(covered.length===0,label+" keeps keyboard focus clear of its bottom bar");
  if(covered.length){t.note(JSON.stringify({label,covered}));await t.shot(page,label+"-covered");}
}
cases.push({id:"EASE-710",timeout:240000,run:async(t)=>{
  const {owner}=d.inventoryStore();d.sku(owner,{merchant_sku:"FOCUS-"+t.tag(),product_name:"Enfoque EASE"},5);const seller=t.account({kind:"particular"}),item=t.listing(seller);
  for(const phone of [true,false]){
    const width=phone?390:1366,page=await t.page({phone,as:owner.email});
    await t.goto(page,"/mi-cuenta/tienda/inventario");
    await page.getByRole("checkbox",{name:/^Seleccionar (?!todos)/}).first().check();await page.getByRole("region",{name:"Acciones para los SKU seleccionados"}).waitFor();
    await focusSweep(t,page,width+" inventory bulk");await t.shot(page,"inventory-focus-"+width);
    for(const category of ["guitars","pedals","guitars"]){await t.goto(page,CAT+"?category="+category);await page.waitForFunction(value=>{try{return JSON.parse(localStorage.getItem("laria:busquedas")).last==="/listados?category="+value;}catch{return false;}},category);}
    await page.getByRole("region",{name:"Sugerencia de alerta"}).waitFor();await focusSweep(t,page,width+" repeated-search prompt");
    await page.getByRole("button",{name:"No, gracias",exact:true}).click();
    if(!phone){await page.getByRole("checkbox",{name:"Comparar",exact:true}).first().check();await page.getByRole("complementary",{name:"Comparación"}).waitFor();await focusSweep(t,page,width+" comparison tray");}
    const undoItem=t.listing(seller);const own=await t.page({phone,as:seller.email});await t.goto(own,"/mi-cuenta/publicaciones");await own.locator("tbody tr").filter({hasText:undoItem.title}).getByRole("button",{name:"Ocultar",exact:true}).click();await own.getByRole("button",{name:"Deshacer",exact:true}).waitFor();await focusSweep(t,own,width+" Undo notice");
    await t.goto(page,"/instrumentos/"+item.slug);await focusSweep(t,page,width+" listing contact");
    if(phone){await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await t.sleep(500);const geometry=await page.evaluate(()=>{const footer=document.querySelector("footer"),bar=document.querySelector(".contact-bar");return{footer:Math.max(...[...footer.querySelectorAll("a,p")].map(x=>x.getBoundingClientRect().bottom)),bar:bar?.getBoundingClientRect().top};});t.check(geometry.footer<=geometry.bar+2,"phone footer ends above the fixed contact bar");t.note("phone footer geometry "+JSON.stringify(geometry));await t.shot(page,"phone-footer-contact");}
  }
}});
cases.push({id:"EASE-715",live:true,run:async(t)=>{
  for(const phone of [false,true]){
    const page=await t.page({phone});await page.addInitScript(()=>{window.easeInstallCalls=0;window.addEventListener("beforeinstallprompt",event=>{event.prompt=()=>{window.easeInstallCalls++;return Promise.resolve();};});});
    for(const route of ["/","/listados","/tiendas","/vender"]){
      await t.goto(page,route);await page.evaluate(()=>{const event=new Event("beforeinstallprompt",{cancelable:true});event.prompt=()=>{window.easeInstallCalls++;return Promise.resolve();};window.dispatchEvent(event);});await t.sleep(150);
      t.check(await page.getByRole("dialog").filter({hasText:/instala.*Laria|instalar.*aplicación/i}).count()===0,"no app-owned install dialog on "+route+" at "+(phone?390:1366));
      t.check(await page.getByRole("button",{name:/instalar (Laria|la app|aplicación)/i}).count()===0,"no install action appears on "+route);
    }
    t.check(await page.evaluate(()=>window.easeInstallCalls)===0,"the app never invokes the installation prompt");
  }
}});
module.exports=cases;
