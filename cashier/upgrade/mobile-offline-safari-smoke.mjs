/* Offline QA for standalone fake-data Safari preview. Chromium uses real Service Worker & offline networking. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.webmanifest':'application/manifest+json','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname.replace(/^\/silver-manager-site\//,'/');
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep))throw Error('forbidden path');
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
  res.end(await readFile(file));
 }catch(e){res.writeHead(404).end(e.message)}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port+'/silver-manager-site/cashier/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,
 hasTouch:true,serviceWorkers:'allow'});
const page=await context.newPage(),errors=[],realCalls=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().includes('.supabase.co'))realCalls.push(r.url())});
const owner='10000000-0000-4000-8000-000000000001';
const storageKey='cashier_mobile_offline_qa_synthetic_v1';
try{
 await page.goto(base+'mobile-offline-test.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#qaOfflineCache')?.textContent?.includes('جاهز للأوفلاين'),
  null,{timeout:15000});
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:15000});
 await page.waitForFunction(()=>D?.user?.id==='10000000-0000-4000-8000-000000000001'&&
   D.customers?.some(x=>x.name==='أحمد التجريبي'),null,{timeout:15000});
 const swCache=await page.evaluate(async()=>({
  ready:!!(await navigator.serviceWorker.ready)?.active,
  cached:await caches.open('cashier-mobile-offline-qa-v1')
    .then(async c=>!!(await c.match(new URL('./mobile-offline-test.html',location.href))))
 }));
 assert.equal(swCache.ready,true);assert.equal(swCache.cached,true);
 console.log('PASS real Service Worker installs and pre-caches fake Safari PWA HTML, JS and CSS');

 await context.setOffline(true);
 await page.goto(base+'mobile-offline-test.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>D?.user?.id==='10000000-0000-4000-8000-000000000001');
 assert.equal(await page.evaluate(()=>navigator.onLine),false);
 console.log('PASS offline navigation works after browser blocks ALL HTTP requests');
 await page.evaluate(()=>view('customers'));
 await page.getByRole('button',{name:'+ عميل'}).first().click();
 await page.locator('#cn').fill('اختبار أوفلاين آيفون');
 await page.locator('#cust').getByRole('button',{name:'حفظ'}).click();
 await page.waitForFunction(()=>D.customers.some(c=>c.name==='اختبار أوفلاين آيفون'));
 const id=await page.evaluate(()=>D.customers.find(x=>x.name==='اختبار أوفلاين آيفون').id);
 await page.evaluate(customer=>openEntry('charge',customer),id);
 await page.locator('#ea').fill('20');
 await page.locator('#ecur').selectOption('USD');
 await page.locator('#entry').getByRole('button',{name:'حفظ'}).click();
 await page.waitForFunction(customer=>D.journal.some(j=>j.subject_id===customer&&j.delta===20),id);
 const offlineState=await page.evaluate(({owner,key,id})=>{
  const cached=JSON.parse(localStorage.getItem('cc_'+owner)),
   server=JSON.parse(localStorage.getItem(key));
  return {pending:cached.out.length,localDebt:cached.journal.filter(x=>x.subject_id===id).reduce((s,j)=>s+j.delta,0),
   remoteCustomers:server.customers.filter(x=>x.id===id).length,remoteJournal:server.journal.filter(x=>x.subject_id===id).length}
 },{owner,key:storageKey,id});
 assert.ok(offlineState.pending>=3);
 assert.equal(offlineState.localDebt,20);
 assert.equal(offlineState.remoteCustomers,0);
 assert.equal(offlineState.remoteJournal,0);
 console.log('PASS offline create customer and 20 USD charge queue locally; no mock-server posting');

 await page.goto(base+'mobile-offline-test.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(customer=>D?.customers?.some(c=>c.id===customer)&&
  D?.journal?.some(j=>j.subject_id===customer&&j.delta===20),id);
 assert.ok(await page.evaluate(()=>D.out.length)>=3);
 assert.equal(await page.evaluate(()=>navigator.onLine),false);
 console.log('PASS local customer, 20 USD debt and pending queue survive true offline page re-open');

 await page.evaluate(()=>window.view('ledgerV2'));
 const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).ledger_payments.length,storageKey);
 await page.evaluate(async()=>v2Prepare());
 await page.waitForFunction(()=>document.querySelector('#v2Message')?.textContent?.includes('اتصال إنترنت'));
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).ledger_payments.length,storageKey),before);
 console.log('PASS new mixed payment refuses offline requests and never creates a fake debt debit');

 await context.setOffline(false);
 await page.waitForFunction(customer=>{
  const persisted=JSON.parse(localStorage.getItem('cashier_mobile_offline_qa_synthetic_v1')||'{}');
  return D?.out?.length===0 && persisted.customers?.some(x=>x.id===customer) &&
     persisted.journal?.some(x=>x.subject_id===customer&&x.delta===20)
 },id,{timeout:15000});
 await page.goto(base+'mobile-offline-test.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>D?.out?.length===0);
 const onlineState=await page.evaluate(({owner,key,id})=>{
  const cached=JSON.parse(localStorage.getItem('cc_'+owner));
  const server=JSON.parse(localStorage.getItem(key));
  return {pending:cached.out.length,remoteCustomers:server.customers.filter(x=>x.id===id).length,
   remoteJournal:server.journal.filter(x=>x.subject_id===id),localJournal:cached.journal.filter(x=>x.subject_id===id)};
 },{owner,key:storageKey,id});
 assert.equal(onlineState.pending,0);
 assert.equal(onlineState.remoteCustomers,1);
 assert.equal(onlineState.remoteJournal.length,1);
 assert.equal(onlineState.remoteJournal[0].delta,20);
 assert.equal(onlineState.localJournal.length,1);
 console.log('PASS reconnect reconciles one fake customer and EXACTLY ONE 20 USD event, without duplication');
 assert.deepEqual(realCalls,[]);
 assert.deepEqual(errors,[]);
 console.log('PASS zero real Supabase network calls and zero browser exceptions');
}finally{
 await context.close();await browser.close();await new Promise(done=>server.close(done));
}
