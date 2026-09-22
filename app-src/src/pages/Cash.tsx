import { FormEvent, useCallback, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, Landmark, LockKeyhole, Scale, WalletCards } from 'lucide-react'
import { db } from '../db'
import { useData } from '../lib/useData'
import { D, money } from '../lib/money'
import { Card, PageHeader } from '../components/UI'
import { getDeviceId, newId } from '../lib/ids'
import { saveCashClosing } from '../lib/repository'

const localDateKey=(value:Date|string=new Date())=>{
  const d=value instanceof Date?value:new Date(value)
  const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

export function Cash(){
  const loader=useCallback(async()=>({
    sales:(await db.sales.toArray()).filter(x=>x.status==='posted'),
    purchases:(await db.purchases.toArray()).filter(x=>x.status==='posted'),
    buybacks:(await db.buybacks.toArray()).filter(x=>x.status==='posted'),
    expenses:await db.expenses.toArray(),
    closings:await db.cashClosings.orderBy('closedAt').reverse().toArray(),
  }),[])
  const {data,refresh}=useData(loader,{sales:[],purchases:[],buybacks:[],expenses:[],closings:[]} as Awaited<ReturnType<typeof loader>>)

  const [openingUsd,setOpeningUsd]=useState('0')
  const [openingSyp,setOpeningSyp]=useState('0')
  const [countedUsd,setCountedUsd]=useState('0')
  const [countedSyp,setCountedSyp]=useState('0')
  const [notes,setNotes]=useState('')
  const [closingMsg,setClosingMsg]=useState('')

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

  const today=localDateKey()
  const todayMovement=useMemo(()=>{
    const todaySales=data.sales.filter(x=>localDateKey(x.createdAt)===today)
    const salesUsd=todaySales.reduce((s,x)=>{
      const split=x.paymentBreakdown
      if(split) return D(s).add(split.usdCash||0).toString()
      return x.paymentMethod==='cash'?D(s).add(x.paid||0).toString():s
    },'0')
    const salesSyp=todaySales.reduce((s,x)=>D(s).add(x.paymentBreakdown?.sypCash||0).toString(),'0')

    const purchaseOut=data.purchases.filter(x=>localDateKey(x.createdAt)===today).reduce((s,x)=>D(s).add(x.paid||0).toString(),'0')
    const buybackOut=data.buybacks.filter(x=>localDateKey(x.createdAt)===today).reduce((s,x)=>D(s).add(x.payoutAmount||0).toString(),'0')
    const expenseOut=data.expenses.filter(x=>String(x.date||'').slice(0,10)===today&&x.paymentMethod==='cash').reduce((s,x)=>D(s).add(x.amount||0).toString(),'0')
    const cashOutUsd=D(purchaseOut).add(buybackOut).add(expenseOut).toString()
    return {salesUsd,salesSyp,purchaseOut,buybackOut,expenseOut,cashOutUsd}
  },[data,today])

  const expectedUsd=money(D(openingUsd||0).add(todayMovement.salesUsd).sub(todayMovement.cashOutUsd))
  const expectedSyp=money(D(openingSyp||0).add(todayMovement.salesSyp))
  const differenceUsd=money(D(countedUsd||0).sub(expectedUsd))
  const differenceSyp=money(D(countedSyp||0).sub(expectedSyp))

  const closeCash=async(e:FormEvent)=>{
    e.preventDefault()
    if(Number(openingUsd)<0||Number(openingSyp)<0||Number(countedUsd)<0||Number(countedSyp)<0)return alert('قيم الصندوق لا يمكن أن تكون سالبة')
    const now=new Date().toISOString()
    await saveCashClosing({
      id:newId(),businessDate:today,
      openingUsd:money(openingUsd||0),openingSyp:money(openingSyp||0),
      salesUsd:money(todayMovement.salesUsd),salesSyp:money(todayMovement.salesSyp),
      cashOutUsd:money(todayMovement.cashOutUsd),
      expectedUsd,expectedSyp,
      countedUsd:money(countedUsd||0),countedSyp:money(countedSyp||0),
      differenceUsd,differenceSyp,notes:notes||undefined,closedAt:now,
      createdAt:now,updatedAt:now,version:1,archived:false,syncStatus:'pending',deviceId:getDeviceId(),
    })
    setClosingMsg('تم إغلاق الصندوق وحفظ الجرد النقدي محلياً. ستتم مزامنته تلقائياً عند توفر الإنترنت.')
    setNotes('')
    refresh()
  }

  return <>
    <PageHeader title="الصندوق والبنوك" description="ملخص نقدي وإغلاق صندوق يومي بالدولار والسوري، يعمل أوفلاين ويحفظ فرق الجرد"/>

    <Card>
      <div className="card-title"><LockKeyhole size={18}/><b>إغلاق صندوق اليوم — {today}</b></div>
      <p className="muted">أدخل رصيد أول اليوم، وبعد عدّ النقد الحقيقي أدخل الموجود الفعلي. النظام يحسب المتوقع والفرق ويحفظ الإغلاق كسجل مستقل.</p>
      <form onSubmit={closeCash}>
        <div className="form-grid cols-3">
          <label className="field"><span>رصيد أول اليوم — USD</span><input type="number" min="0" step="0.01" value={openingUsd} onChange={e=>setOpeningUsd(e.target.value)}/></label>
          <label className="field"><span>مبيعات نقدية اليوم — USD</span><input readOnly value={money(todayMovement.salesUsd)}/></label>
          <label className="field"><span>مصاريف/مشتريات/شراء قديم — USD</span><input readOnly value={money(todayMovement.cashOutUsd)}/></label>
          <label className="field"><span>المتوقع بالصندوق — USD</span><input readOnly value={expectedUsd}/></label>
          <label className="field"><span>الموجود الفعلي — USD</span><input type="number" min="0" step="0.01" value={countedUsd} onChange={e=>setCountedUsd(e.target.value)}/></label>
          <div className="field"><span>فرق الجرد — USD</span><div className="calc-box"><b>{differenceUsd} USD</b></div></div>
        </div>

        <div className="form-grid cols-3 mt">
          <label className="field"><span>رصيد أول اليوم — SYP</span><input type="number" min="0" step="1" value={openingSyp} onChange={e=>setOpeningSyp(e.target.value)}/></label>
          <label className="field"><span>مبيعات نقدية اليوم — SYP</span><input readOnly value={money(todayMovement.salesSyp)}/></label>
          <label className="field"><span>المتوقع بالصندوق — SYP</span><input readOnly value={expectedSyp}/></label>
          <label className="field"><span>الموجود الفعلي — SYP</span><input type="number" min="0" step="1" value={countedSyp} onChange={e=>setCountedSyp(e.target.value)}/></label>
          <div className="field"><span>فرق الجرد — SYP</span><div className="calc-box"><b>{differenceSyp} SYP</b></div></div>
          <label className="field"><span>ملاحظات الإغلاق</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="مثال: فرق بسيط بسبب فكة"/></label>
        </div>

        <div className="button-row end mt"><button className="btn primary" type="submit"><CheckCircle2 size={17}/> تثبيت إغلاق الصندوق</button></div>
      </form>
      {closingMsg&&<div className="notice success mt">{closingMsg}</div>}
    </Card>

    <div className="stats-grid mt">
      <div className="stat"><span>صافي الصندوق المحسوب</span><strong>{money(calc.cashNet)}</strong><small>نقدي فقط</small></div>
      <div className="stat"><span>صافي البنك/البطاقات</span><strong>{money(calc.bankNet)}</strong><small>الحركات المصنفة بنك/بطاقة</small></div>
      <div className="stat"><span>ذمم العملاء</span><strong>{money(calc.receivables)}</strong><small>رصيد مبيعات غير مدفوع</small></div>
      <div className="stat"><span>ذمم الموردين</span><strong>{money(calc.payables)}</strong><small>رصيد مشتريات غير مدفوع</small></div>
    </div>

    <div className="grid-2 mt">
      <Card><div className="card-title"><Banknote size={18}/><b>حركة النقد</b></div><div className="purity"><div><span>مبيعات نقدية</span><b>{money(calc.cashSales)}</b></div><div><span>مدفوع للموردين</span><b>- {money(calc.purchaseOut)}</b></div><div><span>شراء فضة قديمة</span><b>- {money(calc.buybackOut)}</b></div><div><span>مصاريف نقدية</span><b>- {money(calc.cashExpenses)}</b></div></div></Card>
      <Card><div className="card-title"><Landmark size={18}/><b>البنك والبطاقات</b></div><div className="purity"><div><span>مبيعات بنك/بطاقة</span><b>{money(calc.bankSales)}</b></div><div><span>مصاريف بنك/بطاقة</span><b>- {money(calc.bankExpenses)}</b></div><div><span>دفعات مختلطة غير موزعة</span><b>{money(calc.mixedSales)}</b></div></div><div className="notice info mt"><CreditCard size={17}/> الدفعات المختلطة تظهر منفصلة حتى لا ننسبها للصندوق أو البنك بشكل خاطئ.</div></Card>
    </div>

    <Card className="mt">
      <div className="card-title"><WalletCards size={18}/><b>سجل إغلاقات الصندوق</b></div>
      {data.closings.length?<div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>المتوقع USD</th><th>الفعلي USD</th><th>الفرق USD</th><th>المتوقع SYP</th><th>الفعلي SYP</th><th>الفرق SYP</th><th>الحالة</th></tr></thead><tbody>{data.closings.map(x=><tr key={x.id}><td>{x.businessDate}</td><td>{x.expectedUsd}</td><td>{x.countedUsd}</td><td>{x.differenceUsd}</td><td>{x.expectedSyp}</td><td>{x.countedSyp}</td><td>{x.differenceSyp}</td><td><span className={`badge ${x.syncStatus||'pending'}`}>{x.syncStatus||'pending'}</span></td></tr>)}</tbody></table></div>:<p className="muted">لا يوجد إغلاق صندوق مسجل بعد.</p>}
    </Card>

    <Card className="mt"><div className="card-title"><WalletCards size={18}/><b>ملاحظة محاسبية</b></div><p className="muted">إغلاق الصندوق يحفظ جرد النقد الفعلي والفرق، ولا يغيّر الفواتير القديمة. ميزان المراجعة الرسمي والقيد المزدوج موجودان في صفحة الحسابات.</p><div className="notice info"><Scale size={17}/> الفضة القديمة المستخدمة كجزء من ثمن فاتورة البيع لا تُحسب كنقد داخل الصندوق؛ تُحفظ كقيمة مقايضة مستقلة.</div></Card>
  </>
}
