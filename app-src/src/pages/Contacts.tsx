import { FormEvent, useCallback, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { db } from '../db'
import { newId } from '../lib/ids'
import { saveCustomer, saveSupplier } from '../lib/repository'
import { useData } from '../lib/useData'
import { Card, Empty, PageHeader } from '../components/UI'

export function Contacts({type}:{type:'customers'|'suppliers'}){
  const isCustomer=type==='customers'
  const loader=useCallback(()=>isCustomer?db.customers.toArray():db.suppliers.toArray(),[isCustomer])
  const {data,refresh}=useData(loader,[] as any[])
  const [show,setShow]=useState(false); const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [opening,setOpening]=useState('0.00'); const [notes,setNotes]=useState('')
  const submit=async(e:FormEvent)=>{e.preventDefault(); const input={id:newId(),name,phone,email:'',address:'',openingBalance:opening,notes}; if(isCustomer)await saveCustomer(input); else await saveSupplier(input); setName('');setPhone('');setOpening('0.00');setNotes('');setShow(false);refresh()}
  return <><PageHeader title={isCustomer?'العملاء':'الموردون'} description={isCustomer?'ملفات العملاء والأرصدة والحركة':'ملفات الموردين والأرصدة والمشتريات'} actions={<button className="btn primary" onClick={()=>setShow(true)}><Plus size={17}/> إضافة {isCustomer?'عميل':'مورد'}</button>}/><Card>{data.filter(x=>!x.archived).length?<div className="table-wrap"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>الرصيد الافتتاحي</th><th>ملاحظات</th></tr></thead><tbody>{data.filter(x=>!x.archived).map(x=><tr key={x.id}><td><b>{x.name}</b></td><td>{x.phone||'—'}</td><td>{x.openingBalance}</td><td>{x.notes||'—'}</td></tr>)}</tbody></table></div>:<Empty/>}</Card>{show&&<div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><h3>إضافة {isCustomer?'عميل':'مورد'}</h3><button className="icon-btn" type="button" onClick={()=>setShow(false)}><X/></button></div><label className="field"><span>الاسم</span><input value={name} onChange={e=>setName(e.target.value)} required autoFocus/></label><label className="field"><span>الهاتف</span><input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label className="field"><span>رصيد افتتاحي</span><input type="number" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label><label className="field"><span>ملاحظات</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label><button className="btn primary wide">حفظ محلياً</button></form></div>}</>
}
