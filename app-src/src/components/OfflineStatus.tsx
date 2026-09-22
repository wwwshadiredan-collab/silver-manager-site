import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { db } from '../db'
import { syncNow } from '../lib/sync'
import { DATA_CHANGED } from '../lib/events'

export function OfflineStatus(){
  const [online,setOnline]=useState(navigator.onLine)
  const [pending,setPending]=useState(0)
  const [syncing,setSyncing]=useState(false)
  const [conflicts,setConflicts]=useState(0)

  const refresh=async()=>{
    setOnline(navigator.onLine)
    const rows=await db.outbox.toArray()
    setPending(rows.length)
    setConflicts(rows.filter(r=>r.syncStatus==='conflict').length)
  }

  useEffect(()=>{
    let disposed=false
    let autoSyncRunning=false
    let rerunRequested=false

    const syncPendingNow=async()=>{
      if(disposed || !navigator.onLine) return
      if(autoSyncRunning){ rerunRequested=true; return }
      const queued=await db.outbox.toArray()
      const shouldSync=queued.some(x=>x.syncStatus==='pending'||x.syncStatus==='error'||(x.syncStatus==='conflict'&&x.lastError==='missing server entity'))
      if(!shouldSync) return
      autoSyncRunning=true
      setSyncing(true)
      try{
        await syncNow()
      }finally{
        autoSyncRunning=false
        if(!disposed){
          await refresh()
          setSyncing(false)
          if(rerunRequested){
            rerunRequested=false
            void syncPendingNow()
          }
        }
      }
    }

    refresh()
    const onNetwork=()=>{refresh(); if(navigator.onLine) void syncPendingNow()}
    const onFocus=()=>{refresh(); if(navigator.onLine) void syncPendingNow()}
    const onVisibility=()=>{if(document.visibilityState==='visible'){refresh(); if(navigator.onLine) void syncPendingNow()}}
    const onDataChanged=()=>{refresh(); void syncPendingNow()}

    window.addEventListener('online',onNetwork)
    window.addEventListener('offline',onNetwork)
    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onVisibility)
    window.addEventListener(DATA_CHANGED,onDataChanged)

    void syncPendingNow()

    return ()=>{
      disposed=true
      window.removeEventListener('online',onNetwork)
      window.removeEventListener('offline',onNetwork)
      window.removeEventListener('focus',onFocus)
      document.removeEventListener('visibilitychange',onVisibility)
      window.removeEventListener(DATA_CHANGED,onDataChanged)
    }
  },[])

  const run=async()=>{
    setSyncing(true)
    try{ await syncNow() }
    finally{ await refresh(); setSyncing(false) }
  }

  const cls=conflicts?'status conflict':online?'status online':'status offline'
  return <button className={cls} onClick={run} title="مزامنة الآن">
    {conflicts?<AlertTriangle size={16}/>:online?<Wifi size={16}/>:<WifiOff size={16}/>}
    <span>{syncing?'جاري المزامنة':conflicts?`${conflicts} تعارض`:online?(pending?`${pending} بانتظار المزامنة`:'متصل'):`أوفلاين • ${pending} محفوظة`}</span>
    <RefreshCw size={15} className={syncing?'spin':''}/>
  </button>
}
