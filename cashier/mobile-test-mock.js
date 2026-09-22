/* Cashier Ledger MOBILE QA ONLY. Uses synthetic records and refuses all production Supabase requests. */
(function(){
  'use strict';
  const owner='10000000-0000-4000-8000-000000000001';
  const customer='20000000-0000-4000-8000-000000000002';
  const altCustomer='20000000-0000-4000-8000-000000000003';
  const key='cashier_mobile_qa_synthetic_v1';
  const apiRoot='https://cashier-preview.invalid';
  function id(){return crypto.randomUUID()}
  function now(){return new Date().toISOString()}
  function seed(){
    return {
      version:1,
      customers:[
       {id:customer,user_id:owner,name:'أحمد التجريبي',phone:'000000000',notes:'بيانات وهمية',is_archived:false,created_at:now(),updated_at:now()},
       {id:altCustomer,user_id:owner,name:'ليلى التجريبية',phone:'000000001',notes:'بيانات وهمية',is_archived:false,created_at:now(),updated_at:now()}
      ],
      journal:[{id:id(),owner_id:owner,subject_id:customer,category:'charge',currency:'USD',value:100,secondary_value:0,delta:100,note:'دين تجريبي أولي',related_id:null,happened_at:now(),created_at:now()}],
      audit_events:[],ledger_audit:[],ledger_payments:[],ledger_payment_parts:[],ledger_cash_movements:[],ledger_day_closings:[],
      ledger_staff_members:[],ledger_portal_disputes:[],
      accounts:[
       {id:'40000000-0000-4000-8000-000000000004',owner_id:owner,label:'دولار نقدي تجريبي',channel:'cash',currency:'USD',active:true,created_at:now()},
       {id:'50000000-0000-4000-8000-000000000005',owner_id:owner,label:'شام كاش تجريبي',channel:'sham_cash',currency:'SYP',active:true,created_at:now()},
       {id:'60000000-0000-4000-8000-000000000006',owner_id:owner,label:'USDT تجريبي',channel:'usdt',currency:'USDT',active:true,created_at:now()}
      ],
      portalCode:'LC-'+ 'A'.repeat(32)
    };
  }
  let state;
  try{state=JSON.parse(localStorage.getItem(key)||'null')}catch(_){state=null}
  if(!state||state.version!==1)state=seed();
  function save(){localStorage.setItem(key,JSON.stringify(state))}
  save();
  const session={access_token:'qa-only-demo-token',refresh_token:'qa-only-demo-refresh',user:{id:owner,email:'demo@cashier.invalid'}};
  if(location.pathname.endsWith('mobile-test.html')){
    localStorage.setItem('cs',JSON.stringify(session));
    localStorage.setItem('last',JSON.stringify({id:owner,email:session.user.email}));
    const locallyCached={user:session.user,customers:state.customers,journal:state.journal,audit:state.audit_events,out:[]};
    localStorage.setItem('cc_'+owner,JSON.stringify(locallyCached));
  }
  window.CASHIER_MOBILE_DEMO=true;
  window.resetCashierMobileDemo=function(){localStorage.removeItem(key);localStorage.removeItem('cc_'+owner);location.reload()};
  function response(obj,status=200){return new Response(status===204?'':JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}})}
  function money(x,c){return +(Math.round((x+Number.EPSILON)*100)/100).toFixed(2)}
  function balances(){
    return state.accounts.map(a=>{
       const paymentSum=state.ledger_payment_parts.filter(p=>p.account_id===a.id).reduce((sum,p)=>{
         const parent=state.ledger_payments.find(x=>x.id===p.payment_id);
         return sum+(parent&&['confirmed','reversed'].includes(parent.state)?p.amount:0);
       },0);
       const movementSum=state.ledger_cash_movements.filter(x=>x.account_id===a.id).reduce((sum,x)=>sum+x.amount,0);
       return {account_id:a.id,label:a.label,channel:a.channel,currency:a.currency,expected:paymentSum+movementSum};
    });
  }
  function statement(code){
    if(code!==state.portalCode)return null;
    const entries=state.journal.filter(j=>j.subject_id===customer).slice().reverse().map(j=>{
      const payment=state.ledger_payments.find(p=>p.journal_id===j.id);
      return {id:j.id,date:j.happened_at,category:j.category,currency:j.currency,amount:j.value,
        balance_change:j.delta,note:j.note,related_id:j.related_id,
        payment_details:payment?{fx_syp_per_usd:payment.fx_syp_per_usd,usdt_usd_rate:payment.usdt_usd_rate,
          legs:state.ledger_payment_parts.filter(p=>p.payment_id===payment.id).map(p=>{
           const a=state.accounts.find(x=>x.id===p.account_id)||{};
           return {wallet:a.label||'',method:a.channel||'',currency:p.currency,amount:p.amount};
          })}:null
      };
    });
    return {customer:{name:state.customers[0].name},balance:{
      USD:state.journal.filter(j=>j.subject_id===customer&&j.currency==='USD').reduce((s,j)=>s+j.delta,0),
      SYP:state.journal.filter(j=>j.subject_id===customer&&j.currency==='SYP').reduce((s,j)=>s+j.delta,0)},
      entries,disputes:state.ledger_portal_disputes.filter(d=>d.customer_id===customer).map(d=>({
        id:d.id,journal_id:d.journal_id,status:d.status,reason:d.reason,response:d.owner_note,created_at:d.created_at}))};
  }
  function checkOwner(o){return o===owner}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,options){
     const url=typeof input==='string'?input:input.url;
     if(url.includes('.supabase.co'))throw new Error('DEMO_BLOCKED_REAL_SUPABASE');
     if(!url.startsWith(apiRoot))return nativeFetch(input,options);
     const pathname=url.slice(apiRoot.length).split('?')[0],method=(options&&options.method||'GET').toUpperCase();
     let req={};try{req=JSON.parse(options&&options.body||'{}')}catch(_){}
     if(pathname==='/rest/v1/rpc/is_cashier_invite_admin')return response(false);
     if(pathname==='/rest/v1/rpc/ledger_issue_portal_code'){
       if(!state.customers.some(c=>c.id===req.p_customer_id))return response({message:'CUSTOMER_NOT_FOUND'},403);
       state.portalCode='LC-'+id().replace(/-/g,'').toUpperCase();
       save();return response(state.portalCode)
     }
     if(pathname==='/rest/v1/rpc/ledger_portal_statement'){
       const data=statement(String(req.p_code||'').trim().toUpperCase());
       return data?response(data):response({message:'INVALID_OR_REVOKED_CODE'},401)
     }
     if(pathname==='/rest/v1/rpc/ledger_portal_dispute'){
       if(req.p_code!==state.portalCode||!state.journal.some(j=>j.id===req.p_journal_id&&j.subject_id===customer))
         return response({message:'NOT_ALLOWED'},403);
       const dispute={id:id(),owner_id:owner,customer_id:customer,journal_id:req.p_journal_id,reason:String(req.p_reason||''),
         status:'open',owner_note:null,created_at:now()};
       if(state.ledger_portal_disputes.some(d=>d.journal_id===req.p_journal_id))return response({message:'DISPUTE_EXISTS'},409);
       state.ledger_portal_disputes.unshift(dispute);save();return response(dispute.id)
     }
     if(pathname==='/rest/v1/rpc/ledger_prepare_payment'){
       if(!checkOwner(req.p_owner))return response({message:'NOT_ALLOWED'},403);
       const existing=state.ledger_payments.find(p=>p.request_id===req.p_request_id);
       if(existing)return response({id:existing.id,state:existing.state,settled_amount:existing.settled_amount,duplicate:true});
       const fx=Number(req.p_fx_syp_per_usd), rate=Number(req.p_usdt_usd_rate),legs=req.p_legs;
       if(!(fx>0&&rate>0)||!Array.isArray(legs)||legs.length<1||legs.length>8)return response({message:'INVALID_PAYMENT_REQUEST'},400);
       let usd=0;
       for(const leg of legs){const a=state.accounts.find(x=>x.id===leg.account_id),amt=Number(leg.amount);
         if(!a||!(amt>0))return response({message:'INVALID_ACCOUNT_OR_AMOUNT'},400);
         usd+=(a.currency==='USD'?amt:a.currency==='SYP'?amt/fx:amt*rate);
       }
       const settled=money(req.p_debt_currency==='SYP'?usd*fx:usd);
       const payment={id:id(),owner_id:owner,customer_id:req.p_customer,request_id:req.p_request_id,
         debt_currency:req.p_debt_currency,fx_syp_per_usd:fx,usdt_usd_rate:rate,
         settled_amount:settled,state:'pending',memo:req.p_note||'',created_at:now(),confirmed_at:null,journal_id:null};
       state.ledger_payments.unshift(payment);
       legs.forEach(leg=>{const account=state.accounts.find(a=>a.id===leg.account_id);
         state.ledger_payment_parts.push({id:id(),owner_id:owner,payment_id:payment.id,account_id:account.id,
            currency:account.currency,amount:Number(leg.amount)});
       });
       save();return response({id:payment.id,settled_amount:settled,currency:req.p_debt_currency,state:'pending'})
     }
     if(pathname==='/rest/v1/rpc/ledger_confirm_payment'){
       const p=state.ledger_payments.find(x=>x.id===req.p_payment&&req.p_owner===owner);
       if(!p)return response({message:'PAYMENT_NOT_FOUND'},404);
       if(p.state==='confirmed')return response({state:'confirmed',journal_id:p.journal_id,duplicate:true});
       if(p.state!=='pending')return response({message:'PAYMENT_NOT_PENDING'},400);
       const debt=state.journal.filter(j=>j.subject_id===p.customer_id&&j.currency===p.debt_currency).reduce((s,j)=>s+j.delta,0);
       if(p.settled_amount>debt)return response({message:'PAYMENT_EXCEEDS_DEBT'},400);
       const journalId=id();
       state.journal.push({id:journalId,owner_id:owner,subject_id:p.customer_id,category:'receipt',currency:p.debt_currency,
         value:p.settled_amount,secondary_value:0,delta:-p.settled_amount,
         note:'دفعة متعددة القنوات #'+p.id+' | '+p.memo,related_id:null,happened_at:now(),created_at:now()});
       p.state='confirmed';p.confirmed_at=now();p.journal_id=journalId;save();
       return response({state:'confirmed',journal_id:journalId,duplicate:false})
     }
     if(pathname==='/rest/v1/rpc/ledger_reject_payment'){
       const p=state.ledger_payments.find(x=>x.id===req.p_payment&&req.p_owner===owner);
       if(!p||p.state!=='pending')return response({message:'PAYMENT_NOT_PENDING'},400);
       p.state='rejected';p.memo+=' | مرفوض: '+req.p_reason;save();return response({state:'rejected'})
     }
     if(pathname==='/rest/v1/rpc/ledger_cash_balances')return response(balances());
     if(pathname==='/rest/v1/rpc/ledger_close_day'){
       const a=state.accounts.find(x=>x.id===req.p_account);
       if(!a)return response({message:'ACCOUNT_NOT_FOUND'},400);
       if(state.ledger_day_closings.some(x=>x.account_id===a.id&&x.local_day===req.p_day))
         return response({message:'DAY_ALREADY_CLOSED'},409);
       const expected=balances().find(x=>x.account_id===a.id).expected;
       const close={id:id(),owner_id:owner,account_id:a.id,local_day:req.p_day,expected_balance:expected,
         counted_balance:Number(req.p_counted),difference:Number(req.p_counted)-expected,note:req.p_note,closed_by:owner,closed_at:now()};
       state.ledger_day_closings.unshift(close);save();
       return response({id:close.id,expected,counted:close.counted_balance,difference:close.difference})
     }
     if(pathname==='/rest/v1/rpc/ledger_add_cash_movement'){
       const movement={id:id(),owner_id:owner,account_id:req.p_account,amount:Number(req.p_amount),
          reason:req.p_reason,note:req.p_note,related_id:req.p_related,created_by:owner,created_at:now()};
       state.ledger_cash_movements.push(movement);save();return response(movement.id)
     }
     if(pathname==='/rest/v1/rpc/ledger_reverse_payment'){
       const p=state.ledger_payments.find(x=>x.id===req.p_payment);
       if(!p||p.state!=='confirmed')return response({message:'PAYMENT_NOT_CONFIRMED'},400);
       const old=state.journal.find(j=>j.id===p.journal_id);
       const reversed={...old,id:id(),category:'receipt_reversal',value:-old.value,delta:-old.delta,
         related_id:old.id,note:'عكس: '+req.p_reason,happened_at:now(),created_at:now()};
       state.journal.push(reversed);
       state.ledger_payment_parts.filter(x=>x.payment_id===p.id).forEach(leg=>state.ledger_cash_movements.push({
         id:id(),owner_id:owner,account_id:leg.account_id,amount:-leg.amount,reason:'correction',
         note:'عكس: '+req.p_reason,created_by:owner,created_at:now()}));
       p.state='reversed';save();return response({state:'reversed',journal_id:reversed.id,duplicate:false})
     }
     if(pathname==='/rest/v1/rpc/ledger_assign_staff')return response({status:'active',role:req.p_role});
     if(pathname==='/rest/v1/rpc/ledger_disable_staff')return response({active:false});
     const table=pathname.replace('/rest/v1/','');
     const map={customers:'customers',journal:'journal',audit_events:'audit_events',ledger_audit:'ledger_audit',
       ledger_staff_members:'ledger_staff_members',ledger_payments:'ledger_payments',
       ledger_cash_accounts:'accounts',ledger_portal_disputes:'ledger_portal_disputes',
       ledger_day_closings:'ledger_day_closings'};
     if(!map[table])return response({message:'DEMO_NOT_IMPLEMENTED: '+pathname},404);
     const rows=state[map[table]];
     if(method==='GET')return response(table==='ledger_portal_disputes'?rows.filter(x=>x.owner_id===owner):rows);
     if(method==='POST'){
       const items=Array.isArray(req)?req:[req];
       for(const item of items)if(!rows.some(x=>x.id===item.id))rows.push(item);
       save();return response(items,201)
     }
     if(method==='PATCH'&&table==='ledger_portal_disputes'){
        const u=new URL(url);const disputeId=(u.searchParams.get('id')||'').replace(/^eq\./,'');
        const record=rows.find(x=>x.id===disputeId);
        if(record)Object.assign(record,req);save();return response(record?[record]:[]);
     }
     return response({message:'DEMO_REQUEST_NOT_SUPPORTED'},400)
  };
})();