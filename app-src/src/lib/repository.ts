import { db } from '../db'
import type { Buyback, CashClosing, Customer, Expense, Purchase, RefiningBatch, Repair, Sale, SilverItem, Stocktake, Supplier } from '../types'
import { getDeviceId, newId } from './ids'
import { audit, queueMutation } from './mutations'
import { notifyDataChanged } from './events'

const now = () => new Date().toISOString()

export async function saveItem(input: Omit<SilverItem,'createdAt'|'updatedAt'|'version'|'deviceId'|'syncStatus'> & Partial<Pick<SilverItem,'createdAt'|'version'>>) {
  const existing = await db.silverItems.get(input.id)
  const item: SilverItem = {
    ...input,
    createdAt: existing?.createdAt || input.createdAt || now(),
    updatedAt: now(),
    version: (existing?.version || input.version || 0) + 1,
    deviceId: getDeviceId(), syncStatus:'pending'
  }
  await db.transaction('rw', db.silverItems, db.outbox, db.audit, async()=>{
    await db.silverItems.put(item)
    await queueMutation({ entityId:item.id, entityType:'silverItem', operation: existing ? 'update':'create', payload:item, version:item.version })
    await audit(item.id,'silverItem',existing?'update':'create',item)
  })
  notifyDataChanged()
  return item
}

export async function archiveItem(id: string, archived: boolean) {
  const item=await db.silverItems.get(id); if(!item) return
  const updated={...item,archived,status: archived ? 'archived' as const : 'available' as const,updatedAt:now(),version:item.version+1,syncStatus:'pending' as const,deviceId:getDeviceId()}
  await db.transaction('rw',db.silverItems,db.outbox,db.audit,async()=>{
    await db.silverItems.put(updated)
    await queueMutation({entityId:id,entityType:'silverItem',operation:archived?'archive':'restore',payload:updated,version:updated.version})
    await audit(id,'silverItem',archived?'archive':'restore')
  })
  notifyDataChanged()
}

export async function saveCustomer(input: Pick<Customer,'id'|'name'|'phone'|'email'|'address'|'openingBalance'|'notes'>) {
  const existing=await db.customers.get(input.id)
  const entity:Customer={...input,createdAt:existing?.createdAt||now(),updatedAt:now(),version:(existing?.version||0)+1,archived:existing?.archived||false,syncStatus:'pending',deviceId:getDeviceId()}
  await db.transaction('rw',db.customers,db.outbox,db.audit,async()=>{
    await db.customers.put(entity); await queueMutation({entityId:entity.id,entityType:'customer',operation:existing?'update':'create',payload:entity,version:entity.version}); await audit(entity.id,'customer',existing?'update':'create',entity)
  })
  notifyDataChanged()
  return entity
}

export async function saveSupplier(input: Pick<Supplier,'id'|'name'|'phone'|'email'|'address'|'openingBalance'|'notes'>) {
  const existing=await db.suppliers.get(input.id)
  const entity:Supplier={...input,createdAt:existing?.createdAt||now(),updatedAt:now(),version:(existing?.version||0)+1,archived:existing?.archived||false,syncStatus:'pending',deviceId:getDeviceId()}
  await db.transaction('rw',db.suppliers,db.outbox,db.audit,async()=>{
    await db.suppliers.put(entity); await queueMutation({entityId:entity.id,entityType:'supplier',operation:existing?'update':'create',payload:entity,version:entity.version}); await audit(entity.id,'supplier',existing?'update':'create',entity)
  })
  notifyDataChanged()
  return entity
}

export async function saveExpense(input: Pick<Expense,'title'|'category'|'amount'|'date'|'paymentMethod'|'notes'>) {
  const entity:Expense={...input,id:newId(),createdAt:now(),updatedAt:now(),version:1,archived:false,syncStatus:'pending',deviceId:getDeviceId()}
  await db.transaction('rw',db.expenses,db.outbox,db.audit,async()=>{
    await db.expenses.put(entity); await queueMutation({entityId:entity.id,entityType:'expense',operation:'create',payload:entity,version:1}); await audit(entity.id,'expense','create',entity)
  })
  notifyDataChanged()
  return entity
}

export async function postSale(sale: Sale) {
  await db.transaction('rw',db.sales,db.silverItems,db.outbox,db.audit,async()=>{
    await db.sales.put(sale)
    await queueMutation({entityId:sale.id,entityType:'sale',operation:'create',payload:sale,version:sale.version})
    await audit(sale.id,'sale','post',sale)
    for(const line of sale.lines){
      const item=await db.silverItems.get(line.itemId)
      if(item){
        const updated={...item,status:'sold' as const,updatedAt:now(),version:item.version+1,syncStatus:'pending' as const,deviceId:getDeviceId()}
        await db.silverItems.put(updated)
        await queueMutation({entityId:item.id,entityType:'silverItem',operation:'update',payload:updated,version:updated.version})
      }
    }
  })
  notifyDataChanged()
}


export async function savePurchase(entity: Purchase) {
  await db.transaction('rw',db.purchases,db.outbox,db.audit,async()=>{
    await db.purchases.put(entity)
    await queueMutation({entityId:entity.id,entityType:'purchase',operation:'create',payload:entity,version:entity.version})
    await audit(entity.id,'purchase','post',entity)
  })
  notifyDataChanged(); return entity
}

