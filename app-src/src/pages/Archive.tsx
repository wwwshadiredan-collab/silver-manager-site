import { useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
import { db } from '../db'
import { archiveItem } from '../lib/repository'
import { useData } from '../lib/useData'
import { Card, Empty, PageHeader } from '../components/UI'

export function ArchivePage(){
  const loader=useCallback(()=>db.silverItems.toArray(),[]); const {data}=useData(loader,[])
  const rows=data.filter(i=>i.archived)
  return <><PageHeader title="الأرشيف" description="العناصر المؤرشفة تبقى محفوظة وقابلة للاسترجاع، ولا نحذف القيود المالية posted حذفاً نهائياً"/><Card>{rows.length?<div className="table-wrap"><table><thead><tr><th>SKU</th><th>القطعة</th><th>العيار</th><th>الوزن</th><th>آخر تعديل</th><th></th></tr></thead><tbody>{rows.map(i=><tr key={i.id}><td>{i.sku}</td><td><b>{i.name}</b></td><td>{i.purity}</td><td>{i.netWeight} غ</td><td>{new Date(i.updatedAt).toLocaleString('ar')}</td><td><button className="btn small" onClick={()=>archiveItem(i.id,false)}><RotateCcw size={15}/> استرجاع</button></td></tr>)}</tbody></table></div>:<Empty text="الأرشيف فارغ"/>}</Card></>
}
