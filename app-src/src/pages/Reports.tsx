import { useCallback, useMemo, useState } from 'react'
import { BarChart3, CalendarRange, Gem, TrendingUp } from 'lucide-react'
import { db } from '../db'
import { useData } from '../lib/useData'
import { Card, PageHeader, Stat } from '../components/UI'
import { D, money, weight } from '../lib/money'

const localDateKey=(value:Date|string=new Date())=>{const d=value instanceof Date?value:new Date(value);const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}

export function Reports(){
  const today=localDateKey(); const month=today.slice(0,7)+'-01'
  const [from,setFrom]=useState(month); const [to,setTo]=useState(today)
  const loader=useCallback(async()=>({sales:await db.sales.toArray(),purchases:await db.purchases.toArray(),buybacks:await db.buybacks.toArray(),expenses:await db.expenses.toArray(),items:await db.silverItems.toArray()}),[])
  const {data}=useData(loader,{sales:[],purchases:[],buybacks:[],expenses:[],items:[]} as Awaited<ReturnType<typeof loader>>)
  const r=useMemo(()=>{
    const insideDate=(d:string)=>d.slice(0,10)>=from&&d.slice(0,10)<=to
    const insideTimestamp=(d:string)=>{const key=localDateKey(d);return key>=from&&key<=to}
    const sales=data.sales.filter(x=>x.status==='posted'&&insideTimestamp(x.createdAt)); const purchases=data.purchases.filter(x=>x.status==='posted'&&insideTimestamp(x.createdAt)); const buybacks=data.buybacks.filter(x=>x.status==='posted'&&insideTimestamp(x.createdAt)); const expenses=data.expenses.filter(x=>insideDate(x.date))
    const salesTotal=sales.reduce((s,x)=>D(s).add(x.total).toString(),'0'); const soldWeight=sales.flatMap(x=>x.lines).reduce((s,l)=>D(s).add(l.netWeight).toString(),'0')
    const purchaseTotal=purchases.reduce((s,x)=>D(s).add(x.total).toString(),'0'); const purchaseWeight=purchases.flatMap(x=>x.lines).reduce((s,l)=>D(s).add(l.netWeight).toString(),'0')
    const buybackTotal=buybacks.reduce((s,x)=>D(s).add(x.payoutAmount).add(x.storeCreditAmount).toString(),'0'); const buybackWeight=buybacks.flatMap(x=>x.lines).reduce((s,l)=>D(s).add(l.netWeight).toString(),'0')
    const expenseTotal=expenses.reduce((s,x)=>D(s).add(x.amount).toString(),'0')
    const available=data.items.filter(i=>!i.archived&&i.status==='available'); const byPurity=Object.entries(available.reduce<Record<string,{count:number,weight:string}>>((m,i)=>{const row=m[i.purity]||{count:0,weight:'0'};row.count++;row.weight=D(row.weight).add(i.netWeight).toString();m[i.purity]=row;return m},{})).sort((a,b)=>Number(b[0])-Number(a[0]))
    return {sales,salesTotal,soldWeight,purchases,purchaseTotal,purchaseWeight,buybacks,buybackTotal,buybackWeight,expenses,expenseTotal,byPurity}
  },[data,from,to])
  return <>
    <PageHeader title="التقارير" description="تقارير محلية تعمل حتى بدون إنترنت، ثم تتطابق مع الخادم بعد المزامنة" actions={<div className="button-row"><label className="compact-field"><span>من</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="compact-field"><span>إلى</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}/>

    <Card className="hero-panel slim-hero">
      <div className="hero-content">
        <div>
          <div className="eyebrow"><BarChart3 size={16}/> قراءة تشغيلية ذكية</div>
          <h2>تقارير مختصرة وواضحة لتاجر الفضة</h2>
          <p>من شاشة واحدة تشوف المبيعات، المشتريات، الفضة القديمة، والمصاريف ضمن أي فترة تختارها، حتى أثناء العمل أوفلاين.</p>
        </div>
        <div className="hero-pills">
          <div><span>الفترة الحالية</span><b><CalendarRange size={14}/> من {from} إلى {to}</b></div>
          <div><span>صافي مبسط</span><b>{money(D(r.salesTotal).sub(r.purchaseTotal).sub(r.buybackTotal).sub(r.expenseTotal))}</b></div>
          <div><span>وزن مباع</span><b>{weight(r.soldWeight)} غ</b></div>
        </div>
      </div>
    </Card>

    <div className="stats-grid mt"><Stat label="المبيعات" value={money(r.salesTotal)} sub={`${r.sales.length} فاتورة • ${weight(r.soldWeight)} غ`}/><Stat label="المشتريات" value={money(r.purchaseTotal)} sub={`${r.purchases.length} مستند • ${weight(r.purchaseWeight)} غ`}/><Stat label="شراء قديم" value={money(r.buybackTotal)} sub={`${r.buybacks.length} عملية • ${weight(r.buybackWeight)} غ`}/><Stat label="المصاريف" value={money(r.expenseTotal)} sub={`${r.expenses.length} حركة`}/><Stat label="صافي تدفق مبسط" value={money(D(r.salesTotal).sub(r.purchaseTotal).sub(r.buybackTotal).sub(r.expenseTotal))} sub="قبل التسويات والذمم"/></div>

    <div className="feature-grid mt">
      <Card className="quick-card compact"><div className="quick-icon"><TrendingUp size={18}/></div><div><b>قابلية المتابعة</b><p>قراءة سريعة لوضع النشاط اليومي أو الشهري.</p></div></Card>
      <Card className="quick-card compact"><div className="quick-icon"><Gem size={18}/></div><div><b>تركيز على الفضة</b><p>الأوزان محسوبة حسب طبيعة عمل محل الفضة.</p></div></Card>
    </div>

    <div className="grid-2 mt"><Card><h3>المخزون الحالي حسب العيار</h3>{r.byPurity.length?<div className="table-wrap"><table><thead><tr><th>العيار</th><th>القطع</th><th>الوزن الصافي</th></tr></thead><tbody>{r.byPurity.map(([p,v])=><tr key={p}><td><b>{p}</b></td><td>{v.count}</td><td>{weight(v.weight)} غ</td></tr>)}</tbody></table></div>:<div className="empty">لا يوجد مخزون متاح</div>}</Card><Card><h3>ملاحظات محاسبية</h3><p className="muted">هذا التقرير المحلي يعطي حركة تشغيلية فورية أوفلاين. ميزان المراجعة والقوائم المالية النهائية تعتمد على قيود القيد المزدوج في الخادم وتُحدّث بعد المزامنة.</p><div className="calc-box"><span>وزن مباع: <b>{weight(r.soldWeight)} غ</b></span><span>وزن مشتريات: <b>{weight(r.purchaseWeight)} غ</b></span><span>وزن فضة قديمة: <b>{weight(r.buybackWeight)} غ</b></span></div></Card></div>
  </>
}
