/* Cashier Ledger extension on the EXISTING app, loaded after its legacy inline script.
   Financial RPCs intentionally require an active online session: no speculative/offline debits. */
var V2={userId:null,owner:null,role:'owner',workspaces:[],accounts:[],customers:[],payments:[],
 balances:[],disputes:[],audit:[],closings:[],members:[],requestId:null,loading:false,reloadRequested:false,initialized:false};
function v2Esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function v2Fmt(n,c){return Number(n||0).toLocaleString('ar-SY',{maximumFractionDigits:c==='SYP'?2:6})+' '+(c==='SYP'?'ل.س':c)}
function v2Date(s){return s?new Date(s).toLocaleString('ar-SY'):'—'}
function v2DamascusToday(){
 var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Damascus',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 var part=function(name){return parts.find(function(x){return x.type===name}).value};
 return part('year')+'-'+part('month')+'-'+part('day');
}
function v2ClosedToday(accountId){return V2.closings.some(function(c){return c.account_id===accountId&&c.local_day===v2DamascusToday()})}
function v2Warn(text,negative){var el=q('v2Message');if(el){el.textContent=text||'';el.style.color=negative?'#ff9cab':'#39d98a'}}
function v2Error(e){var str=String(e&&e.message||e||'تعذر تنفيذ الطلب');try{var j=JSON.parse(str);str=String(j.message||j.error||str)}catch(x){}if(str.includes('CASH_ACCOUNT_ALREADY_CLOSED_TODAY'))return 'الصندوق مُغلق اليوم. لا يمكن إضافة حركة بعد التسوية. لم يتغير الرصيد.';if(str.includes('DAY_ALREADY_CLOSED'))return 'هذا الصندوق تمت تسويته مسبقاً بنفس التاريخ. لم تتغير التسوية السابقة.';return str.slice(0,300)}
function v2Online(){if(!navigator.onLine||!S||!S.access_token)throw Error('الدفعات والصندوق يحتاجوا اتصال إنترنت وجلسة دخول فعالة. لم يُخصم أي مبلغ.')}
function v2CanCash(){return V2.role==='owner'||V2.role==='manager'||V2.role==='cashier'}
function v2CanManage(){return V2.role==='owner'||V2.role==='manager'}
function v2AccountName(id){var x=V2.accounts.find(function(a){return a.id===id});return x?x.label:'—'}
function v2CustomerName(id){var x=V2.customers.find(function(a){return a.id===id});return x?x.name:'—'}
function v2Field(){return '<option value="">اختار الصندوق أو المحفظة</option>'+V2.accounts.filter(function(a){return a.active}).map(function(a){return '<option value="'+v2Esc(a.id)+'">'+v2Esc(a.label)+' · '+v2Esc(a.currency)+'</option>'}).join('')}
function v2SetWorkspace(){V2.owner=q('v2Owner').value;V2.role=(V2.workspaces.find(function(w){return w.id===V2.owner})||{}).role||'viewer';v2Load(true)}
function v2Clear(){V2={userId:null,owner:null,role:'owner',workspaces:[],accounts:[],customers:[],payments:[],balances:[],disputes:[],audit:[],closings:[],members:[],requestId:null,loading:false,reloadRequested:false,initialized:false};['v2Accounts','v2Pending','v2History','v2Disputes','v2Audit','v2Closings','v2Legs','v2CustomerCodes'].forEach(function(id){var el=q(id);if(el)el.innerHTML=''});if(q('v2IssuedCode'))q('v2IssuedCode').value=''}
function v2Install(){
 if(V2.initialized)return;V2.initialized=true;
 var oldView=window.view;
 window.view=function(id){oldView(id);if(id==='ledgerV2')v2Load(false)};
 var oldLogout=window.logout;
 window.logout=function(){oldLogout();if(!D.user)v2Clear()};
 window.addEventListener('online',function(){if(q('ledgerV2')&&q('ledgerV2').classList.contains('on'))v2Load(true)});
}
async function v2Load(force){
 if(!D.user){v2Warn('سجل الدخول أولاً',true);return}
 if(!navigator.onLine){v2Warn('الصندوق المتعدد يحتاج اتصالاً بالإنترنت. بيانات الديون القديمة ما زالت متاحة من القوائم الأصلية.',true);return}
 if(V2.loading){if(force)V2.reloadRequested=true;return}
 V2.loading=true;v2Warn('جارِ تحديث البيانات...',false);
 var sessionUser=D.user.id;
 try{
  if(V2.userId!==sessionUser){v2Clear();V2.loading=true;V2.userId=sessionUser;force=true}
  var staff=await api('ledger_staff_members',{query:'?select=owner_id,role,active&user_id=eq.'+sessionUser+'&active=eq.true'});
  if(!D.user||D.user.id!==sessionUser)return;
  V2.workspaces=[{id:sessionUser,role:'owner',label:'حسابي'}].concat(staff.map(function(m){return {id:m.owner_id,role:m.role,label:'منشأة مشتركة · '+m.role}}));
  if(!V2.owner||!V2.workspaces.some(function(w){return w.id===V2.owner})){
   V2.owner=V2.workspaces.length>1&&!D.customers.length?V2.workspaces[1].id:sessionUser;
  }
  V2.role=V2.workspaces.find(function(w){return w.id===V2.owner}).role;
  q('v2Owner').innerHTML=V2.workspaces.map(function(w){return '<option value="'+v2Esc(w.id)+'">'+v2Esc(w.label)+' ('+v2Esc(w.role)+')</option>'}).join('');
  q('v2Owner').value=V2.owner;
  var owner=V2.owner;
  var requests=[
   api('ledger_cash_accounts',{query:'?select=*&owner_id=eq.'+owner+'&order=created_at.asc'}),
   api('customers',{query:'?select=id,name,phone,is_archived&user_id=eq.'+owner+'&order=created_at.asc'}),
   api('ledger_payments',{query:'?select=*&owner_id=eq.'+owner+'&order=created_at.desc&limit=100'}),
   api('rpc/ledger_cash_balances',{method:'POST',body:{p_owner:owner,p_local_day:null}}),
   api('ledger_day_closings',{query:'?select=*&owner_id=eq.'+owner+'&order=closed_at.desc&limit=40'})
  ];
  if(v2CanManage())requests.push(api('ledger_portal_disputes',{query:'?select=*&owner_id=eq.'+owner+'&order=created_at.desc&limit=80'}));
  if(v2CanManage())requests.push(api('ledger_audit',{query:'?select=id,actor_id,entity_type,action,created_at&owner_id=eq.'+owner+'&order=created_at.desc&limit=40'}));
  var results=await Promise.all(requests);
  if(!D.user||D.user.id!==sessionUser||V2.owner!==owner)return;
  V2.accounts=results[0];V2.customers=results[1].filter(function(c){return !c.is_archived});
  V2.payments=results[2];V2.balances=results[3]||[];V2.closings=results[4];
  V2.disputes=v2CanManage()?results[5]:[];V2.audit=v2CanManage()?results[6]:[];
  q('v2CashControls').classList.toggle('hide',V2.role!=='owner');
  q('v2StaffControls').classList.toggle('hide',V2.role!=='owner');
  q('v2MoneyControls').classList.toggle('hide',!v2CanCash());
  q('v2ReconcileControls').classList.toggle('hide',!v2CanManage());
  q('v2CodeControls').classList.toggle('hide',V2.role!=='owner');
  q('v2AdminSections').classList.toggle('hide',!v2CanManage());
  v2Render();
  v2Warn('البيانات محدّثة. الدفعات الجديدة ما بتنخصم إلا بعد التأكيد اليدوي.',false);
 }catch(e){if(/42501|401|403|not.authorized|permission/i.test(v2Error(e)))v2Clear();v2Warn('تعذّر تحميل التحديث الجديد: '+v2Error(e),true)}
 finally{
  V2.loading=false;
  // A payment may arrive while an earlier refresh is still running.
  // Never silently discard its follow-up refresh or leave the pending list stale.
  if(V2.reloadRequested){
    V2.reloadRequested=false;
    setTimeout(function(){if(D.user)v2Load(true)},0);
  }
 }
}
function v2Render(){
 var accounts=V2.accounts;
 q('v2Accounts').innerHTML=accounts.map(function(a){
  var b=V2.balances.find(function(x){return x.account_id===a.id});
  var closed=v2ClosedToday(a.id);
  return '<div class="v2-item"><b>'+v2Esc(a.label)+'</b> <span class="v2-flag">'+v2Esc(a.channel)+' · '+v2Esc(a.currency)+'</span><div class="small muted">رصيد محسوب من العمليات المؤكدة والحركات اليدوية</div><div class="amt">'+v2Fmt(b?b.expected:0,a.currency)+'</div>'+
   (closed?'<div class="v2-amber" role="status">🔒 مغلق اليوم ('+v2DamascusToday()+') — يمنع إضافة حركات جديدة.</div>':'')+
   (v2CanManage()?'<div class="v2-inline-actions"><button class="btn sec" onclick="v2Movement(\''+a.id+'\')">حركة صندوق</button><button class="btn sec" onclick="v2Close(\''+a.id+'\')">تسوية اليوم</button></div>':'')+'</div>'
 }).join('')||'<div class="empty">أضف صندوق نقد أو محفظة لتسجيل الدفعات.</div>';
 // Background refresh must not erase a user's in-progress payment or code form.
 var chosenCustomer=q('v2Customer').value,chosenPortalCustomer=q('v2PortalCustomer').value;
 q('v2Customer').innerHTML='<option value="">اختر الزبون</option>'+V2.customers.map(function(c){return '<option value="'+v2Esc(c.id)+'">'+v2Esc(c.name)+'</option>'}).join('');
 q('v2PortalCustomer').innerHTML=q('v2Customer').innerHTML;
 if(V2.customers.some(function(c){return c.id===chosenCustomer}))q('v2Customer').value=chosenCustomer;
 if(V2.customers.some(function(c){return c.id===chosenPortalCustomer}))q('v2PortalCustomer').value=chosenPortalCustomer;
 q('v2Pending').innerHTML=V2.payments.filter(function(p){return p.state==='pending'}).map(function(p){
   return '<div class="v2-item"><b>'+v2Esc(v2CustomerName(p.customer_id))+'</b> <span class="v2-flag v2-amber">بانتظار التأكيد</span><div>'+v2Fmt(p.settled_amount,p.debt_currency)+' · سعر الدولار '+v2Esc(p.fx_syp_per_usd)+'</div><small>'+v2Date(p.created_at)+' · '+v2Esc(p.memo)+'</small>'+
    (v2CanCash()?'<div class="v2-inline-actions"><button class="btn pri" onclick="v2Confirm(\''+p.id+'\')">تأكيد الاستلام والخصم</button><button class="btn danger" onclick="v2Reject(\''+p.id+'\')">رفض</button></div>':'')+'</div>'
 }).join('')||'<div class="empty">ما في دفعات معلّقة.</div>';
 q('v2History').innerHTML=V2.payments.filter(function(p){return p.state!=='pending'}).slice(0,20).map(function(p){
  return '<div class="v2-item"><b>'+v2Esc(v2CustomerName(p.customer_id))+'</b> <span class="v2-flag">'+(p.state==='confirmed'?'مؤكد':p.state==='reversed'?'معكوس':'مرفوض')+'</span><div>'+v2Fmt(p.settled_amount,p.debt_currency)+'</div><small>'+v2Date(p.confirmed_at||p.created_at)+'</small>'+
  (p.state==='confirmed'&&v2CanManage()?'<div class="v2-inline-actions"><button class="btn sec" onclick="v2Reverse(\''+p.id+'\')">عكس مع تصحيح المحافظ</button></div>':'')+'</div>'
 }).join('')||'<div class="empty">لا توجد دفعات من النوع الجديد بعد.</div>';
 q('v2Disputes').innerHTML=V2.disputes.map(function(d){
  return '<div class="v2-item"><b>'+v2Esc(v2CustomerName(d.customer_id))+'</b> <span class="v2-flag">'+v2Esc(d.status)+'</span><div>'+v2Esc(d.reason)+'</div><small>'+v2Date(d.created_at)+' · '+v2Esc(d.journal_id)+'</small>'+
  (d.owner_note?'<div class="small muted">رد الإدارة: '+v2Esc(d.owner_note)+'</div>':'')+
  (d.status==='open'?'<div class="v2-inline-actions"><button class="btn sec" onclick="v2ResolveDispute(\''+d.id+'\')">الرد على الاعتراض</button></div>':'')+'</div>'
 }).join('')||'<div class="empty">لا توجد اعتراضات جديدة.</div>';
 q('v2Audit').innerHTML=V2.audit.map(function(a){
  return '<div class="v2-item"><b>'+v2Esc(a.action)+' · '+v2Esc(a.entity_type)+'</b><div class="small muted">'+v2Date(a.created_at)+'</div></div>'
 }).join('')||'<div class="empty">لا توجد أحداث جديدة.</div>';
 q('v2Closings').innerHTML=V2.closings.map(function(c){
  return '<div class="v2-item"><b>'+v2Esc(v2AccountName(c.account_id))+' · '+v2Esc(c.local_day)+'</b><div>متوقّع: '+v2Fmt(c.expected_balance,(V2.accounts.find(function(a){return a.id===c.account_id})||{}).currency)+' / فعلي: '+v2Fmt(c.counted_balance,(V2.accounts.find(function(a){return a.id===c.account_id})||{}).currency)+'</div><div class="'+(Number(c.difference)===0?'v2-green':'v2-amber')+'">الفرق: '+v2Esc(c.difference)+'</div></div>'
 }).join('')||'<div class="empty">ما في إغلاقات يومية بعد.</div>';
 if(!q('v2Legs').children.length)v2AddLeg();
}
function v2AddLeg(){
 var div=document.createElement('div');div.className='v2-leg';
 div.innerHTML='<div class="f"><label>الصندوق / المحفظة</label><select class="v2-leg-account" onchange="v2Preview()">'+v2Field()+'</select></div>'+
 '<div class="f"><label>المبلغ</label><input class="v2-leg-amount" inputmode="decimal" type="number" min="0.000001" step="any" oninput="v2Preview()"></div>'+
 '<button class="btn sec" type="button" onclick="v2RemoveLeg(this)">✕</button>';
 q('v2Legs').appendChild(div);v2Preview();
}
function v2RemoveLeg(button){if(q('v2Legs').children.length<=1){v2Warn('يجب وجود جزء دفع واحد على الأقل',true);return}button.closest('.v2-leg').remove();v2Preview()}
function v2LegValues(){return Array.from(q('v2Legs').querySelectorAll('.v2-leg')).map(function(div){
 return {account_id:div.querySelector('.v2-leg-account').value,amount:Number(div.querySelector('.v2-leg-amount').value)}
})}
function v2Preview(){
 var fx=Number(q('v2FX').value),usdt=Number(q('v2USDT').value),currency=q('v2DebtCurrency').value;
 var total=0,valid=fx>0&&usdt>0;
 v2LegValues().forEach(function(leg){
  var a=V2.accounts.find(function(x){return x.id===leg.account_id});
  if(!a||!(leg.amount>0)){valid=false;return}
  var usd=a.currency==='USD'?leg.amount:a.currency==='SYP'?leg.amount/fx:leg.amount*usdt;
  total+=currency==='SYP'?usd*fx:usd;
 });
 q('v2Preview').textContent=valid?'قيمة الدفعة التقريبية: '+v2Fmt(Math.round(total*100)/100,currency)+' · السعر يثبت عند إنشاء الطلب':'حدّد المحفظة والمبالغ وسعر الصرف لحساب الإجمالي.';
}
function v2NewRequest(){V2.requestId=crypto.randomUUID()}
async function v2Prepare(){
 try{
  v2Online();if(!v2CanCash())throw Error('ما عندك صلاحية إنشاء دفعة');
  if(!q('v2Customer').value)throw Error('اختار الزبون');
  var fx=Number(q('v2FX').value),usdt=Number(q('v2USDT').value);
  var legs=v2LegValues();
  if(!legs.length||legs.some(function(x){return !x.account_id||!(x.amount>0)}))throw Error('أدخل أجزاء الدفع والمبالغ بشكل صحيح');
  if(!(fx>0)||!(usdt>0))throw Error('سعر الصرف لازم يكون أكبر من صفر');
  if(!V2.requestId)v2NewRequest();
  var btn=q('v2PrepareBtn');btn.disabled=true;
  try{
   var result=await api('rpc/ledger_prepare_payment',{method:'POST',body:{
     p_owner:V2.owner,p_customer:q('v2Customer').value,p_debt_currency:q('v2DebtCurrency').value,
     p_fx_syp_per_usd:fx,p_usdt_usd_rate:usdt,p_legs:legs,
     p_note:q('v2Note').value.trim(),p_request_id:V2.requestId
   }});
   v2Warn('تم إنشاء دفعة بانتظار التأكيد: '+v2Fmt(result.settled_amount,q('v2DebtCurrency').value)+'. لم يُخصم شيء من دين الزبون.',false);
   v2NewRequest();q('v2Note').value='';q('v2Legs').innerHTML='';v2AddLeg();
   await v2Load(true);
  }finally{btn.disabled=false}
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2Confirm(id){
 if(!confirm('هل تأكدت فعلياً من وصول كل أجزاء الدفعة إلى الصناديق والمحافظ؟ بعد التأكيد سيتم خصم قيمتها من الدين مرة واحدة.'))return;
 try{v2Online();await api('rpc/ledger_confirm_payment',{method:'POST',body:{p_payment:id,p_owner:V2.owner}});
   await sync();await v2Load(true);v2Warn('تم التأكيد وخصم الدفعة، مع حفظ تفاصيل سعر الصرف.',false);
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2Reject(id){
 var reason=prompt('اكتب سبب رفض الدفعة');if(reason===null)return;
 try{v2Online();if(reason.trim().length<3)throw Error('السبب يجب أن يكون 3 أحرف على الأقل');
   await api('rpc/ledger_reject_payment',{method:'POST',body:{p_payment:id,p_owner:V2.owner,p_reason:reason}});
   await v2Load(true);v2Warn('تم رفض الطلب بدون أي خصم.',false);
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2CreateAccount(){
 try{
  v2Online();if(V2.role!=='owner')throw Error('المالك فقط يضيف الصناديق');
  var channel=q('v2Channel').value,currency=q('v2AccountCurrency').value,label=q('v2AccountLabel').value.trim();
  if(label.length<2||label.length>80)throw Error('أدخل اسم صندوق من حرفين إلى 80 حرفاً');
  if((channel==='usdt')!==(currency==='USDT'))throw Error('محفظة USDT يجب أن تكون بعملة USDT فقط');
  await api('ledger_cash_accounts',{method:'POST',body:{owner_id:V2.owner,label:label,channel:channel,currency:currency}});
  q('v2AccountLabel').value='';await v2Load(true);
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2Movement(accountId){
 if(!v2CanManage())return;
 if(v2ClosedToday(accountId)){v2Warn('الصندوق مُغلق اليوم ('+v2DamascusToday()+'). ما في حركة جديدة بعد التسوية؛ الرصيد محفوظ.',true);return}
 var value=prompt('أدخل الحركة: رقم موجب للإيداع أو الرصيد الافتتاحي، وسالب للسحب أو التصحيح');
 if(value===null)return;
 var reason=prompt('النوع: opening / deposit / withdrawal / expense / correction','correction');
 if(reason===null)return;
 var note=prompt('اكتب سبب الحركة (3 أحرف على الأقل)','تسوية الصندوق');if(note===null)return;
 try{v2Online();await api('rpc/ledger_add_cash_movement',{method:'POST',body:{
    p_owner:V2.owner,p_account:accountId,p_amount:Number(value),p_reason:reason.trim(),
    p_note:note.trim(),p_related:null
 }});await v2Load(true);v2Warn('تمت إضافة حركة مستقلة بدون حذف أو تعديل العمليات السابقة.',false)
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2Close(accountId){
 if(!v2CanManage())return;
 var d=v2DamascusToday();
 var date=prompt('تاريخ التسوية بتوقيت دمشق (YYYY-MM-DD)',d);if(date===null)return;
 var amount=prompt('المبلغ الفعلي الموجود في الصندوق / المحفظة');if(amount===null)return;
 var note=prompt('ملاحظة التسوية (اختياري)','');if(note===null)return;
 try{v2Online();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||amount.trim()===''||!Number.isFinite(Number(amount)))throw Error('تحقق من التاريخ والمبلغ');
  var result=await api('rpc/ledger_close_day',{method:'POST',body:{
    p_owner:V2.owner,p_account:accountId,p_day:date,p_counted:Number(amount),p_note:note
  }});await v2Load(true);
  v2Warn('تم إغلاق الصندوق. الرصيد المتوقع '+result.expected+'، الفعلي '+result.counted+'، الفرق '+result.difference,false)
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2IssueCustomerCode(){
 try{
  v2Online();if(V2.role!=='owner')throw Error('المالك فقط يمكنه إصدار أكواد كشف الحساب');
  if(!q('v2PortalCustomer').value)throw Error('اختر الزبون');
  var code=await api('rpc/ledger_issue_portal_code',{method:'POST',body:{p_customer_id:q('v2PortalCustomer').value}});
  q('v2IssuedCode').value=code;
  var url=new URL('./mobile-test-customer.html',location.href);
  q('v2PortalUrl').value=url.href;
  q('v2IssuedSection').classList.remove('hide');
  v2Warn('الكود الجديد أُلغي معه أي كود كشف سابق لنفس الزبون. الكود صالح 180 يوماً.',false);
 }catch(e){v2Warn(v2Error(e),true)}
}
function v2CopyCode(){
 var code=q('v2IssuedCode').value,url=q('v2PortalUrl').value;
 if(!code)return;
 var message='كشف حسابك في Cashier Ledger\nالرابط: '+url+'\nكود الدخول الخاص فيك: '+code+
 '\nلا تشارك الكود مع أي شخص. ما بدك بريد إلكتروني.';
 if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(message).then(function(){v2Warn('انسخت الرسالة والكود، ابعتها للزبون.',false)}).catch(function(){v2Warn('انسخ من الخانة يدويّاً.',true)})}
 else v2Warn('انسخ الرسالة والكود يدويّاً.',true);
}
async function v2ResolveDispute(id){
 var status=prompt('اختر الحالة: accepted / rejected / resolved','resolved');if(status===null)return;
 var reply=prompt('رد الإدارة الذي سيظهر للزبون','تمت مراجعة اعتراضك');if(reply===null)return;
 try{v2Online();if(!['accepted','rejected','resolved'].includes(status))throw Error('اختر حالة صحيحة');
  await api('ledger_portal_disputes',{method:'PATCH',query:'?id=eq.'+id+'&owner_id=eq.'+V2.owner,
   body:{status:status,owner_note:reply.trim(),resolved_at:new Date().toISOString()}});
  await v2Load(true);v2Warn('تم تحديث الاعتراض، والعملية الأصلية بقيت محفوظة.',false);
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2Reverse(id){
 if(!v2CanManage())return;
 var reason=prompt('سبب عكس الدفعة المؤكدة (رح تنعكس حركة دين الزبون وتصير حركة تصحيح لكل محفظة):');
 if(reason===null)return;
 try{v2Online();if(reason.trim().length<3)throw Error('اكتب سبباً واضحاً للعكس');
  var result=await api('rpc/ledger_reverse_payment',{method:'POST',body:{
   p_owner:V2.owner,p_payment:id,p_reason:reason.trim()
  }});
  await sync();await v2Load(true);
  v2Warn('تم عكس الدفعة وتصحيح أرصدة المحافظ. سجل العملية القديمة محفوظ.',false);
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2DisableStaff(){
 try{v2Online();if(V2.role!=='owner')throw Error('المالك فقط يمكنه تعطيل الموظف');
  var email=q('v2StaffEmail').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('أدخل بريد الموظف لتعطيله');
  if(!confirm('هل بدك تعطّل صلاحيات هالموظف فوراً؟'))return;
  await api('rpc/ledger_disable_staff',{method:'POST',body:{p_email:email}});
  q('v2StaffEmail').value='';
  v2Warn('تم تعطيل عضوية الموظف. لازم يسجّل خروج من الجلسات المفتوحة.',false);
 }catch(e){v2Warn(v2Error(e),true)}
}
async function v2AssignStaff(){
 try{v2Online();if(V2.role!=='owner')throw Error('المالك فقط يحدد الصلاحيات');
  var email=q('v2StaffEmail').value.trim(),role=q('v2StaffRole').value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('أدخل بريد حساب الموظف المسجل');
  var result=await api('rpc/ledger_assign_staff',{method:'POST',body:{p_email:email,p_role:role}});
  v2Warn('صلاحية الموظف: '+result.role+'. لازم يكون عنده حساب موجود ومفعّل.',false);
  q('v2StaffEmail').value='';
 }catch(e){v2Warn(v2Error(e),true)}
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',v2Install)}
else v2Install();
