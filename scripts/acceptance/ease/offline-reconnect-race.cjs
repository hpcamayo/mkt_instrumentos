// Local regression: a network failure may settle after the online event. Exercise the real queue and server refusal.
"use strict";
const base=require("./remaining-inventory.cjs").find(x=>x.id==="EASE-627");
module.exports=[{...base,liveAccounts:false,run:async(t)=>{
 const original=t.page;
 await base.run({...t,offlineRejectionAfterReconnect:true,page:async(...args)=>{
  const page=await original(...args);
  await page.addInitScript(()=>{
   let offlineSales=0;const nativeFetch=window.fetch;
   window.fetch=function(input,options){
    if(String(input)==='/api/store/inventory'&&!navigator.onLine){
     let action;try{action=JSON.parse(options?.body).action;}catch{}
     if(action==='bulk_stock'&&++offlineSales===2){
      return new Promise((resolve,reject)=>window.addEventListener('online',()=>setTimeout(()=>reject(new TypeError('Simulated delayed offline rejection')),100),{once:true}));
     }
    }
    return nativeFetch.call(this,input,options);
   };
  });return page;
 }});
 t.note('Local fault injection: the second offline request rejects 100 ms after reconnect, so its queue insertion follows the online event.');
}}];
