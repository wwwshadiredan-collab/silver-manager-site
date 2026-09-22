import { FormEvent, useCallback, useMemo, useState } from 'react'
import { Check, Plus, Search, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { db } from '../db'
import { useData } from '../lib/useData'
import { calcSilverPrice, D, money } from '../lib/money'
import { newId, getDeviceId } from '../lib/ids'
import { postSale } from '../lib/repository'
import type { SaleLine, SilverItem } from '../types'
import { Card, Empty, PageHeader } from '../components/UI'

export function POS(){
  const loader=useCallback(async()=>({
    items:(await db.silverItems.toArray()).filter(i=>!i.archived&&i.status==='available'),
    customers:await db.customers.toArray(),
    rate:(await db.settings.get('pureSilverRate'))?.value||'1.20',
    fx:(await db.settings.get('usdToSypRate'))?.value||'1',
  }),[])
  const {data,refresh}=useData(loader,{items:[],customers:[],rate:'1.20',fx:'1'} as Awaited<ReturnType<typeof loader>>)

  const [query,setQuery]=useState('')
  const [cart,setCart]=useState<SaleLine[]>([])
  const [customerId,setCustomerId]=useState('')
  const [discount,setDiscount]=useState('0')
  const [tax,setTax]=useState('0')
  const [usdCash,setUsdCash]=useState('0')
  const [sypCash,setSypCash]=useState('0')
  const [oldSilverWeight,setOldSilverWeight]=useState('0')
  const [oldSilverPurity,setOldSilverPurity]=useState('925')
  const [success,setSuccess]=useState('')

  const filtered=useMemo(()=>data.items.filter(i=>`${i.sku} ${i.name} ${i.category}`.toLowerCase().includes(query.toLowerCase())),[data.items,query])

  const itemPrice=(item:SilverItem)=>calcSilverPrice({
    netWeight:item.netWeight,purity:item.purity,ratePerPureGram:data.rate,
    makingType:item.makingChargeType,makingValue:item.makingChargeValue,
    stoneCost:item.stoneCost,otherCost:item.otherCost,
  })

  const add=(item:SilverItem)=>{
    if(cart.some(x=>x.itemId===item.id))return
    const p=itemPrice(item)
    setCart(c=>[...c,{itemId:item.id,itemName:item.name,sku:item.sku,netWeight:item.netWeight,purity:item.purity,ratePerGram:data.rate,makingCharge:p.makingCharge,stoneCost:item.stoneCost,lineTotal:p.total}])
  }

  const subtotal=cart.reduce((a,l)=>D(a).add(l.lineTotal).toString(),'0')
  const total=money(D(subtotal).sub(discount||0).add(tax||0))
  const sypUsdEquivalent=Number(data.fx)>0?money(D(sypCash||0).div(data.fx)):'0.00'
  const oldSilverValueUsd=money(D(oldSilverWeight||0).mul(D(oldSilverPurity||0).div(1000)).mul(data.rate||0))
  const cashPaid=money(D(usdCash||0).add(sypUsdEquivalent))
  const covered=money(D(cashPaid).add(oldSilverValueUsd))
  const balanceRaw=D(total).sub(covered)
  const balance=money(balanceRaw.isNegative()?0:balanceRaw)
  const paymentParts=[D(usdCash||0).greaterThan(0),D(sypCash||0).greaterThan(0),D(oldSilverValueUsd).greaterThan(0)].filter(Boolean).length

  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(!cart.length)return alert('أضف قطعة واحدة على الأقل')
    if(Number(data.rate)<=0)return alert('حدد سعر غرام الفضة من لوحة التحكم أولاً')
    if(Number(sypCash)>0&&Number(data.fx)<=0)return alert('حدد سعر صرف الدولار من لوحة التحكم أولاً')
    if(Number(oldSilverPurity)<=0||Number(oldSilverPurity)>1000)return alert('عيار الفضة القديمة يجب أن يكون بين 1 و1000')
    if(D(covered).greaterThan(total))return alert('إجمالي الدفعات أكبر من قيمة الفاتورة')
    if(D(balance).greaterThan(0)&&!customerId)return alert('عند وجود مبلغ متبقٍ يجب اختيار العميل')

    const now=new Date().toISOString()
    const id=newId()
    const invoiceNo=`SV-${now.slice(0,10).replaceAll('-','')}-${id.slice(0,6).toUpperCase()}`
    await postSale({
      id,invoiceNo,customerId:customerId||undefined,lines:cart,
      subtotal:money(subtotal),discount:money(discount||0),tax:money(tax||0),total,
      paid:cashPaid,balance,
      paymentMethod:paymentParts>1||D(oldSilverValueUsd).greaterThan(0)?'mixed':'cash',
      paymentBreakdown:{
        usdCash:money(usdCash||0),
        sypCash:money(sypCash||0),
        sypPerUsd:money(data.fx||0),
        sypUsdEquivalent,
        oldSilverNetWeight:String(D(oldSilverWeight||0).toDecimalPlaces(3).toFixed(3)),
        oldSilverPurity:String(D(oldSilverPurity||0).toDecimalPlaces(3).toFixed(3)),
        oldSilverValueUsd,
      },
      rateSnapshot:{pureSilverPerGram:data.rate,usdToSyp:data.fx},
      status:'posted',createdAt:now,updatedAt:now,version:1,archived:false,syncStatus:'pending',deviceId:getDeviceId(),
    })

    setSuccess(`تم تسجيل الفاتورة ${invoiceNo} محلياً بنجاح`)
    setCart([]);setDiscount('0');setTax('0');setUsdCash('0');setSypCash('0');setOldSilverWeight('0');setOldSilverPurity('925')
    refresh()
  }

  return <>
    <PageHeader title="نقطة البيع" description="الأسعار مرتبطة بسعر الفضة اليوم، والدفع يمكن تقسيمه بين دولار وسوري وفضة قديمة"/>
    {success&&<div className="notice success"><Check size={18}/>{success}</div>}

    <Card className="hero-panel slim-hero">
      <div className="hero-content">
        <div>
          <div className="eyebrow"><Sparkles size={16}/> شاشة بيع عملية</div>
          <h2>سعر السوق الحالي يُطبق تلقائياً على كل قطعة</h2>
          <p>السعر محسوب حسب الوزن والعيار والأجرة، والفاتورة تحفظ سعر الفضة وسعر الصرف المستخدمين وقت البيع.</p>
        </div>
        <div className="hero-pills">
          <div><span>عدد العناصر المتاحة</span><b>{filtered.length}</b></div>
          <div><span>سعر الخالص/غ</span><b>{data.rate} USD</b></div>
          <div><span>دولار/سوري</span><b>{data.fx} SYP</b></div>
        </div>
      </div>
    </Card>

    <div className="pos-grid mt">
      <Card>
        <div className="toolbar"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن قطعة"/></label></div>
        <div className="product-grid">{filtered.length?filtered.map(i=>{const p=itemPrice(i);return <button className="product" key={i.id} onClick={()=>add(i)}><div><b>{i.name}</b><small>{i.sku} • عيار {i.purity}</small></div><div className="product-meta"><span>{i.netWeight} غ</span><strong>{p.total} USD</strong><small>{money(D(p.total).mul(data.fx||1))} SYP</small></div><Plus size={18}/></button>}):<Empty text="لا توجد قطع متاحة"/>}</div>
      </Card>

      <form onSubmit={submit}>
        <Card className="invoice-card">
          <div className="invoice-head"><h3>الفاتورة</h3><div className="mini-status"><ShieldCheck size={15}/> حفظ محلي آمن</div></div>
          {cart.length?<div className="cart-list">{cart.map(l=><div className="cart-line" key={l.itemId}><div><b>{l.itemName}</b><small>{l.netWeight} غ • عيار {l.purity} • سعر الخالص {l.ratePerGram}</small></div><strong>{l.lineTotal} USD</strong><button type="button" className="icon-btn danger" onClick={()=>setCart(c=>c.filter(x=>x.itemId!==l.itemId))}><Trash2 size={16}/></button></div>)}</div>:<Empty text="السلة فارغة"/>}

          <div className="form-grid mt">
            <label className="field"><span>العميل</span><select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">بدون عميل إذا الفاتورة مسددة بالكامل</option>{data.customers.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="field"><span>خصم — USD</span><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
            <label className="field"><span>ضريبة/رسوم — USD</span><input type="number" min="0" step="0.01" value={tax} onChange={e=>setTax(e.target.value)}/></label>
          </div>

          <Card className="mt">
            <h3>طرق الدفع</h3>
            <div className="form-grid">
              <label className="field"><span>دفع بالدولار — USD</span><input type="number" min="0" step="0.01" value={usdCash} onChange={e=>setUsdCash(e.target.value)}/></label>
              <label className="field"><span>دفع بالليرة السورية — SYP</span><input type="number" min="0" step="1" value={sypCash} onChange={e=>setSypCash(e.target.value)}/><small>يعادل {sypUsdEquivalent} USD بسعر صرف {data.fx}</small></label>
              <label className="field"><span>وزن الفضة القديمة الصافي — غ</span><input type="number" min="0" step="0.001" value={oldSilverWeight} onChange={e=>setOldSilverWeight(e.target.value)}/></label>
              <label className="field"><span>عيار الفضة القديمة</span><input type="number" min="1" max="1000" step="1" value={oldSilverPurity} onChange={e=>setOldSilverPurity(e.target.value)}/><small>قيمتها الحالية {oldSilverValueUsd} USD</small></label>
            </div>
          </Card>

          <div className="totals premium-totals">
            <div><span>المجموع الفرعي</span><b>{money(subtotal)} USD</b></div>
            <div><span>الإجمالي</span><b>{total} USD</b></div>
            <div><span>دولار + سوري (بالدولار)</span><b>{cashPaid} USD</b></div>
            <div><span>قيمة الفضة القديمة</span><b>{oldSilverValueUsd} USD</b></div>
            <div><span>إجمالي المسدد</span><b>{covered} USD</b></div>
            <div><span>الباقي</span><b>{balance} USD</b></div>
          </div>

          <button className="btn primary wide" type="submit">تأكيد البيع وحفظه أوفلاين</button>
        </Card>
      </form>
    </div>
  </>
}
