import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Edit3, Plus, Search, PackageSearch, Weight, Gem } from 'lucide-react'
import { db } from '../db'
import { archiveItem } from '../lib/repository'
import { useData } from '../lib/useData'
import { Card, Empty, PageHeader } from '../components/UI'
import { calcSilverPrice, D, money, weight } from '../lib/money'

export function Inventory(){
  const [q,setQ]=useState('')
  const loader=useCallback(async()=>({
    items:await db.silverItems.toArray(),
    rate:(await db.settings.get('pureSilverRate'))?.value||'1.20',
    fx:(await db.settings.get('usdToSypRate'))?.value||'1',
  }),[])
  const {data}=useData(loader,{items:[],rate:'1.20',fx:'1'} as Awaited<ReturnType<typeof loader>>)
  const rows=useMemo(()=>data.items.filter(i=>!i.archived && i.status!=='sold' && `${i.sku} ${i.name} ${i.category} ${i.purity}`.toLowerCase().includes(q.toLowerCase())),[data.items,q])

  const livePrice=(i:(typeof rows)[number])=>calcSilverPrice({
    netWeight:i.netWeight,purity:i.purity,ratePerPureGram:data.rate,
    makingType:i.makingChargeType,makingValue:i.makingChargeValue,
    stoneCost:i.stoneCost,otherCost:i.otherCost,
  }).total

  const totalWeight=rows.reduce((s,i)=>D(s).add(i.netWeight).toString(),'0')
  const totalPure=rows.reduce((s,i)=>D(s).add(i.pureSilverWeight).toString(),'0')
  const value=rows.reduce((s,i)=>D(s).add(livePrice(i)).toString(),'0')
  const valueSyp=D(value).mul(data.fx||1)

  return <>
    <PageHeader title="المخزون" description="سعر كل قطعة يتحدث تلقائياً حسب سعر غرام الفضة المحدد في لوحة التحكم"/>

    <div className="feature-grid tight-grid mb16">
      <Card className="quick-card compact"><div className="quick-icon"><PackageSearch size={18}/></div><div><b>عدد القطع</b><p>{rows.length} قطعة ظاهرة</p></div></Card>
      <Card className="quick-card compact"><div className="quick-icon"><Weight size={18}/></div><div><b>الوزن الصافي</b><p>{weight(totalWeight)} غ</p></div></Card>
      <Card className="quick-card compact"><div className="quick-icon"><Gem size={18}/></div><div><b>الوزن الخالص</b><p>{weight(totalPure)} غ</p></div></Card>
      <Card className="quick-card compact"><div className="quick-icon"><Gem size={18}/></div><div><b>القيمة البيعية الحالية</b><p>{money(value)} USD</p><small>{money(valueSyp)} SYP</small></div></Card>
    </div>

    <Card>
      <div className="toolbar">
        <label className="search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث بالاسم أو SKU أو العيار"/></label>
        <Link className="btn primary" to="/inventory/new"><Plus size={17}/> إضافة قطعة</Link>
      </div>
      {rows.length? <div className="table-wrap"><table><thead><tr><th>SKU</th><th>القطعة</th><th>العيار</th><th>الوزن الصافي</th><th>الخالص</th><th>السعر الحالي</th><th>الحالة</th><th></th></tr></thead><tbody>{rows.map(i=>{const p=livePrice(i);return <tr key={i.id}><td>{i.sku}</td><td><b>{i.name}</b><small>{i.category}</small></td><td>{i.purity}</td><td>{i.netWeight} غ</td><td>{i.pureSilverWeight} غ</td><td><b>{p} USD</b><small>{money(D(p).mul(data.fx||1))} SYP</small></td><td><span className={`badge ${i.status}`}>{statusLabel(i.status)}</span></td><td><div className="row-actions"><Link className="icon-btn" to={`/inventory/${i.id}/edit`} title="تعديل"><Edit3 size={17}/></Link><button className="icon-btn danger" onClick={()=>archiveItem(i.id,true)} title="أرشفة"><Archive size={17}/></button></div></td></tr>})}</tbody></table></div>:<Empty text="لا توجد قطع مطابقة"/>}
    </Card>
  </>
}
function statusLabel(s:string){return ({available:'متاح',reserved:'محجوز',sold:'مباع',returned:'مرتجع',repair:'إصلاح',scrap:'كسر',archived:'مؤرشف'} as Record<string,string>)[s]||s}
