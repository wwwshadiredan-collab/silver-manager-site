import { FormEvent, useEffect, useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { db } from '../db'
import { Card, PageHeader } from '../components/UI'
import { supabase, currentShopId } from '../lib/supabase'

export function Settings(){
  const [shop,setShop]=useState(''); const [currency,setCurrency]=useState('USD'); const [rate,setRate]=useState('1.20'); const [saved,setSaved]=useState(false); const [error,setError]=useState('')
  const [platformAdmin,setPlatformAdmin]=useState(false); const [licenseLabel,setLicenseLabel]=useState(''); const [licenseCode,setLicenseCode]=useState(''); const [licenseBusy,setLicenseBusy]=useState(false)
  useEffect(()=>{(async()=>{
    setShop((await db.settings.get('shopName'))?.value||localStorage.getItem('silver-manager-shop-name')||'')
    setCurrency((await db.settings.get('currency'))?.value||localStorage.getItem('silver-manager-currency')||'USD')
    setRate((await db.settings.get('pureSilverRate'))?.value||'1.20')
    if(navigator.onLine){
      const {data}=await supabase.rpc('is_platform_admin')
      setPlatformAdmin(Boolean(data))
    }
  })()},[])

  const submit=async(e:FormEvent)=>{e.preventDefault();setError('');try{
    await db.settings.bulkPut([{key:'shopName',value:shop},{key:'currency',value:currency},{key:'pureSilverRate',value:rate}])
    localStorage.setItem('silver-manager-shop-name',shop);localStorage.setItem('silver-manager-currency',currency)
    if(navigator.onLine&&currentShopId()){
      const {error:shopErr}=await supabase.from('shops').update({name:shop,currency_code:currency}).eq('id',currentShopId())
      if(shopErr) throw shopErr
      const {error:rateErr}=await supabase.from('silver_rates').insert({shop_id:currentShopId(),currency_code:currency,rate_per_pure_gram:Number(rate),source:'manual'})
      if(rateErr) throw rateErr
    }
    setSaved(true);setTimeout(()=>setSaved(false),1800)
  }catch(err){setError(err instanceof Error?err.message:'تعذر حفظ الإعدادات')}}

  const issueLicense=async()=>{
    setLicenseBusy(true);setError('');setLicenseCode('')
    try{
      if(!navigator.onLine) throw new Error('إصدار كود جديد يحتاج إنترنت.')
      const {data,error}=await supabase.rpc('issue_license_code',{p_label:licenseLabel||null})
      if(error) throw error
      setLicenseCode(String(data||''))
    }catch(err){setError(err instanceof Error?err.message:'تعذر إصدار كود التفعيل')}
    finally{setLicenseBusy(false)}
  }

  return <><PageHeader title="الإعدادات" description="إعدادات مستقلة تماماً عن أي تطبيق آخر"/>
    <form onSubmit={submit}><div className="grid-2"><Card><h3>المنشأة</h3><label className="field"><span>اسم المحل</span><input value={shop} onChange={e=>setShop(e.target.value)}/></label><label className="field"><span>العملة</span><input value={currency} onChange={e=>setCurrency(e.target.value)}/></label></Card><Card><h3>سعر الفضة</h3><label className="field"><span>سعر غرام الفضة الخالصة 999</span><input type="number" step="0.0001" min="0.0001" value={rate} onChange={e=>setRate(e.target.value)}/></label><p className="muted">كل فاتورة تحفظ Snapshot للسعر المستخدم وقت العملية، لذلك تغيير السعر اليوم لا يغيّر الفواتير القديمة.</p></Card></div>{error&&<div className="notice danger mt">{error}</div>}<div className="button-row end mt"><button className="btn primary">حفظ الإعدادات</button>{saved&&<span className="save-ok">تم الحفظ</span>}</div></form>

    {platformAdmin&&<Card className="mt"><div className="card-title"><KeyRound size={18}/><b>تراخيص البيع</b></div><p className="muted">كل زبون جديد يحتاج كود تفعيل لمرة واحدة. بدون الكود لا يمكن إنشاء نسخة أو حساب جديد.</p><div className="form-grid"><label className="field"><span>اسم/ملاحظة الزبون</span><input value={licenseLabel} onChange={e=>setLicenseLabel(e.target.value)} placeholder="مثال: محل أبو أحمد"/></label></div><button type="button" className="btn primary" onClick={issueLicense} disabled={licenseBusy}>{licenseBusy?'جاري الإصدار…':'إصدار كود تفعيل جديد'}</button>{licenseCode&&<div className="notice success mt"><div><b>كود التفعيل — يظهر لك الآن فقط</b><div className="mono" style={{marginTop:6,wordBreak:'break-all'}}>{licenseCode}</div></div><button type="button" className="btn small" onClick={()=>navigator.clipboard.writeText(licenseCode)}><Copy size={15}/> نسخ</button></div>}</Card>}
  </>
}