export async function saveBuyback(entity: Buyback) {
  await db.transaction('rw',db.buybacks,db.outbox,db.audit,async()=>{
    await db.buybacks.put(entity)
    await queueMutation({entityId:entity.id,entityType:'buyback',operation:'create',payload:entity,version:entity.version})
    await audit(entity.id,'buyback','post',entity)
  })
  notifyDataChanged(); return entity
}

export async function saveCashClosing(entity: CashClosing) {
  await db.transaction('rw',db.cashClosings,db.outbox,db.audit,async()=>{
    await db.cashClosings.put(entity)
    await queueMutation({entityId:entity.id,entityType:'cashClosing',operation:'create',payload:entity,version:entity.version})
    await audit(entity.id,'cashClosing','close',entity)
  })
  notifyDataChanged(); return entity
}

export async function saveRepair(entity: Repair) {
  const existing=await db.repairs.get(entity.id)
  await db.transaction('rw',db.repairs,db.outbox,db.audit,async()=>{
    await db.repairs.put(entity)
    await queueMutation({entityId:entity.id,entityType:'repair',operation:existing?'update':'create',payload:entity,version:entity.version})
    await audit(entity.id,'repair',existing?'update':'create',entity)
  })
  notifyDataChanged(); return entity
}

export async function saveRefiningBatch(entity: RefiningBatch) {
  const existing=await db.refining.get(entity.id)
  await db.transaction('rw',db.refining,db.outbox,db.audit,async()=>{
    await db.refining.put(entity)
    await queueMutation({entityId:entity.id,entityType:'refining',operation:existing?'update':'create',payload:entity,version:entity.version})
    await audit(entity.id,'refining',existing?'update':'create',entity)
  })
  notifyDataChanged(); return entity
}


export async function saveStocktake(entity: Stocktake) {
  await db.transaction('rw',db.stocktakes,db.silverItems,db.outbox,db.audit,async()=>{
    await db.stocktakes.put(entity)

    // Apply the approved physical count immediately to the local/offline inventory.
    // The stocktake RPC applies the same adjustment once on the server when sync succeeds.
    for(const line of entity.lines){
      if(!line.approved||!line.itemId) continue
      const item=await db.silverItems.get(line.itemId)
      if(!item) continue

      const expectedQty=Math.max(Number(line.expectedQuantity||0),0)
      const countedQty=Math.max(Number(line.countedQuantity||0),0)
      const expectedWeight=Math.max(Number(line.expectedWeight||0),0)
      const countedWeight=Math.max(Number(line.countedWeight||0),0)
      const qtyDiff=countedQty-expectedQty
      const weightDiff=countedWeight-expectedWeight
      if(Math.abs(qtyDiff)<=0.000001&&Math.abs(weightDiff)<=0.000001) continue

      const metalCost=Number(item.metalCost||0)
      const landedCost=Number(item.landedCost||0)
      const stoneCost=Number(item.stoneCost||0)
      const otherCost=Number(item.otherCost||0)
      const sellingPrice=Number(item.sellingPrice||0)
      let baseDelta=0
      let valueDelta=0
      let stoneWeight=Number(item.stoneWeight||0)
      let newStoneCost=stoneCost
      let newOtherCost=otherCost
      let newSellingPrice=sellingPrice

      if(Math.abs(qtyDiff)>0.000001&&expectedQty>0){
        const ratio=countedQty/expectedQty
        baseDelta=metalCost*(ratio-1)
        valueDelta=landedCost*(ratio-1)
        stoneWeight*=ratio
        newStoneCost*=ratio
        newOtherCost*=ratio
        newSellingPrice*=ratio
      }else if(Math.abs(weightDiff)>0.000001&&expectedWeight>0){
        baseDelta=metalCost*(weightDiff/expectedWeight)
        valueDelta=baseDelta
      }

      const purity=Number(item.purity||0)
      const updated:SilverItem={
        ...item,
        quantity:countedQty,
        stoneWeight:String(Number(stoneWeight.toFixed(3))),
        netWeight:String(Number(countedWeight.toFixed(3))),
        grossWeight:String(Number((countedWeight+stoneWeight).toFixed(3))),
        pureSilverWeight:String(Number((countedWeight*purity/1000).toFixed(3))),
        metalCost:String(Number(Math.max(metalCost+baseDelta,0).toFixed(4))),
        stoneCost:String(Number(Math.max(newStoneCost,0).toFixed(4))),
        otherCost:String(Number(Math.max(newOtherCost,0).toFixed(4))),
        landedCost:String(Number(Math.max(landedCost+valueDelta,0).toFixed(4))),
        sellingPrice:String(Number(Math.max(newSellingPrice,0).toFixed(4))),
        archived:countedQty<=0?true:item.archived,
        status:countedQty<=0?'archived':item.status,
        updatedAt:now(),
        version:item.version+1,
        syncStatus:'pending',
        deviceId:getDeviceId(),
      }
      await db.silverItems.put(updated)
    }

    await queueMutation({entityId:entity.id,entityType:'stocktake',operation:'create',payload:entity,version:entity.version})
    await audit(entity.id,'stocktake','complete',entity)
  })
  notifyDataChanged(); return entity
}
