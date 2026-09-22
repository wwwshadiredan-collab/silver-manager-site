import { db } from '../db'
import { supabase, currentShopId } from './supabase'
import { pullFromServer } from './remote'
import { notifyDataChanged } from './events'

export type SyncSummary = { synced: number; failed: number; pending: number; conflicts?: number; message: string }

const endpoint = import.meta.env.VITE_SYNC_ENDPOINT as string | undefined

async function markEntitySynced(entityType:string,entityId:string){
  const table=entityType==='silverItem'?db.silverItems:entityType==='customer'?db.customers:entityType==='supplier'?db.suppliers:entityType==='expense'?db.expenses:entityType==='sale'?db.sales:entityType==='purchase'?db.purchases:entityType==='buyback'?db.buybacks:entityType==='repair'?db.repairs:entityType==='refining'?db.refining:entityType==='stocktake'?db.stocktakes:entityType==='cashClosing'?db.cashClosings:null
  if(table) await (table as any).update(entityId,{syncStatus:'synced'})
}

export async function syncNow(): Promise<SyncSummary> {
  const stuckSyncing = await db.outbox.where('syncStatus').equals('syncing').toArray()
  for (const row of stuckSyncing) {
    await db.outbox.update(row.mutationId,{syncStatus:'pending',lastError:'Recovered after interrupted sync'})
  }
  const pendingRows = await db.outbox.where('syncStatus').anyOf('pending', 'error','conflict').toArray()
  pendingRows.sort((a,b)=>{
    if(a.entityId===b.entityId){
      if(a.operation==='create'&&b.operation!=='create') return -1
      if(b.operation==='create'&&a.operation!=='create') return 1
      if(a.version!==b.version) return a.version-b.version
    }
    return a.createdAt.localeCompare(b.createdAt)
  })
  if (!navigator.onLine) return { synced: 0, failed: 0, pending: pendingRows.length, message: 'الجهاز أوفلاين. العمليات محفوظة محلياً.' }
  if (!endpoint) return { synced: 0, failed: 0, pending: pendingRows.length, message: 'رابط المزامنة غير مضبوط.' }
  const shopId=currentShopId(); if(!shopId) return {synced:0,failed:0,pending:pendingRows.length,message:'لا توجد منشأة محددة.'}
  const {data:sessionData}=await supabase.auth.getSession(); const token=sessionData.session?.access_token
  if(!token) return {synced:0,failed:0,pending:pendingRows.length,message:'جلسة الدخول غير متوفرة للمزامنة.'}

  const ensureRemoteReference=async(kind:'supplier'|'customer',id?:string)=>{
    if(!id) return
    const table=kind==='supplier'?'suppliers':'customers'
    const localTable=kind==='supplier'?db.suppliers:db.customers
    const {data:remote,error:lookupError}=await supabase.from(table).select('id').eq('shop_id',shopId).eq('id',id).maybeSingle()
    if(lookupError) throw lookupError
    if(remote) return

    const local=await localTable.get(id) as any
    if(!local) throw new Error(kind==='supplier'?'المورد المحلي المرتبط بالعملية غير موجود.':'العميل المحلي المرتبط بالعملية غير موجود.')

    const mutationId=crypto.randomUUID()
    const idempotencyKey=crypto.randomUUID()
    const {data:result,error:rpcError}=await supabase.rpc('apply_sync_mutation_v2',{
      p_mutation_id:mutationId,
      p_shop_id:shopId,
      p_entity_id:id,
      p_entity_type:kind,
      p_operation:'create',
      p_payload:local,
      p_version:1,
      p_device_id:local.deviceId||'dependency-recovery',
      p_idempotency_key:idempotencyKey,
    })
    if(rpcError) throw rpcError
    if(result?.status!=='synced') throw new Error(result?.reason||`تعذر مزامنة ${kind==='supplier'?'المورد':'العميل'} المرتبط بالعملية.`)
    await (localTable as any).update(id,{syncStatus:'synced'})
  }

  let synced=0,failed=0,conflicts=0
  for(const mutation of pendingRows){
    if(mutation.syncStatus==='conflict' && mutation.lastError!=='missing server entity'){conflicts++;continue}
    if(mutation.syncStatus==='conflict' && mutation.lastError==='missing server entity'){
      await db.outbox.update(mutation.mutationId,{syncStatus:'pending',lastError:undefined})
      mutation.syncStatus='pending'
      mutation.lastError=undefined
    }
    try{
      const payload=mutation.payload as any
      if(mutation.entityType==='purchase') await ensureRemoteReference('supplier',payload?.supplierId)
      if(mutation.entityType==='sale'||mutation.entityType==='buyback'||mutation.entityType==='repair') await ensureRemoteReference('customer',payload?.customerId)
      await db.outbox.update(mutation.mutationId,{syncStatus:'syncing'})
      if(mutation.entityType==='stocktake'){
        const p=mutation.payload as any
        const {data:result,error:stocktakeError}=await supabase.rpc('apply_stocktake_sync',{
          p_shop_id:shopId,
          p_payload:p,
        })
        if(stocktakeError) throw stocktakeError
        if(result?.status!=='synced') throw new Error(result?.reason||'تعذر مزامنة الجرد.')
      }else if(mutation.entityType==='cashClosing'){
        const p=mutation.payload as any
        const {data:result,error:closingError}=await supabase.rpc('apply_cash_closing_sync',{
          p_shop_id:shopId,
          p_payload:p,
        })
        if(closingError) throw closingError
        if(result?.status!=='synced') throw new Error(result?.reason||'تعذر مزامنة إغلاق الصندوق.')
      }else{
        const response=await fetch(endpoint,{
          method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'Idempotency-Key':mutation.idempotencyKey},
          body:JSON.stringify({...mutation,shopId}),
        })
        const result=await response.json().catch(()=>({}))
        if(response.status===409||result.status==='conflict'){
          await db.outbox.update(mutation.mutationId,{syncStatus:'conflict',lastError:result.reason||'تعارض إصدار'})
          conflicts++;failed++;continue
        }
        if(!response.ok||result.status==='failed') throw new Error(result.reason||result.error||`HTTP ${response.status}`)
      }
      await db.outbox.delete(mutation.mutationId)
      await markEntitySynced(mutation.entityType,mutation.entityId)
      synced++
    }catch(error){
      const message=error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String((error as any).message):typeof error==='string'?error:JSON.stringify(error)
      await db.outbox.update(mutation.mutationId,{syncStatus:'error',retryCount:mutation.retryCount+1,lastError:message||'خطأ غير معروف'})
      failed++
    }
  }
  if(!failed) {
    try{await pullFromServer()}catch{/* push success must not be undone by a pull failure */}
  }
  const remaining=await db.outbox.count()
  localStorage.setItem('silver-manager-last-sync',new Date().toISOString())
  notifyDataChanged()
  return {synced,failed,pending:remaining,conflicts,message:failed?'انتهت المزامنة مع عمليات تحتاج مراجعة.':'تمت المزامنة بنجاح.'}
}

export function setupAutoSync(onSync?:()=>void){
  const handler=()=>syncNow().finally(()=>onSync?.())
  window.addEventListener('online',handler)
  window.addEventListener('focus',handler)
  const visibility=()=>{if(document.visibilityState==='visible'&&navigator.onLine)handler()}
  document.addEventListener('visibilitychange',visibility)
  return ()=>{window.removeEventListener('online',handler);window.removeEventListener('focus',handler);document.removeEventListener('visibilitychange',visibility)}
}
