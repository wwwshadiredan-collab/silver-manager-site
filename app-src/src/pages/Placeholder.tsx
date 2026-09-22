import { Card, PageHeader } from '../components/UI'

export function Placeholder({title,description,items=[]}:{title:string,description:string,items?:string[]}){
  return <><PageHeader title={title} description={description}/><Card><div className="placeholder"><h3>الوحدة مُهيّأة ضمن هيكل Silver Manager</h3><p>الأساس الأوفلاين والملاحة موجودان، وسيتم تنفيذ تدفق العمل الكامل لهذه الوحدة على نفس قاعدة البيانات المحلية المستقلة.</p>{items.length>0&&<ul>{items.map(x=><li key={x}>{x}</li>)}</ul>}</div></Card></>
}
