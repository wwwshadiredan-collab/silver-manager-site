import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bot, Boxes, DollarSign, Plus, Save, ShieldCheck, Sparkles, WalletCards } from 'lucide-react'
import { db } from '../db'
import { useData } from '../lib/useData'
import { D, money, weight } from '../lib/money'
import { Card, PageHeader, Stat } from '../components/UI'
import { supabase, currentShopId } from '../lib/supabase'

const localDateKey=(value:Date|string=new Date())=>{const d=value instanceof Date?value:new Date(value);const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
const expenseDateKey=(value:string)=>String(value||'').slice(0,10)

export function Dashboard(){
  const [silverRate,setSilverRate]=useState('1.20')
  const [usdToSyp,setUsdToSyp]=useState('1')
  const [marketMsg,setMarketMsg]=useState('')
  const [savingMarket,setSavingMarket]=useState(false)

  const loader=useCallback(async()=>{
    if(navigator.onLine){
      const shopId=currentShopId()
      if(shopId){
        const pendingRows=await db.outbox.toArray()
        const pendingIds=new Set(pendingRows.map(x=>x.entityId))
        const {data:remoteExpenses,error}=await supabase.from('expenses').select('*').eq('shop_id',shopId)
        if(!error&&remoteExpenses){
          for(const x of remoteExpenses){
            if(pendingIds.has(x.id)) continue
            await db.expenses.put({
              id:x.id,title:x.title,category:x.category,amount:String(x.amount??0),
              date:String(x.expense_date||'').slice(0,10),
              paymentMethod:(x.payment_method==='card'?'card':x.payment_method==='bank'?'bank':'cash'),
              notes:x.notes||undefined,archived:Boolean(x.archived_at),
              createdAt:x.created_at||new Date().toISOString(),updatedAt:x.updated_at||new Date().toISOString(),
              version:Number(x.version??1),syncStatus:'synced',deviceId:x.device_id||undefined
            })
          }
        }
      }
    }
    const [items,sales,expenses,outbox]=await Promise.all([db.silverItems.toArray(),db.sales.toArray(),db.expenses.toArray(),db.outbox.toArray()])
    const today=localDateKey()
    const available=items.filter(i=>!i.archived&&i.status==='available')
    const todaySales=sales.filter(s=>localDateKey(s.createdAt)===today&&s.status==='posted')
    const salesTotal=todaySales.reduce((a,s)=>D(a).add(s.total).toString(),'0')
    const soldWeight=todaySales.flatMap(s=>s.lines).reduce((a,l)=>D(a).add(l.netWeight).toString(),'0')
    const invWeight=available.reduce((a,i)=>D(a).add(i.netWeight).toString(),'0')
    const expenseTotal=expenses.filter(e=>expenseDateKey(e.date)===today).reduce((a,e)=>D(a).add(e.amount).toString(),'0')
    const byPurity=Object.entries(available.reduce<Record<string,string>>((m,i)=>{m[i.purity]=D(m[i.purity]||0).add(i.netWeight).toString(); return m},{})).sort((a,b)=>Number(b[0])-Number(a[0]))
    return {available,todaySales,salesTotal,soldWeight,invWeight,expenseTotal,outbox,byPurity}
  },[])

  const {data}=useData(loader,{available:[],todaySales:[],salesTotal:'0',soldWeight:'0',invWeight:'0',expenseTotal:'0',outbox:[],byPurity:[]} as Awaited<ReturnType<typeof loader>>)

  useEffect(()=>{(async()=>{
    const localRate=(await db.settings.get('pureSilverRate'))?.value
    const localFx=(await db.settings.get('usdToSypRate'))?.value
    if(localRate)setSilverRate(localRate)
    if(localFx)setUsdToSyp(localFx)

    const shopId=currentShopId()
    if(!navigator.onLine||!shopId)return

    const [rateRes,settingsRes]=await Promise.all([
      supabase.from('silver_rates').select('rate_per_pure_gram').eq('shop_id',shopId).eq('currency_code','USD').order('effective_at',{ascending:false}).limit(1).maybeSingle(),
      supabase.from('shop_settings').select('usd_to_syp_rate').eq('shop_id',shopId).maybeSingle(),
    ])

    const remoteRate=rateRes.data?.rate_per_pure_gram
    const remoteFx=settingsRes.data?.usd_to_syp_rate
    if(remoteRate!=null){
      const v=String(remoteRate);setSilverRate(v);await db.settings.put({key:'pureSilverRate',value:v})
    }
    if(remoteFx!=null&&Number(remoteFx)>0){
      const v=String(remoteFx);setUsdToSyp(v);await db.settings.put({key:'usdToSypRate',value:v})
    }
  })()},[])

  const saveMarketRates=async()=>{
    const rate=Number(silverRate)
    const fx=Number(usdToSyp)
    if(!Number.isFinite(rate)||rate<=0)return setMarketMsg('أدخل سعر غرام فضة صحيح.')
    if(!Number.isFinite(fx)||fx<=0)return setMarketMsg('أدخل سعر صرف الدولار بالليرة السورية.')
    setSavingMarket(true);setMarketMsg('')
    try{
      await db.settings.bulkPut([{key:'pureSilverRate',value:String(rate)},{key:'usdToSypRate',value:String(fx)}])
      const shopId=currentShopId()
      if(navigator.onLine&&shopId){
        const {error:rateError}=await supabase.from('silver_rates').insert({shop_id:shopId,currency_code:'USD',rate_per_pure_gram:rate,source:'manual'})
        if(rateError)throw rateError
        const {error:fxError}=await supabase.from('shop_settings').update({usd_to_syp_rate:fx}).eq('shop_id',shopId)
        if(fxError)throw fxError
        setMarketMsg('تم تحديث سعر الفضة وسعر الصرف. أسعار المخزون ونقطة البيع ستتحدث تلقائياً.')
      }else{
        setMarketMsg('تم الحفظ على هذا الجهاز. عند توفر الإنترنت احفظ السعر مرة أخرى لمزامنته مع باقي الأجهزة.')
      }
    }catch(err){setMarketMsg(err instanceof Error?err.message:'تعذر حفظ أسعار السوق')}
    finally{setSavingMarket(false)}
  }

  const kiloUsd=Number(silverRate)>0?money(D(silverRate).mul(1000)):'0.00'
  const kiloSyp=Number(silverRate)>0&&Number(usdToSyp)>0?money(D(silverRate).mul(1000).mul(usdToSyp)):'0.00'

  return <>
    <PageHeader title="لوحة التحكم" description="صورة سريعة عن حركة محل الفضة اليوم" actions={<div className="button-row"><Link className="btn primary" to="/pos"><DollarSign size={17}/> بيع جديد</Link><Link className="btn" to="/inventory/new"><Plus size={17}/> إضافة قطعة</Link></div>}/>

    <Card className="hero-panel">
      <div className="hero-content">
        <div>
          <div className="eyebrow"><Sparkles size={16}/> لوحة فضية احترافية</div>
          <h2>راقب المبيعات، المخزون، والأوفلاين من مكان واحد</h2>
          <p>Silver Manager مصمم ليعطي تاجر الفضة صورة واضحة وسريعة: وزن متاح، عمليات اليوم، وتنبيهات المزامنة، مع واجهة أنيقة متخصصة بالفضة.</p>
          <div className="button-row mt"><Link className="btn primary" to="/reports">فتح التقارير <ArrowLeft size={16}/></Link><Link className="btn" to="/assistant">اسأل المساعد الذكي</Link></div>
        </div>
        <div className="hero-pills">
          <div><span>جاهزية الأوفلاين</span><b>{data.outbox.length?`محفوظ ${data.outbox.length} عملية`:'مستقر وجاهز'}</b></div>
          <div><span>الوزن المتاح</span><b>{weight(data.invWeight)} غ</b></div>
          <div><span>فواتير اليوم</span><b>{data.todaySales.length}</b></div>
        </div>
      </div>
    </Card>

    <Card className="mt">
      <div className="card-title"><DollarSign size={18}/><b>تسعير السوق اليوم</b></div>
      <p className="muted">غيّر السعر مرة واحدة من هون؛ السعر الحالي لكل قطعة في المخزون ونقطة البيع يُعاد حسابه فوراً حسب وزنها وعيارها وأجرتها. الفواتير القديمة لا تتغير.</p>
      <div className="form-grid cols-3">
        <label className="field"><span>سعر غرام الفضة الخالصة 999 — USD</span><input type="number" min="0.0001" step="0.0001" value={silverRate} onChange={e=>setSilverRate(e.target.value)}/></label>
        <label className="field"><span>سعر صرف 1 USD — ليرة سورية</span><input type="number" min="0.0001" step="0.01" value={usdToSyp} onChange={e=>setUsdToSyp(e.target.value)}/></label>
        <div className="field"><span>مرجع سريع للكيلوغرام الخالص</span><div className="calc-box"><b>{kiloUsd} USD</b><span>{kiloSyp} SYP</span></div></div>
      </div>
      <div className="button-row end mt"><button className="btn primary" type="button" disabled={savingMarket} onClick={saveMarketRates}><Save size={17}/>{savingMarket?'جاري الحفظ…':'تحديث أسعار اليوم'}</button></div>
      {marketMsg&&<div className="notice info mt">{marketMsg}</div>}
    </Card>

    <div className="stats-grid mt">
      <Stat label="مبيعات اليوم" value={money(data.salesTotal)} sub={`${data.todaySales.length} فاتورة`}/>
      <Stat label="الوزن المباع اليوم" value={`${weight(data.soldWeight)} غ`} />
      <Stat label="المخزون المتاح" value={`${weight(data.invWeight)} غ`} sub={`${data.available.length} قطعة`}/>
      <Stat label="مصاريف اليوم" value={money(data.expenseTotal)} />
      <Stat label="عمليات بانتظار المزامنة" value={String(data.outbox.length)} sub="محفوظة محلياً"/>
    </div>

    <div className="feature-grid mt">
      <Card className="quick-card"><div className="quick-icon"><Boxes size={18}/></div><div><b>المخزون</b><p>إدارة القطع والوزن والعيار وسعر البيع.</p></div></Card>
      <Card className="quick-card"><div className="quick-icon"><ShieldCheck size={18}/></div><div><b>العزل والأمان</b><p>منشأتك مستقلة كلياً مع مزامنة موثوقة وصلاحيات.</p></div></Card>
      <Card className="quick-card"><div className="quick-icon"><WalletCards size={18}/></div><div><b>الحركة المالية</b><p>بيع ومشتريات ومصاريف وتقارير تشغيلية سريعة.</p></div></Card>
    </div>

    <div className="grid-2 mt">
      <Card>
        <div className="card-title"><Boxes size={18}/><b>المخزون حسب العيار</b></div>
        <div className="purity-list premium-list">{data.byPurity.length?data.byPurity.map(([p,w])=><div key={p}><span>عيار {p}</span><b>{weight(w)} غ</b></div>):<span>لا توجد بيانات</span>}</div>
      </Card>
      <Card className="assistant-card">
        <div className="card-title"><Bot size={18}/><b>المساعد الذكي</b></div>
        <h3>اسأل عن شغلك بلغة بسيطة</h3>
        <p>مثلاً: «قديش وزن الفضة المتوفر 925؟» أو «شو مبيعات اليوم؟»</p>
        <Link className="btn primary" to="/assistant">فتح المساعد</Link>
      </Card>
    </div>
  </>
}
