import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ScrollText, Sigma } from 'lucide-react'
import { Card, PageHeader } from '../components/UI'
import { db } from '../db'
import { D, money } from '../lib/money'
import { currentShopId, supabase } from '../lib/supabase'

type TrialRow={code:string;name:string;account_type:string;debit:number|string;credit:number|string;balance:number|string}

export function Accounts(){
  const [rows,setRows]=useState<TrialRow[]>([]);const [loading,setLoading]=useState(false);const [message,setMessage]=useState('')
  const refresh=async()=>{setLoading(true);setMessage('');try{
    if(navigator.onLine&&currentShopId()){
      const {data,error}=await supabase.from('v_trial_balance').select('code,name,account_type,debit,credit,balance').eq('shop_id',currentShopId()).order('code')
      if(error) throw error
      const clean=(data||[]) as TrialRow[];setRows(clean);await db.settings.put({key:'trialBalanceCache',value:JSON.stringify(clean)});setMessage('تم تحديث ميزان المراجعة من الخادم.')
    }else{
      const cached=await db.settings.get('trialBalanceCache');setRows(cached?.value?JSON.parse(cached.value):[]);setMessage('أوفلاين: يتم عرض آخر ميزان مراجعة محفوظ محلياً.')
    }
  }catch(e){const cached=await db.settings.get('trialBalanceCache');setRows(cached?.value?JSON.parse(cached.value):[]);setMessage(e instanceof Error?e.message:'تعذر تحميل الحسابات')}finally{setLoading(false)}}
  useEffect(()=>{refresh()},[])
  const totals=useMemo(()=>rows.reduce((a,r)=>({debit:D(a.debit).add(r.debit||0).toString(),credit:D(a.credit).add(r.credit||0).toString()}),{debit:'0',credit:'0'}),[rows])
  const balanced=D(totals.debit).eq(totals.credit)
  return <>
    <PageHeader title="الحسابات والدفتر العام" description="ميزان مراجعة فعلي من القيود المزدوجة الناتجة عن المبيعات والمشتريات والمصاريف والدفعات" actions={<button className="btn" onClick={refresh} disabled={loading}><RefreshCw size={16}/>{loading?'جاري التحديث…':'تحديث'}</button>}/>
    {message&&<div className="notice info">{message}</div>}
    <div className="stats-grid compact"><div className="stat"><span>إجمالي المدين</span><strong>{money(totals.debit)}</strong></div><div className="stat"><span>إجمالي الدائن</span><strong>{money(totals.credit)}</strong></div><div className="stat"><span>حالة القيد</span><strong>{rows.length?(balanced?'متوازن':'يحتاج مراجعة'):'لا بيانات'}</strong></div><div className="stat"><span>عدد الحسابات</span><strong>{rows.length}</strong></div></div>
    <Card className="mt"><div className="card-title"><ScrollText size={18}/><b>ميزان المراجعة</b></div>{rows.length?<div className="table-wrap"><table><thead><tr><th>الكود</th><th>الحساب</th><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>{rows.map(r=><tr key={r.code}><td className="mono">{r.code}</td><td><b>{r.name}</b></td><td>{r.account_type}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td><td>{money(r.balance)}</td></tr>)}</tbody></table></div>:<div className="empty">لا يوجد ميزان مراجعة محفوظ بعد. نفّذ مزامنة وأعد المحاولة.</div>}</Card>
    <Card className="mt"><div className="card-title"><Sigma size={18}/><b>كيف يعمل القيد المزدوج؟</b></div><p className="muted">عند مزامنة العمليات إلى الخادم، يقوم Silver Manager بإنشاء قيود محاسبية آلية للمبيعات، المشتريات، المصاريف، الدفعات وشراء الفضة القديمة. هذه الصفحة تقرأ الناتج الفعلي ولا تعتمد على أرقام ثابتة.</p></Card>
  </>
}
