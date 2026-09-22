// Browser test for the existing Cashier Ledger branch, with mocked API responses.
// It never accesses or mutates real Supabase customer data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const tenant='https://yfiwexcpkrnfoujgxlcv.supabase.co';
const owner='10000000-0000-4000-8000-000000000001';
const customer='20000000-0000-4000-8000-000000000002';
const code='LC-'+'A'.repeat(32);
const txid='30000000-0000-4000-8000-000000000003';
const today='2026-09-23T11:00:00Z';
const accounts=[
 {id:'40000000-0000-4000-8000-000000000004',owner_id:owner,currency:'USD',label:'Cash USD',channel:'cash',active:true},
 {id:'50000000-0000-4000-8000-000000000005',owner_id:owner,currency:'SYP',label:'Sham Cash',channel:'sham_cash',active:true},
 {id:'60000000-0000-4000-8000-000000000006',owner_id:owner,currency:'USDT',label:'USDT wallet',channel:'usdt',active:true}
];
const customers=[{id:customer,user_id:owner,name:'QA Customer',phone:null,is_archived:false,created_at:today}];
const journal=[{id:txid,owner_id:owner,subject_id:customer,category:'charge',value:50,secondary_value:0,delta:50,currency:'USD',note:'QA charge',related_id:null,happened_at:today,created_at:today}];
let pending=null,disputes=[],confirmed=false,postDirectJournal=0,prepareCalls=0,confirmCalls=0;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const requested=new URL(req.url,'http://localhost').pathname.replace(/^\/silver-manager-site\//,'/');
  const local=requested==='/cashier/'?'/cashier/index.html':requested;
  const full=resolve(repoRoot,'.'+local);
  if(!full.startsWith(repoRoot+sep)){res.writeHead(403).end();return}
  const content=await readFile(full);
  res.writeHead(200,{'content-type':types[extname(full)]||'application/octet-stream','cache-control':'no-store'});
  res.end(content);
 }catch(error){res.writeHead(404).end(String(error.message))}
});
await new Promise(resolveStart=>server.listen(0,'127.0.0.1',resolveStart));
const base='http://127.0.0.1:'+server.address().port+'/silver-manager-site/cashier/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
const apiHeaders={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'};
await context.route(tenant+'/**',async(route)=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:apiHeaders,body:''});return}
 const body=req.postDataJSON?.()||{};
 let payload=null,status=200;
 if(path==='/rest/v1/customers')payload=customers;
 else if(path==='/rest/v1/journal'){
  if(req.method()!=='GET')postDirectJournal++;
  payload=journal;
 }
 else if(path==='/rest/v1/audit_events'||path==='/rest/v1/ledger_staff_members'||
    path==='/rest/v1/ledger_day_closings'||path==='/rest/v1/ledger_audit')payload=[];
 else if(path==='/rest/v1/ledger_cash_accounts')payload=accounts;
 else if(path==='/rest/v1/ledger_payments')payload=pending?[pending]:[];
 else if(path==='/rest/v1/ledger_portal_disputes')payload=disputes;
 else if(path==='/rest/v1/rpc/is_cashier_invite_admin')payload=false;
 else if(path==='/rest/v1/rpc/ledger_cash_balances')payload=accounts.map(a=>({account_id:a.id,expected:confirmed?(a.currency==='USD'?3:a.currency==='SYP'?20000:5):0}));
 else if(path==='/rest/v1/rpc/ledger_prepare_payment'){
  prepareCalls++;
  assert.equal(body.p_fx_syp_per_usd,10000);
  assert.equal(body.p_usdt_usd_rate,1);
  assert.equal(body.p_legs.length,3);
  pending={id:'70000000-0000-4000-8000-000000000007',owner_id:owner,
   customer_id:customer,state:'pending',debt_currency:'USD',fx_syp_per_usd:10000,
   settled_amount:10,created_at:today,memo:'QA three wallets'};
  payload={id:pending.id,state:'pending',settled_amount:10};
 }
 else if(path==='/rest/v1/rpc/ledger_confirm_payment'){
  confirmCalls++;
  assert.equal(body.p_payment,pending.id);
  if(!confirmed){
   confirmed=true;pending.state='confirmed';pending.confirmed_at=today;
   journal.push({id:'80000000-0000-4000-8000-000000000008',owner_id:owner,
     subject_id:customer,category:'receipt',currency:'USD',value:10,delta:-10,
     secondary_value:0,note:'QA mixed receipt',happened_at:today,created_at:today});
  }
  payload={state:'confirmed',journal_id:journal[1].id};
 }
 else if(path==='/rest/v1/rpc/ledger_portal_statement'){
  if(body.p_code!==code){status=401;payload={message:'INVALID_OR_REVOKED_CODE'}}
  else payload={customer:{name:'QA Customer'},balance:{USD:40,SYP:0},
    entries:[{...journal[1],date:today,amount:10,balance_change:-10,
     payment_details:{fx_syp_per_usd:10000,usdt_usd_rate:1,
       legs:accounts.map((a,i)=>({wallet:a.label,method:a.channel,currency:a.currency,amount:[3,20000,5][i]}))}}],
    disputes};
 }
 else if(path==='/rest/v1/rpc/ledger_portal_dispute'){
  assert.equal(body.p_code,code);
  assert.equal(body.p_journal_id,journal[1].id);
  disputes.push({id:'90000000-0000-4000-8000-000000000009',
    journal_id:journal[1].id,status:'open',reason:body.p_reason,created_at:today});
  payload=disputes[0].id;
 }
 else {status=404;payload={message:'Mock route not implemented: '+path}}
 await route.fulfill({status,headers:apiHeaders,body:JSON.stringify(payload)});
});
const page=await context.newPage();
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'المبلغ غير صحيح':undefined));
await page.addInitScript(({id})=>{
 const session={access_token:'e2e-stub',refresh_token:'e2e-stub',user:{id,email:'qa-owner@example.test'}};
 localStorage.setItem('cs',JSON.stringify(session));
},{id:owner});
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#clist')?.textContent?.includes('QA Customer'));
 await page.locator('nav.bottom button[data-v="ledgerV2"]').click();
 await page.waitForFunction(()=>document.querySelector('#v2Customer option[value]')?.value!==undefined &&
    document.querySelectorAll('#v2Customer option').length>1);
 await page.selectOption('#v2Customer',customer);
 await page.fill('#v2FX','10000');
 await page.fill('#v2USDT','1');
 await page.selectOption('#v2Legs .v2-leg:nth-child(1) select',accounts[0].id);
 await page.fill('#v2Legs .v2-leg:nth-child(1) input','3');
 await page.getByRole('button',{name:/إضافة محفظة أو عملة/}).click();
 await page.selectOption('#v2Legs .v2-leg:nth-child(2) select',accounts[1].id);
 await page.fill('#v2Legs .v2-leg:nth-child(2) input','20000');
 await page.getByRole('button',{name:/إضافة محفظة أو عملة/}).click();
 await page.selectOption('#v2Legs .v2-leg:nth-child(3) select',accounts[2].id);
 await page.fill('#v2Legs .v2-leg:nth-child(3) input','5');
 await page.waitForFunction(()=>document.querySelector('#v2Preview')?.textContent?.includes('USD'));
 await page.locator('#v2PrepareBtn').click();
 await page.waitForFunction(()=>document.querySelector('#v2Pending')?.textContent?.includes('بانتظار التأكيد'));
 assert.equal(prepareCalls,1);
 assert.equal(journal.length,1,'Pending payments must not affect customer debt');
 await page.locator('#v2Pending button').filter({hasText:'تأكيد الاستلام والخصم'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2History')?.textContent?.includes('مؤكد'));
 assert.equal(confirmCalls,1);
 assert.equal(journal.length,2);
 assert.equal(journal[1].delta,-10);
 assert.equal(postDirectJournal,0,'Only the server RPC may post v2 financial events');
 console.log('PASS: mobile owner form, three wallets, pending no-debit, manual confirmation, ledger effect');

 await page.goto(base+'customer-portal.html',{waitUntil:'domcontentloaded'});
 await page.fill('#portalCode',code);
 await page.locator('#portalEnter').click();
 await page.waitForFunction(()=>document.querySelector('#entryList')?.textContent?.includes('Sham Cash'));
 assert.match(await page.locator('#balanceUSD').textContent(),/USD/);
 await page.getByRole('button',{name:'اعتراض على العملية'}).click();
 await page.waitForFunction(()=>document.querySelector('#disputeList')?.textContent?.includes('المبلغ غير صحيح'));
 console.log('PASS: code-only customer statement, FX breakdown and dispute');

 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.goto(base+'customer-portal.html',{waitUntil:'domcontentloaded'});
 await context.setOffline(true);
 await page.goto(base,{waitUntil:'domcontentloaded'});
 assert.match(await page.title(),/Cashier ledger/i);
 await page.goto(base+'customer-portal.html',{waitUntil:'domcontentloaded'});
 assert.match(await page.title(),/كشف حساب الزبون/);
 console.log('PASS: actual Chromium offline navigation after visiting both pages');
 assert.deepEqual(errors,[],'No uncaught page errors');
 console.log('PASS: no uncaught JavaScript exceptions');
}finally{
 await context.close();
 await browser.close();
 await new Promise(done=>server.close(done));
}
