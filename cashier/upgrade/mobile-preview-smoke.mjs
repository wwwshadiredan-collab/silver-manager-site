/* Chromium mobile-viewport regression for synthetic preview. NEVER uses live customer data. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname.replace(/^\/silver-manager-site\//,'/');
  const file=resolve(root,'.'+(path==='/cashier/'?'/cashier/mobile-test.html':path));
  if(!file.startsWith(root+sep))throw Error('forbidden path');
  const bytes=await readFile(file);
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
  res.end(bytes);
 }catch(e){res.writeHead(404).end(String(e.message))}
});
await new Promise(ready=>server.listen(0,'127.0.0.1',ready));
const base='http://127.0.0.1:'+server.address().port+'/silver-manager-site/cashier/';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
const page=await context.newPage(),errors=[],realCalls=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('request',req=>{if(req.url().includes('.supabase.co'))realCalls.push(req.url())});
let qaPrompts=[];
page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?(qaPrompts.length?qaPrompts.shift():'المبلغ غير صحيح'):undefined));
try{
 await page.goto(base+'mobile-test.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#clist')?.textContent?.includes('أحمد التجريبي'));
 await page.waitForFunction(()=>document.querySelector('#ledgerV2')?.classList.contains('on'));
 assert.equal(await page.locator('#qaOpenMixedPayment').isVisible(),true);
 assert.match(await page.locator('#qa-mobile-banner').innerText(),/بيانات وهمية/);
 console.log('PASS mobile preview opens mixed-payment cashbox by default and shows a prominent button');
 await page.locator('nav.bottom button[data-v="ledgerV2"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#v2Customer option').length>=3);
 assert.equal(await page.locator('#v2Accounts .v2-item').count(),3);
 const customer='20000000-0000-4000-8000-000000000002';
 await page.selectOption('#v2Customer',customer);
 await page.fill('#v2FX','10000');
 await page.fill('#v2USDT','1');
 await page.selectOption('#v2Legs .v2-leg:nth-child(1) select','40000000-0000-4000-8000-000000000004');
 await page.fill('#v2Legs .v2-leg:nth-child(1) input','30');
 await page.getByRole('button',{name:/إضافة محفظة أو عملة/}).click();
 await page.selectOption('#v2Legs .v2-leg:nth-child(2) select','50000000-0000-4000-8000-000000000005');
 await page.fill('#v2Legs .v2-leg:nth-child(2) input','200000');
 await page.getByRole('button',{name:/إضافة محفظة أو عملة/}).click();
 await page.selectOption('#v2Legs .v2-leg:nth-child(3) select','60000000-0000-4000-8000-000000000006');
 await page.fill('#v2Legs .v2-leg:nth-child(3) input','10');
 await page.locator('#v2PrepareBtn').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')||'{}').ledger_payments?.some(p=>p.state==='pending'));
 await page.waitForFunction(()=>document.querySelector('#v2Pending')?.textContent?.includes('بانتظار التأكيد'));
 const staged=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(staged.ledger_payments[0].settled_amount,60);
 assert.equal(staged.ledger_payments[0].state,'pending');
 assert.equal(staged.journal.filter(j=>j.category==='receipt').length,0);
 console.log('PASS mobile 30 USD + 200000 SYP + 10 USDT = pending 60 USD; no early debit');
 await page.locator('#v2Pending button').filter({hasText:'تأكيد الاستلام والخصم'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2History')?.textContent?.includes('مؤكد'));
 const accepted=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(accepted.ledger_payments[0].state,'confirmed');
 assert.equal(accepted.journal.find(j=>j.category==='receipt').delta,-60);
 console.log('PASS explicit manual approval deducts debt once, all three wallets recorded');
 // Regression: closing a wallet must prohibit later movement AND preserve the original day-end snapshot.
 const today=await page.evaluate(()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Damascus',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(p=>p.type===t).value;return part('year')+'-'+part('month')+'-'+part('day')});
 const cash=page.locator('#v2Accounts .v2-item').filter({hasText:'دولار نقدي تجريبي'});
 qaPrompts=[today,'29','اختبار إغلاق الصندوق'];
 await cash.getByRole('button',{name:'تسوية اليوم'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2Closings')?.textContent?.includes('دولار نقدي تجريبي'));
 const closed=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 const latestClose=closed.ledger_day_closings.find(x=>x.account_id==='40000000-0000-4000-8000-000000000004');
 assert.equal(latestClose.expected_balance,30);
 assert.equal(latestClose.counted_balance,29);
 assert.equal(latestClose.difference,-1);
 const movementsBefore=closed.ledger_cash_movements.length;
 const balancesBefore=await page.locator('#v2Accounts').innerText();
 qaPrompts=['10','deposit','اختبار إيداع مرفوض بعد الإغلاق'];
 await cash.getByRole('button',{name:'حركة صندوق'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2Message')?.textContent?.includes('الصندوق مُغلق اليوم'));
 const afterBlocked=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(afterBlocked.ledger_cash_movements.length,movementsBefore,'mock must reject after-close +10 USD');
 assert.equal(afterBlocked.ledger_day_closings.length,closed.ledger_day_closings.length);
 assert.deepEqual(afterBlocked.ledger_day_closings[0],latestClose);
 assert.equal(await page.locator('#v2Accounts').innerText(),balancesBefore,'shown balances cannot change after rejection');
 console.log('PASS after-close +10 USD deposit rejected by mock RPC; cash balance, previous close and history unchanged');
 qaPrompts=[today,'29','اختبار التسوية المكررة'];
 await cash.getByRole('button',{name:'تسوية اليوم'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2Message')?.textContent?.includes('تسويته مسبقاً'));
 const afterDuplicate=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(afterDuplicate.ledger_day_closings.length,closed.ledger_day_closings.length);
 console.log('PASS second daily close is refused and the first variance stays immutable');
 await page.goto(base+'mobile-test-customer.html',{waitUntil:'domcontentloaded'});
 await page.fill('#portalCode','LC-'+'A'.repeat(32));
 await page.locator('#portalEnter').click();
 await page.waitForFunction(()=>document.querySelector('#entryList')?.textContent?.includes('شام كاش تجريبي'));
 assert.match(await page.locator('#entryList').innerText(),/USDT/);
 assert.match(await page.locator('#balanceUSD').innerText(),/٤٠|40/);
 await page.getByRole('button',{name:'اعتراض على العملية'}).first().click();
 await page.waitForFunction(()=>document.querySelector('#disputeList')?.textContent?.includes('المبلغ غير صحيح'));
 console.log('PASS synthetic customer code, own statement with rate and wallet breakdown, dispute');
 await page.goto(base+'mobile-test.html',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'تصفير التجربة'}).click();
 await page.waitForFunction(()=>document.querySelector('#clist')?.textContent?.includes('أحمد التجريبي'));
 const reset=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(reset.ledger_payments.length,0);
 assert.equal(reset.journal.length,1);
 console.log('PASS reset synthetic state');

 // Reproduce the iPhone report exactly: deposit 20, count 10 at closing (variance -10),
 // then try a +10 deposit. Both the UI and mock RPC must reject it; original close stays.
 await page.waitForFunction(()=>document.querySelector('#v2Accounts')?.textContent?.includes('دولار نقدي تجريبي'));
 const cashAfterReset=page.locator('#v2Accounts .v2-item').filter({hasText:'دولار نقدي تجريبي'});
 qaPrompts=['20','deposit','رصيد أولي للتجربة'];
 await cashAfterReset.getByRole('button',{name:'حركة صندوق'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2Message')?.textContent?.includes('تمت إضافة حركة'));
 const firstDeposit=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(firstDeposit.ledger_cash_movements.length,1);
 assert.equal(firstDeposit.ledger_cash_movements[0].amount,20);
 qaPrompts=[today,'10','اختبار الفرق ناقص عشرة'];
 await cashAfterReset.getByRole('button',{name:'تسوية اليوم'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2Closings')?.textContent?.includes('دولار نقدي تجريبي'));
 const afterClose=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(afterClose.ledger_day_closings.length,1);
 assert.equal(afterClose.ledger_day_closings[0].expected_balance,20);
 assert.equal(afterClose.ledger_day_closings[0].counted_balance,10);
 assert.equal(afterClose.ledger_day_closings[0].difference,-10);
 assert.match(await cashAfterReset.innerText(),/مغلق اليوم/);
 await cashAfterReset.getByRole('button',{name:'حركة صندوق'}).click();
 await page.waitForFunction(()=>document.querySelector('#v2Message')?.textContent?.includes('الصندوق مُغلق اليوم'));
 // Deliberately bypass the UI to verify the MOCK SERVER still blocks +10.
 const blockedRpc=await page.evaluate(async({owner,account})=>{
   const res=await fetch('https://cashier-preview.invalid/rest/v1/rpc/ledger_add_cash_movement',{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
       p_owner:owner,p_account:account,p_amount:10,p_reason:'deposit',
       p_note:'server rejection regression'
     })
   });
   return {status:res.status,data:await res.json()};
 },{owner:'10000000-0000-4000-8000-000000000001',account:'40000000-0000-4000-8000-000000000004'});
 assert.equal(blockedRpc.status,409);
 assert.equal(blockedRpc.data.message,'CASH_ACCOUNT_ALREADY_CLOSED_TODAY');
 const afterAttempt=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(afterAttempt.ledger_cash_movements.length,1);
 assert.equal(afterAttempt.ledger_cash_movements[0].amount,20);
 assert.equal(afterAttempt.ledger_day_closings.length,1);
 assert.equal(afterAttempt.ledger_day_closings[0].difference,-10);
 console.log('PASS iPhone repro: deposit 20 / close counted 10 = -10 variance; post-close +10 blocked in UI AND RPC, balance stays 20');

 // Historical invalid synthetic entries from the earlier mock must be identified,
 // not silently deleted or counted as a valid new close.
 await page.evaluate(()=>{
   const key='cashier_mobile_qa_synthetic_v1';
   const state=JSON.parse(localStorage.getItem(key));
   const closing=state.ledger_day_closings[0];
   state.ledger_cash_movements.push({id:crypto.randomUUID(),owner_id:closing.owner_id,
      account_id:closing.account_id,amount:10,reason:'deposit',
      note:'old buggy demo entry',created_by:closing.closed_by,
      created_at:new Date(Date.parse(closing.closed_at)+1000).toISOString()});
   localStorage.setItem(key,JSON.stringify(state));
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('[role=alert]')?.textContent?.includes('حركة اختبار قديمة'));
 assert.equal(await page.locator('[role=alert]').count(),1);
 console.log('PASS old +10 demo record after close is flagged for reset without silent deletion');

 await page.getByRole('button',{name:'تصفير التجربة'}).click();
 await page.waitForFunction(()=>document.querySelector('#clist')?.textContent?.includes('أحمد التجريبي'));
 const clean=await page.evaluate(()=>JSON.parse(localStorage.getItem('cashier_mobile_qa_synthetic_v1')));
 assert.equal(clean.ledger_cash_movements.length,0);
 assert.equal(clean.ledger_day_closings.length,0);
 assert.deepEqual(realCalls,[]);
 assert.deepEqual(errors,[]);
 console.log('PASS mock isolation: no production Supabase requests and zero uncaught errors');
}finally{
 await context.close();await browser.close();await new Promise(done=>server.close(done));
}
