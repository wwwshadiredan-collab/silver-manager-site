/* The app shell and the no-email customer portal must never overwrite each other's offline cache. */
const C='cashier-v14';
const ASSETS=['./','./cashier-icon-192.png','./cashier-icon-512.png',
 './manifest.webmanifest','./ledger-v2.js','./ledger-v2.css','./customer-portal.html'];
self.addEventListener('install',e=>e.waitUntil(
 caches.open(C).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
 self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(
 k=>k.startsWith('cashier-v')&&k!==C).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin)return;
 if(req.mode==='navigate'){
  e.respondWith((async()=>{
   const cache=await caches.open(C);
   try{const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response}
   catch(error){
    const exact=await cache.match(req,{ignoreSearch:true});if(exact)return exact;
    const path=new URL('./',location.href).pathname;
    if(url.pathname===path||url.pathname===path+'index.html'){
     const app=await cache.match('./');if(app)return app
    }
    if(url.pathname===path+'customer-portal.html'){
     const portal=await cache.match('./customer-portal.html');if(portal)return portal
    }
    throw error
   }
  })());return;
 }
 e.respondWith(caches.match(req).then(response=>response||fetch(req).then(async fetched=>{
  if(fetched.ok){const cache=await caches.open(C);await cache.put(req,fetched.clone())}
  return fetched
 })));
});
