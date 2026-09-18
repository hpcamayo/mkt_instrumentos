const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
exports.run=async({base,service,owner,buyer,storeBuyer,live,store,storeIds})=>{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 const binary=process.env.LARIA_AGENT_BROWSER_BIN??'agent-browser';const session=`s5-${crypto.randomUUID()}`;
 function command(...args){const result=spawnSync(binary,['--session',session,'--json',...args],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);const value=JSON.parse(result.stdout);assert.ok(value.success,value.error);return value.data;}
 const evaluate=code=>command('eval',code).result;
 const wait=code=>command('wait','--fn',`Boolean(${code})`);
 function open(path){command('open',base+path);command('snapshot','-i');wait("document.body.innerText.trim() && !document.querySelector('[data-nextjs-dialog]')");assert.deepEqual(command('errors').errors,[]);assert.equal(evaluate("!!document.querySelector('nav[aria-label=\"Categorías del marketplace\"]') && !!document.querySelector('form[role=search]')"),true);}
 function login(account){open('/login');command('find','label','Correo','fill',account.email);command('find','label','Contraseña','fill',account.password);command('find','role','button','click','--name','Ingresar');command('wait','--url','**/mi-cuenta');command('snapshot','-i');wait("document.querySelector('header').innerText.includes('Mi cuenta') || document.querySelector('header').innerText.includes('Mi tienda')");}
 function logout(){open('/logout');command('wait','--url','**/login**');}
 try{
  for(const path of ['/','/listados','/login','/registro/vendedor','/registro/tienda','/tiendas/casa-musical-grau','/admin']){
   open(path);
   assert.equal(new URL(command('get','url').url).pathname,path,'Public navigation must not silently redirect into account authentication or a different route');
   assert.doesNotMatch(evaluate('document.querySelector("main").innerText'),/This page could not be found|Página no encontrada/);
   if(path==='/listados')assert.ok(evaluate('document.querySelectorAll("main article").length')>0,'Anonymous catalog shows approved inventory');
  }
  open(`/instrumentos/${live.slug}`);wait("document.querySelector('a[aria-label=\"Ingresa para guardar en favoritos\"]')");command('click','a[aria-label="Ingresa para guardar en favoritos"]');command('wait','--url','**/login?next=**');assert.ok(command('get','url').url.includes(encodeURIComponent(`/instrumentos/${live.slug}`)));
  const control=`[data-favorite-listing="${live.id}"] button`;
  const saved=pressed=>`document.querySelector('${control}[aria-pressed="${pressed}"]:not([disabled])')`;
  login(buyer);open(`/instrumentos/${live.slug}`);wait(saved(true));
  command('click',control);wait(saved(false));command('click',control);wait(saved(true));
  open('/mi-cuenta/favoritos');wait(saved(true));assert.match(evaluate('document.body.innerText'),/Sprint 5 pública/);assert.equal(evaluate("!!document.querySelector('nav[aria-label=\"Navegación de cuenta\"] a[href=\"/mi-cuenta/favoritos\"][aria-current=page]')"),true);
  open(`/listados?brand=Yamaha&category=guitars`);const selector=`Array.from(document.querySelectorAll('article')).find(node=>node.querySelector('a[href="/instrumentos/${live.slug}"]'))`;wait(`${selector}?.querySelector('button[aria-pressed=true]')`);
  open('/mi-cuenta/notificaciones');assert.match(evaluate('document.body.innerText'),/Bajó de precio un favorito/);assert.ok(evaluate(`!!document.querySelector('a[href="/mi-cuenta/favoritos/${live.id}"]')`));
  command('set','viewport','390','844');open('/mi-cuenta/favoritos');assert.equal(evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);command('find','text','Explorar categorías','click');command('snapshot','-i');assert.equal(evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Categorías del marketplace\"] details')).some(node=>node.open)"),true);
  command('find','text','Cuenta · Favoritos','click');command('snapshot','-i');assert.ok(evaluate("!!document.querySelector('nav[aria-label=\"Menú de cuenta móvil\"] a[href=\"/mi-cuenta/notificaciones\"]')"));
  // Focus/typing in a shared header is not a search. A real Enter submit uses
  // exactly the canonical signed-receipt catalog path once, including zero results.
  const query=`S5 QA ${live.id}`;
  const searchRows=async()=>{const result=await service.from('marketplace_events').select('id,metadata').eq('actor_user_id',buyer.id).eq('event_type','search').eq('metadata->>query',query);assert.equal(result.error,null);return result.data;};
  command('fill','#global-marketplace-search',query);assert.equal((await searchRows()).length,0);
  command('press','Enter');command('wait','--url','**/listados?brand=**');command('snapshot','-i');wait("document.body.innerText.includes('No encontramos resultados')");
  let searches=[];for(let n=0;n<20;n++){searches=await searchRows();if(searches.length)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(searches.length,1);assert.equal(searches[0].metadata.zero_results,true);assert.equal(new URL(command('get','url').url).searchParams.get('brand'),query);
  open('/mi-cuenta/favoritos');command('focus','#global-marketplace-search');assert.equal((await searchRows()).length,1,'Header rendering/focus cannot duplicate the submitted search');
  command('set','viewport','1280','900');logout();login(storeBuyer);open('/mi-cuenta/tienda');assert.match(evaluate('document.body.innerText'),/Solicitud de tienda/);
  command('snapshot','-i');const fields={name:'Tienda retry Sprint 5',razon_social:'Tienda retry Sprint 5 SAC',ruc:store.ruc,email:storeBuyer.email,contact_person:'QA contacto',whatsapp_phone:'51999999111',city:'Lima',region:'Lima',address:'Av. Retry QA 456',description:'Todos los datos se conservan al corregir solamente el RUC.'};
  for(const [name,value]of Object.entries(fields)){
   // Scope form controls: the document also has <meta name="description">.
   const selector=`form ${name==='description'?'textarea':'input'}[name="${name}"]`;
   command('focus',selector);command('fill',selector,value);
   assert.equal(evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),value,`Real form field ${name} retained its typed value`);
  }
  command('screenshot','/private/tmp/laria-sprint-5-form-asset.png');command('upload','input[name="logo"]','/private/tmp/laria-sprint-5-form-asset.png');
  command('find','role','button','click','--name','Enviar solicitud de tienda');wait("document.body.innerText.includes('Este RUC ya está registrado en Laria.')");assert.equal(evaluate("document.activeElement?.getAttribute('role')"),'alert');
  command('fill','[name="ruc"]','21'+String(Date.now()).slice(-9));command('find','role','button','click','--name','Enviar solicitud de tienda');wait("document.body.innerText.includes('Solicitud enviada.')");assert.equal(evaluate("document.activeElement?.getAttribute('role')"),'status');
  // Accessible focus is immediate; allow the existing smooth scroll to finish.
  wait("document.activeElement.getBoundingClientRect().top >= 0 && document.activeElement.getBoundingClientRect().bottom <= window.innerHeight");
  const result=await service.from('stores').select('id,name,address,description,logo_url').eq('owner_user_id',storeBuyer.id);assert.equal(result.error,null);assert.equal(result.data.length,1);const created=result.data[0];storeIds.push(created.id);assert.equal(created.address,fields.address);assert.equal(created.description,fields.description);assert.ok(created.logo_url);
  open('/mi-cuenta');wait("document.querySelector('header').innerText.includes('Mi tienda')");assert.ok(!evaluate("document.querySelector('header').innerText.includes('Registra tienda')"));open('/mi-cuenta/tienda');assert.equal(evaluate("!!document.querySelector('input[name=name]') && document.querySelector('input[name=name]').value === 'Tienda retry Sprint 5'"),true);
  logout();login(owner);open('/mi-cuenta/publicaciones');assert.match(evaluate('document.body.innerText'),/Favoritos actuales/i);assert.match(evaluate("document.querySelector('nav[aria-label=\"Navegación de cuenta\"]').innerText"),/Mis publicaciones/);assert.ok(!evaluate("document.querySelector('nav[aria-label=\"Navegación de cuenta\"]').innerText.includes('Inventario')"));
  console.log('PASS actual browser: global desktop/mobile shell, anonymous safe next, card/detail saved state, Favorites, notifications, owner aggregates, same-form duplicate-RUC→correction with preserved logo/data and accessible success.');
 }catch(error){command('screenshot','/private/tmp/laria-sprint-5-browser-error.png');console.error(command('snapshot','-i').snapshot);throw error;}finally{command('close');}
};
exports.history=async({base,buyer,live,availability})=>{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 const binary=process.env.LARIA_AGENT_BROWSER_BIN??'agent-browser',session=`s5-history-${crypto.randomUUID()}`;
 function command(...args){const result=spawnSync(binary,['--session',session,'--json',...args],{encoding:'utf8',timeout:45000});assert.equal(result.status,0,result.stderr||result.stdout);const value=JSON.parse(result.stdout);assert.ok(value.success,value.error);return value.data;}
 try{
  command('open',base+'/login');command('snapshot','-i');command('find','label','Correo','fill',buyer.email);command('find','label','Contraseña','fill',buyer.password);command('find','role','button','click','--name','Ingresar');command('wait','--url','**/mi-cuenta');command('snapshot','-i');
  command('open',base+'/mi-cuenta/favoritos');command('snapshot','-i');command('wait','--fn',`!!document.querySelector('[data-favorite-listing="${live.id}"] button:not([disabled])')`);
  const text=command('eval','document.querySelector("main").innerText').result;
  if(availability==='sold'){assert.match(text,/Vendido/);assert.ok(text.includes(live.title));}else{assert.match(text,/Publicación no disponible/);assert.ok(!text.includes(live.title));}
  assert.deepEqual(command('errors').errors,[]);console.log(`PASS actual browser favorite history: ${availability}`);
 }finally{command('close');}
};
