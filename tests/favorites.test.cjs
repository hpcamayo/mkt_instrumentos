const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks={}) {
 const filename=path.resolve(file);const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
 const original=mod.require.bind(mod);mod.require=name=>Object.hasOwn(mocks,name)?mocks[name]:original(name);
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename);return mod.exports;
}
const Link=({children,...props})=>React.createElement('a',props,children);
const {parseAccountFavorites}=load('lib/favorites.ts');
test('listing entity validation preserves legacy UUIDs without allowing unsafe syntax',()=>{
 const {isFavoriteListingId}=load('lib/favorites.ts');
 assert.ok(isFavoriteListingId('20000000-0000-0000-0000-000000000001'));
 assert.ok(isFavoriteListingId(crypto.randomUUID()));
 for(const value of ['id',null,'../private','20000000-0000-0000-0000-000000000001 OR 1=1'])assert.equal(isFavoriteListingId(value),false);
});
test('favorite history accepts only redacted unavailable rows and bounded pages',()=>{
 const value={total:1,items:[{listing_id:'id',created_at:'2026-09-17',availability:'unavailable',title:null,slug:null,price_pen:null,image_url:null}]};
 assert.deepEqual(parseAccountFavorites(value),value);
 for(const field of ['title','slug','price_pen','image_url']) assert.equal(parseAccountFavorites({...value,items:[{...value.items[0],[field]:'private'}]}),null);
 assert.equal(parseAccountFavorites({...value,total:-1}),null);
 assert.equal(parseAccountFavorites({...value,items:Array(25).fill(value.items[0])}),null);
});
test('favorite controls reflect actual saved state and anonymous safe login navigation',()=>{
 const button=state=>load('components/favorite-button.tsx',{'next/link':{default:Link},'next/navigation':{usePathname:()=>'/listados',useRouter:()=>({push(){},refresh(){}})},'@/components/marketplace-account-provider':{useMarketplaceAccount:()=>({ready:true,authenticated:true,favorites:{id:true},register:()=>()=>{},setFavorite:async()=>{},...state})}}).FavoriteButton;
 const html=renderToStaticMarkup(React.createElement(button({}),{listingId:'id'}));assert.match(html,/aria-pressed="true"/);assert.match(html,/Quitar de favoritos/);
 const anon=renderToStaticMarkup(React.createElement(button({authenticated:false}),{listingId:'id'}));assert.match(anon,/login\?next=%2Flistados/);assert.match(anon,/Ingresa para guardar/);
});
test('global search uses exactly the catalog brand parameter and no client event',()=>{
 const {GlobalSearch}=load('components/global-search.tsx',{'next/navigation':{useSearchParams:()=>new URLSearchParams('brand=Yamaha')}});
 const html=renderToStaticMarkup(React.createElement(GlobalSearch));assert.match(html,/action="\/listados"/);assert.match(html,/name="brand"/);assert.match(html,/value="Yamaha"/);assert.match(html,/role="search"/);
 assert.doesNotMatch(fs.readFileSync('components/global-search.tsx','utf8'),/sendMarketplaceEvent|name="q"/);
});
test('favorite actions authenticate and batches bind to the actual session user',async()=>{
 const queries=[];const client={auth:{getUser:async()=>({data:{user:{id:'trusted'}}})},from:()=>({select:()=>({eq:(...args)=>{queries.push(args);return {in:async()=>({data:[],error:null})};}})}),rpc:async(...args)=>{queries.push(args);return {data:true,error:null};}};
 const {POST}=load('app/api/favorites/route.ts',{'@/lib/supabase/server-client':{getSupabaseServerClient:async()=>client},'@/lib/favorites':{isFavoriteListingId:v=>v==='id'},'@/lib/marketplace-events-server':{sameOriginEventRequest:()=>true}});
 const request=body=>new Request('http://localhost/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await POST(request({action:'states',ids:['id'],user_id:'forged'}))).status,200);assert.deepEqual(queries[0],['user_id','trusted']);
 assert.equal((await POST(request({action:'states',ids:Array(101).fill('id')}))).status,400);
 assert.equal((await POST(request({action:'set',id:'id',saved:true,user_id:'forged'}))).status,200);assert.deepEqual(queries.at(-1),['set_listing_favorite',{p_listing_id:'id',p_saved:true}]);
});
test('favorite API refuses anonymous sessions and cross-site actions',async()=>{
 for(const [origin,user,status] of [[false,true,403],[true,false,401]]){
  const {POST}=load('app/api/favorites/route.ts',{'@/lib/supabase/server-client':{getSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:user?{id:'user'}:null}})}})},'@/lib/favorites':{isFavoriteListingId:()=>true},'@/lib/marketplace-events-server':{sameOriginEventRequest:()=>origin}});
  assert.equal((await POST(new Request('http://localhost/api/favorites',{method:'POST',body:'{}'}))).status,status);
 }
});
test('price-drop notifications target safe recipient-specific listing navigation, not seller inventory',()=>{
 const source=fs.readFileSync('components/notifications-list.tsx','utf8');assert.match(source,/listing_price_drop/);assert.match(source,/\/mi-cuenta\/favoritos\/\$\{notification.listing_id\}/);assert.match(source,/Bajó de precio un favorito/);
});
