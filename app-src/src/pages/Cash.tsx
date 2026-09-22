import { useCallback, useMemo } from 'react'
import { Banknote, CreditCard, Landmark, Scale, WalletCards } from 'lucide-react'
import { db } from '../db'
import { useData } from '../lib/useData'
import { D, money } from '../lib/money'
import { Card, PageHeader } from '../components/UI'

export function Cash(){
  const loader=useCallback(async()=>({
    sales:(await db.sales.toArray()).filter(x=>x.status==='posted'),
    purchases:(await db.purchases.toArray()).filter(x=>x.status==='posted'),
    buybacks:(await db.buybacks.toArray()).filter(x=>x.status==='posted'),
    expenses:await db.expenses.toArray(),
  }),[])
  const {data}=useData(loader,{sales:[],purchases:[],buybacks:[],expenses:[]} as Awaited<ReturnType<typeof loader>>)
  const calc=useMemo(()=>{
    const cashSales=data.sales.filter(x=>x.paymentMethod==='cash').reduce((s,x)=>D(s).add(x.paid||0).toString(),'0')
    const bankSales=data.sales.filter(x=>x.paymentMethod==='bank'||x.paymentMethod==='card').reduce((s,x)=>D(s).add(x.paid||0).toString(),'0')
    const mixedSales=data.sales.filter(x=>x.paymentMethod==='mixed').reduce((s,x)=>D(s).add(x.paid||0).toString(),'0')
    const purchaseOut=data.purchases.reduce((s,x)=>D(s).add(x.paid||0).toString(),'0')
    const buybackOut=data.buybacks.reduce((s,x)=>D(s).add(x.payoutAmount||0).toString(),'0')
    const cashExpenses=data.expenses.filter(x=>x.paymentMethod==='cash').reduce((s,x)=>D(s).add(x.amount||0).toString(),'0')
    const bankExpenses=data.expenses.filter(x=>x.paymentMethod==='bank'||x.paymentMethod==='card').reduce((s,x)=>D(s).add(x.amount||0).toString(),'0')
    const cashNet=D(cashSales).sub(purchaseOut).sub(buybackOut).sub(cashExpenses).toString()
    const bankNet=D(bankSales).sub(bankExpenses).toString()
    const receivables=data.sales.reduce((s,x)=>D(s).add(x.balance||0).toString(),'0')
    const payables=data.purchases.reduce((s,x)=>D(s).add(x.balance||0).toString(),'0')
    return {cashSales,bankSales,mixedSales,purchaseOut,buybackOut,cashExpenses,bankExpenses,cashNet,bankNet,receivables,payables}
  },[data])
  return <>
    <PageHeader title="الصندوق والبنوك" description="ملخص نقدي أوفلاين مبني مباشرة على الفواتير والمشتريات والمصاريف وشراء الفضة القديمة"/>
    <div className="stats-grid">
      <div className="stat"><span>صافي الصندوق المحسوب</span><strong>{money(calc.cashNet)}</strong><small>نقدي فقط</small></div>
      <div className="stat"><span>صافي البنك/البطاقات</span><strong>{money(calc.bankNet)}</strong><small>الحركات المصنفة بنك/بطاقة</small></div>
      <div className="stat"><span>ذمم العملاء</span><strong>{money(calc.receivables)}</strong><small>رصيد مبيعات غير مدفوع</small></div>
      <div className="stat"><span>ذمم الموردين</span><strong>{money(calc.payables)}</strong><small>رصيد مشتريات غير مدفوع</small></div>
    </div>
    <div className="grid-2 mt">
      <Card><div className="card-title"><Banknote size={18}/><b>حركة النقد</b></div><div className="purity"><div><span>مبيعات نقدية</span><b>{money(calc.cashSales)}</b></div><div><span>مدفوع للموردين</span><b>- {money(calc.purchaseOut)}</b></div><div><span>شراء فضة قديمة</span><b>- {money(calc.buybackOut)}</b></div><div><span>مصاريف نقدية</span><b>- {money(calc.cashExpenses)}</b></div></div></Card>
      <Card><div className="card-title"><Landmark size={18}/><b>البنك والبطاقات</b></div><div className="purity"><div><span>مبيعات بنك/بطاقة</span><b>{money(calc.bankSales)}</b></div><div><span>مصاريف بنك/بطاقة</span><b>- {money(calc.bankExpenses)}</b></div><div><span>دفعات مختلطة غير موزعة</span><b>{money(calc.mixedSales)}</b></div></div><div className="notice info mt"><CreditCard size={17}/> الدفعات المختلطة تظهر منفصلة حتى لا ننسبها للصندوق أو البنك بشكل خاطئ.</div></Card>
    </div>
    <Card className="mt"><div className="card-title"><WalletCards size={18}/><b>ملاحظة محاسبية</b></div><p className="muted">هذه الشاشة تعطي رصيداً تشغيلياً فورياً حتى بدون إنترنت. ميزان المراجعة الرسمي والقيد المزدوج موجودان في صفحة الحسابات، ويُحدّثان من الخادم بعد المزامنة.</p><div className="notice info"><Scale size={17}/> شراء الفضة القديمة والمشتريات والمصاريف محسوبة ضمن التدفقات النقدية ولا تُحسب كمبيعات.</div></Card>
  </>
}
