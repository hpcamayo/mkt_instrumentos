"use strict";
const h=require("./harness.cjs"),d=require("./d-helpers.cjs"),c=require("./c-helpers.cjs"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const L=h.literal,cases=[];
function contact(t,owner,item,buyer,days=5){
  t.exec("insert into public.marketplace_events(event_type,created_at,listing_id,seller_user_id,actor_user_id,session_id,source,metadata,dedupe_key) values ('whatsapp_contact',now()-make_interval(days=>"+days+"),"+L(item.id)+","+L(owner.id)+","+L(buyer.id)+","+L(crypto.randomUUID())+",'detail','{}',"+L(t.tag())+")");
}
cases.push({id:"EASE-307",liveAccounts:false,run:async(t)=>{
  const fixture=path.join(__dirname,"fixtures/sample.heic"),bytes=fs.readFileSync(fixture);
  t.check(bytes.subarray(4,32).includes(Buffer.from("ftyp")),"the input is a real HEIC container");
  const owner=t.account({kind:"particular"}),page=await t.page({as:owner.email});await t.goto(page,"/mi-cuenta/publicar");
  await c.fillSell(page,{photos:[fixture,c.samples(1)[0]],stopAfter:1});
  const objects=c.objects(owner.id,"listing-photos");
  t.check(objects.length===2&&objects.every(o=>o.name.endsWith(".jpg")&&o.metadata?.mimetype==="image/jpeg"),"HEIC input is converted and uploaded as JPEG alongside the ordinary photo");
  for(const object of objects){
    const file=c.diskPath("listing-photos",object.name),stored=fs.readFileSync(file);
    t.check(stored[0]===255&&stored[1]===216,"stored bytes have a JPEG signature");
  }
  await t.shot(page,"heic-converted");
  t.note("The HEIC fixture was generated from Laria's own icon with macOS sips; this proves the format conversion, not physical iPhone camera selection.");
}});
cases.push({id:"EASE-409",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),buyer=t.account({kind:"buyer"});
  const old=t.listing(owner,{publishedDaysAgo:40}),contacts=t.listing(owner,{publishedDaysAgo:1}),recent=t.listing(owner,{publishedDaysAgo:1}),throttled=t.listing(owner,{publishedDaysAgo:40}),eligible=t.listing(owner,{publishedDaysAgo:40}),paused=t.listing(owner,{publishedDaysAgo:40});
  t.exec("update public.listings set availability_checkin_at=now()-interval '7 days' where id="+L(throttled.id)+";update public.listings set availability_checkin_at=now()-interval '15 days' where id="+L(eligible.id)+";update public.listings set paused_until=current_date+7 where id="+L(paused.id));
  for(let i=0;i<5;i++)contact(t,owner,contacts,buyer,0);
  const {owner:merchant,store}=d.inventoryStore(),managed=t.listing(merchant,{storeRow:store,publishedDaysAgo:40});
  d.sku(merchant,{merchant_sku:"MANAGED-"+t.tag(),product_name:"Controlado por inventario",listing_id:managed.id},2);
  const due=(item)=>t.sql("select laria_private.ux_listing_availability_due(l) as due from public.listings l where id="+L(item.id))[0].due;
  for(const item of [old,contacts,eligible])t.check(due(item),"old, five-contact or 14-day-eligible listing is due: "+item.id);
  for(const item of [recent,throttled,paused,managed])t.check(!due(item),"recent, recently asked, paused or stock-managed listing is excluded: "+item.id);
  t.sql("select laria_private.run_my_listings_reminders() as r");
  const own=[old.id,contacts.id,eligible.id];
  const notices=()=>t.notifications(owner.id).filter(n=>own.includes(n.listing_id)&&n.event_type==="listing_availability_checkin");
  t.check(notices().length===3,"the job asks each eligible owned listing once");
  t.sql("select laria_private.run_my_listings_reminders() as r");
  t.check(notices().length===3,"an immediate second run does not ask again");
}});
cases.push({id:"EASE-411",liveAccounts:false,run:async(t)=>{
  const owner=t.account({kind:"particular"}),buyer=t.account({kind:"particular"}),scope=[];
  const purchase=t.listing(owner,{publishedDaysAgo:10});scope.push(purchase.id);contact(t,owner,purchase,buyer);
  const claims=[],reviews=[];
  for(const days of [2,7]){
    const item=t.listing(owner,{publishedDaysAgo:10});scope.push(item.id);contact(t,owner,item,buyer,9);
    t.sqlAs(owner.id,"select public.set_owned_listing_lifecycle("+L(item.id)+",'sold') as r");
    const claim=t.sqlAs(owner.id,"select public.create_transaction_claim("+L(item.id)+","+L(buyer.id)+") as r")[0].r;
    t.exec("update public.transaction_claims set created_at=now()-make_interval(days=>"+days+") where id="+L(claim));claims.push({id:claim,days});
  }
  for(const days of [3,1]){
    const item=t.listing(owner,{publishedDaysAgo:10});scope.push(item.id);contact(t,owner,item,buyer,9);
    t.sqlAs(owner.id,"select public.set_owned_listing_lifecycle("+L(item.id)+",'sold') as r");
    const claim=t.sqlAs(owner.id,"select public.create_transaction_claim("+L(item.id)+","+L(buyer.id)+") as r")[0].r;
    t.sqlAs(buyer.id,"select public.respond_transaction_claim("+L(claim)+",true) as r");
    const tx=t.sql("select id from public.verified_transactions where listing_id="+L(item.id))[0];
    t.exec("update public.verified_transactions set verified_at=now()-interval '10 days'+make_interval(days=>"+days+"),review_deadline=now()+make_interval(days=>"+days+") where id="+L(tx.id));
    t.exec("update public.verified_transactions set review_deadline=verified_at+interval '10 days' where id="+L(tx.id));reviews.push({id:tx.id,days});
  }
  t.sql("select laria_private.run_my_listings_reminders() as r");
  const types=["listing_purchase_check","listing_purchase_confirmation_reminder","listing_review_reminder"];
  const notices=()=>[...t.notifications(owner.id),...t.notifications(buyer.id)].filter(n=>scope.includes(n.listing_id)&&types.includes(n.event_type));
  const emails=()=>t.emails("listing_id in ("+scope.map(L).join(",")+")").filter(e=>types.includes(e.event_type));
  t.check(notices().length===7,"purchase, day-2/day-7 claims and both sides' day-3/day-1 reviews each have a notification");
  t.check(emails().length===7,"each reminder has one matching queued email");
  const keys=t.sql("select reminder_key from laria_private.ux_reminders_sent");
  for(const claim of claims)t.check(keys.some(k=>k.reminder_key==="claim_reminder:"+claim.id+":"+claim.days),"claim reminder uses the expected day "+claim.days);
  for(const review of reviews)for(const user of [owner,buyer])t.check(keys.some(k=>k.reminder_key==="review_reminder:"+review.id+":"+user.id+":"+review.days),"review reminder uses the expected deadline "+review.days);
  t.sql("select laria_private.run_my_listings_reminders() as r");
  t.check(notices().length===7&&emails().length===7,"a second job run queues no duplicate notices or emails");
}});
module.exports=cases;
