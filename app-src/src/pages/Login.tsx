import { FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, LockKeyhole, WifiOff } from 'lucide-react'
import { supabase, backendConfigured, currentShopId } from '../lib/supabase'
import { readDeviceAuthorization, resolveMembershipShop, rememberDeviceAuthorization } from '../lib/auth'

export function Login(){
  const nav=useNavigate()
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [mode,setMode]=useState<'login'|'activate'>('login')
  const [activationCode,setActivationCode]=useState('')
  const [shopName,setShopName]=useState('')
  const [currency,setCurrency]=useState('USD')
  const [error,setError]=useState('')
  const [info,setInfo]=useState('')
  const [ready,setReady]=useState(false)
  const [hasSession,setHasSession]=useState(false)

  useEffect(()=>{(async()=>{
    const {data}=await supabase.auth.getSession()
    if(data.session){setHasSession(true); if(currentShopId()) nav('/',{replace:true})}
    setReady(true)
  })()},[])

  const finishLogin=async(userId:string)=>{
    const membership=await resolveMembershipShop(userId)
    if(!membership?.shop_id){
      await supabase.auth.signOut()
      throw new Error('هذا الحساب غير مفعّل على نسخة Silver Manager. تواصل مع مزوّد النظام.')
    }
    rememberDeviceAuthorization(userId,membership.shop_id)
    const shop=(membership as any).shops
    if(shop?.name) localStorage.setItem('silver-manager-shop-name',shop.name)
    if(shop?.currency_code) localStorage.setItem('silver-manager-currency',shop.currency_code)
    nav('/',{replace:true})
  }

  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setBusy(true); setError(''); setInfo('')
    try{
      if(!navigator.onLine){
        if(mode!=='login') throw new Error('تفعيل النسخة لأول مرة يحتاج إنترنت.')
        const auth=readDeviceAuthorization()
        if(auth){
          rememberDeviceAuthorization(auth.userId,auth.shopId)
          nav('/',{replace:true}); return
        }
        throw new Error('أول تسجيل دخول على هذا الجهاز لازم يكون مع وجود إنترنت.')
      }

      if(mode==='activate'){
        if(!activationCode.trim()) throw new Error('أدخل كود التفعيل.')
        if(!shopName.trim()) throw new Error('أدخل اسم المحل.')
        if(password.length<8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل.')

        const {data,error:activationError}=await supabase.functions.invoke('silver-activate',{
          body:{
            code:activationCode.trim(),
            email:email.trim(),
            password,
            shopName:shopName.trim(),
            currency,
            timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Damascus',
          },
        })
        if(activationError){
          let friendly=''
          try{
            const response=(activationError as any)?.context
            if(response&&typeof response.clone==='function'){
              const payload=await response.clone().json()
              friendly=String(payload?.error||'')
            }
          }catch{}
          throw new Error(friendly||'تعذر التحقق من كود التفعيل. حاول مرة ثانية.')
        }
        if(data?.error) throw new Error(data.error)

        const {data:loginData,error:loginError}=await supabase.auth.signInWithPassword({email,password})
        if(loginError) throw loginError
        await finishLogin(loginData.user.id)
        return
      }

      const {data,error}=await supabase.auth.signInWithPassword({email,password})
      if(error) throw error
      await finishLogin(data.user.id)
    }catch(err){
      const message=err instanceof Error?err.message:'تعذر تنفيذ العملية'
      setError(message)
    }finally{setBusy(false)}
  }

  if(!ready) return <div className="auth-page"><div className="auth-card">جاري التحقق…</div></div>
  if(hasSession && currentShopId()) return <Navigate to="/" replace/>
  return <div className="auth-page"><form className="auth-card" onSubmit={submit}>
    <div className="auth-logo"><img src="./silver-logo.svg" alt="Silver Manager" className="auth-logo-image"/></div>
    <h1>Silver Manager</h1>
    <p>{mode==='login'?'دخول إلى نسخة مفعّلة':'تفعيل نسخة مرخّصة لأول مرة'}</p>
    {!backendConfigured&&<div className="notice warning">الباك إند غير مهيأ في متغيرات البيئة.</div>}
    {!navigator.onLine&&<div className="notice info"><WifiOff size={18}/>أنت أوفلاين. يسمح بالدخول فقط لجهاز سبق تفويضه أونلاين.</div>}
    {mode==='activate'&&<>
      <label className="field"><span>كود التفعيل</span><input autoComplete="off" required value={activationCode} onChange={e=>setActivationCode(e.target.value.toUpperCase())} placeholder="SM-..."/></label>
      <label className="field"><span>اسم محل الفضة</span><input required value={shopName} onChange={e=>setShopName(e.target.value)} placeholder="اسم المحل"/></label>
      <label className="field"><span>العملة</span><select value={currency} onChange={e=>setCurrency(e.target.value)}><option>USD</option><option>SYP</option><option>EUR</option><option>LBP</option><option>SAR</option><option>AED</option></select></label>
    </>}
    <label className="field"><span>البريد الإلكتروني</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="field"><span>كلمة المرور</span><input type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='activate'?8:undefined} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {info&&<div className="notice info">{info}</div>}{error&&<div className="notice danger">{error}</div>}
    <button className="btn primary wide" disabled={busy}>{mode==='login'?<LockKeyhole size={18}/>:<KeyRound size={18}/>} {busy?'جاري التنفيذ…':mode==='login'?'دخول':'تفعيل النسخة وإنشاء الحساب'}</button>
    <button type="button" className="btn ghost wide" onClick={()=>{setMode(mode==='login'?'activate':'login');setError('');setInfo('')}}>{mode==='login'?'معك كود تفعيل؟ فعّل نسختك':'العودة إلى تسجيل الدخول'}</button>
  </form></div>
}
