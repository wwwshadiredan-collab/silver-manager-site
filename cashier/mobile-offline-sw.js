/* Safari mobile synthetic-only offline QA: cache no live financial pages or API responses.
   Registration scope is this QA branch path; safe to remove without touching production. */
'use strict';
const CACHE='cashier-mobile-offline-qa-v1';
const PREFIX='cashier-mobile-offline-qa-';
const BASE=new URL('./',self.location.href);
const ASSETS=[
 'mobile-offline-test.html','mobile-offline-mock.js','mobile-test-ledger-v2.js',
 'ledger-v2.css','mobile-offline-test.webmanifest',
 'cashier-icon-192.png','cashier-icon-512.png'
];
const PATHS=new Set(ASSETS.map(path=>new URL(path,BASE).pathname));
const TEST_PATH=new URL('mobile-offline-test.html',BASE).pathname;
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE)
  .then(cache=>cache.addAll(ASSETS.map(path=>new URL(path,BASE).href)))
  .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))
 ]));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==BASE.origin||!PATHS.has(url.pathname))return;
 if(url.pathname===TEST_PATH&&req.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{
    const fresh=await fetch(req);
    if(fresh.ok)await cache.put(new URL('mobile-offline-test.html',BASE).href,fresh.clone());
    return fresh;
   }catch(error){
    const offline=await cache.match(new URL('mobile-offline-test.html',BASE).href);
    if(offline)return offline;
    throw error;
   }
  })());
  return;
 }
 // Versioned QA script/icon/style files have already been pre-cached at install.
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
