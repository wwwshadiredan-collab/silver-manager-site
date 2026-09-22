import { useCallback, useEffect, useState } from 'react'
import { DATA_CHANGED } from './events'

export function useData<T>(loader: () => Promise<T>, initial: T) {
  const [data,setData]=useState<T>(initial)
  const [loading,setLoading]=useState(true)
  const refresh=useCallback(()=>{
    setLoading(true)
    loader().then(setData).finally(()=>setLoading(false))
  },[loader])
  useEffect(()=>{
    refresh()
    window.addEventListener(DATA_CHANGED,refresh)
    return ()=>window.removeEventListener(DATA_CHANGED,refresh)
  },[refresh])
  return {data,loading,refresh}
}
