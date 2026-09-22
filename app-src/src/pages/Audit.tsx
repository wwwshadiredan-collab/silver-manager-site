import { useCallback } from 'react'
import { db } from '../db'
import { useData } from '../lib/useData'
import { Card, Empty, PageHeader } from '../components/UI'

export function Audit(){const loader=useCallback(()=>db.audit.orderBy('createdAt').reverse().toArray(),[]);const {data}=useData(loader,[]);return <><PageHeader title="سجل التدقيق" description="أثر زمني للتعديلات والعمليات المهمة على الجهاز"/><Card>{data.length?<div className="table-wrap"><table><thead><tr><th>الوقت</th><th>النوع</th><th>العملية</th><th>المعرف</th><th>الجهاز</th></tr></thead><tbody>{data.map(x=><tr key={x.id}><td>{new Date(x.createdAt).toLocaleString('ar')}</td><td>{x.entityType}</td><td>{x.action}</td><td className="mono tiny">{x.entityId.slice(0,12)}</td><td className="mono tiny">{x.deviceId.slice(0,10)}</td></tr>)}</tbody></table></div>:<Empty/>}</Card></>}
