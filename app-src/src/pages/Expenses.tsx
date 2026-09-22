import { FormEvent, useCallback, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { db } from '../db'
import { saveExpense } from '../lib/repository'
import { useData } from '../lib/useData'
import { Card, Empty, PageHeader } from '../components/UI'

const localDateKey=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}

export function Expenses(){
  const loader=useCallback(()=>db.expenses.orderBy('date').reverse().toArray(),[]); const {data,refresh}=useData(loader,[])
  const [show,setShow]=useState(false); const [title,setTitle]=useState(''); const [category,setCategory]=useState('تشغيل'); const [amount,setAmount]=useState('0'); const [date,setDate]=useState(localDateKey()); const [method,setMethod]=useState<'cash'|'card'|'bank'>('cash'); const [notes,setNotes]=useState('')
  const submit=async(e:FormEvent)=>{e.preventDefault(); if(Number(amount)<=0)return alert('المبلغ يجب أن يكون أكبر من صفر'); await saveExpense({title,category,amount,date,paymentMethod:method,notes});setShow(false);setTitle('');setAmount('0');setNotes('');refresh()}
  return <><PageHeader title="المصاريف" description="تسجيل المصروفات مع الاحتفاظ بها محلياً عند انقطاع الإنترنت" actions={<button className="btn primary" onClick={()=>setShow(true)}><Plus size={17}/> مصروف جديد</button>}/><Card>{data.length?<div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>التصنيف</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead><tbody>{data.map(x=><tr key={x.id}><td>{x.date}</td><td><b>{x.title}</b><small>{x.notes}</small></td><td>{x.category}</td><td>{x.paymentMethod}</td><td>{x.amount}</td></tr>)}</tbody></table></div>:<Empty/>}</Card>{show&&<div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><h3>مصروف جديد</h3><button type="button" className="icon-btn" onClick={()=>setShow(false)}><X/></button></div><label className="field"><span>البيان</span><input value={title} onChange={e=>setTitle(e.target.value)} required/></label><label className="field"><span>التصنيف</span><input value={category} onChange={e=>setCategory(e.target.value)} required/></label><label className="field"><span>المبلغ</span><input type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label className="field"><span>التاريخ</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="field"><span>طريقة الدفع</span><select value={method} onChange={e=>setMethod(e.target.value as any)}><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="bank">بنك</option></select></label><label className="field"><span>ملاحظات</span><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="btn primary wide">حفظ المصروف</button></form></div>}</>
}
