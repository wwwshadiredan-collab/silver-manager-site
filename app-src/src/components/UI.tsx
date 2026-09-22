import type { ReactNode } from 'react'

export function PageHeader({title,description,actions}:{title:string,description?:string,actions?:ReactNode}){
  return <div className="page-header"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="header-actions">{actions}</div>}</div>
}
export function Card({children,className=''}:{children:ReactNode,className?:string}){return <div className={`card ${className}`}>{children}</div>}
export function Stat({label,value,sub}:{label:string,value:string,sub?:string}){return <div className="stat"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
export function Empty({text='لا توجد بيانات'}:{text?:string}){return <div className="empty">{text}</div>}
