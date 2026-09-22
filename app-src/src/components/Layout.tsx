import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Archive, Bot, Boxes, Building2, ChevronLeft, ClipboardCheck, Gauge, Landmark, Menu, PackagePlus, Receipt, Settings, ShoppingCart, Truck, Users, WalletCards, Wrench, X, RefreshCcw, FileBarChart, ScrollText, Scale } from 'lucide-react'
import { useEffect, useState } from 'react'
import { OfflineStatus } from './OfflineStatus'
import { supabase } from '../lib/supabase'
import { pullFromServer } from '../lib/remote'
import { clearDeviceAuthorization } from '../lib/auth'

const links=[
  ['/', 'لوحة التحكم', Gauge],
  ['/pos','نقطة البيع',ShoppingCart],
  ['/inventory','المخزون',Boxes],
  ['/purchases','المشتريات',PackagePlus],
  ['/buyback','شراء الفضة القديمة',Scale],
  ['/refining','الكسر والتصفية',RefreshCcw],
  ['/repairs','الإصلاح والطلبات',Wrench],
  ['/customers','العملاء',Users],
  ['/suppliers','الموردون',Truck],
  ['/expenses','المصاريف',Receipt],
  ['/cash','الصندوق والبنوك',Landmark],
  ['/accounts','الحسابات',WalletCards],
  ['/reports','التقارير',FileBarChart],
  ['/stocktake','الجرد',ClipboardCheck],
  ['/assistant','المساعد الذكي',Bot],
  ['/archive','الأرشيف',Archive],
  ['/diagnostics','الأوفلاين والمزامنة',RefreshCcw],
  ['/audit','سجل التدقيق',ScrollText],
  ['/settings','الإعدادات',Settings],
] as const

export function Layout(){
  const [open,setOpen]=useState(false)
  const shopName=localStorage.getItem('silver-manager-shop-name')||'Silver Manager'
  useEffect(()=>{if(navigator.onLine) pullFromServer().catch(()=>{})},[])
  const nav=useNavigate(); const loc=useLocation()
  const canBack=loc.pathname!=='/'
  return <div className="app-shell">
    <aside className={`sidebar ${open?'open':''}`}>
      <div className="brand"><div className="brand-mark"><img src="./silver-logo.svg" alt="Silver Manager" className="logo-image"/></div><div className="brand-copy"><b>{shopName}</b><small>Silver Manager • AL Smart Systems</small></div><button className="icon-btn mobile-only" onClick={()=>setOpen(false)}><X/></button></div>
      <nav>{links.map(([to,label,Icon])=><NavLink key={to} to={to} onClick={()=>setOpen(false)} className={({isActive})=>isActive?'active':''}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="top-left"><button className="icon-btn mobile-only" onClick={()=>setOpen(true)}><Menu/></button>{canBack&&<button className="back-btn" onClick={()=>nav(-1)}><ChevronLeft size={18}/> رجوع</button>}</div>
        <div className="top-actions"><OfflineStatus/><button className="btn ghost small" onClick={async()=>{await supabase.auth.signOut();clearDeviceAuthorization();location.hash='#/login'}}>تسجيل خروج</button></div>
      </header>
      <div className="content"><Outlet/></div>
    </main>
  </div>
}
