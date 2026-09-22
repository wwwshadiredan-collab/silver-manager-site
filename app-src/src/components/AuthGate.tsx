import { PropsWithChildren, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, currentShopId } from '../lib/supabase'
import { bindLocalDataToShop, clearDeviceAuthorization, readDeviceAuthorization } from '../lib/auth'

export function AuthGate({children}:PropsWithChildren){
  const [state,setState]=useState<'checking'|'ok'|'no'>('checking')
  useEffect(()=>{(async()=>{
    const offlineAuth=readDeviceAuthorization()
    const shop=currentShopId() || offlineAuth?.shopId || ''
    try{
      if(!navigator.onLine && offlineAuth?.shopId){
        bindLocalDataToShop(offlineAuth.shopId)
        if(!currentShopId()) localStorage.setItem('silver-manager-shop-id',offlineAuth.shopId)
        setState('ok');return
      }
      const {data}=await supabase.auth.getSession()
      if(data.session && shop){
        bindLocalDataToShop(shop)
        if(!currentShopId()&&offlineAuth?.shopId) localStorage.setItem('silver-manager-shop-id',offlineAuth.shopId)
        setState('ok')
      } else setState('no')
    }catch{
      clearDeviceAuthorization()
      setState('no')
    }
  })()},[])
  if(state==='checking') return <div className="auth-page"><div className="auth-card">جاري تحميل البيانات المحلية…</div></div>
  if(state==='no') return <Navigate to="/login" replace/>
  return <>{children}</>
}
