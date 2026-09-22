import { db } from '../db'
import type { Buyback, Customer, Expense, Purchase, RefiningBatch, Repair, Sale, SilverItem, Stocktake, Supplier } from '../types'
import { supabase, currentShopId } from './supabase'
import { notifyDataChanged } from './events'

const iso = (v?: string | null) => v || new Date().toISOString()

async function pendingEntityIds(){
  const rows=await db.outbox.toArray()
  return new Set(rows.filter(r=>r.syncStatus!=='synced').map(r=>r.entityId))
}

export async function pullFromServer(){
  if(!navigator.onLine) return {pulled:0,message:'أوفلاين'}
  const shopId=currentShopId(); if(!shopId) return {pulled:0,message:'لا توجد منشأة محددة'}
  const pending=await pendingEntityIds()
  let pulled=0

  const [itemsRes,customersRes,suppliersRes,expensesRes,salesRes,purchasesRes,buybacksRes,repairsRes,refiningRes,stocktakesRes]=await Promise.all([
    supabase.from('inventory_items').select('*').eq('shop_id',shopId),
    supabase.from('customers').select('*').eq('shop_id',shopId),
    supabase.from('suppliers').select('*').eq('shop_id',shopId),
    supabase.from('expenses').select('*').eq('shop_id',shopId),
    supabase.from('sales').select('*,sale_items(*)').eq('shop_id',shopId).order('sale_date',{ascending:false}).limit(500),
    supabase.from('purchases').select('*,purchase_items(*)').eq('shop_id',shopId).order('purchase_date',{ascending:false}).limit(500),
    supabase.from('buybacks').select('*,buyback_items(*)').eq('shop_id',shopId).order('transaction_date',{ascending:false}).limit(500),
    supabase.from('repairs').select('*').eq('shop_id',shopId).order('updated_at',{ascending:false}).limit(500),
    supabase.from('refining_batches').select('*').eq('shop_id',shopId).order('updated_at',{ascending:false}).limit(500),
    supabase.from('stocktakes').select('*,stocktake_items(*)').eq('shop_id',shopId).order('completed_at',{ascending:false}).limit(100),
  ])
  for(const r of [itemsRes,customersRes,suppliersRes,expensesRes,salesRes,purchasesRes,buybacksRes,repairsRes,refiningRes,stocktakesRes]) if(r.error) throw r.error

  for(const x of itemsRes.data||[]){
    if(pending.has(x.id)) continue
    const makingType=x.making_charge_mode==='per_gram'?'perGram':x.making_charge_mode==='percent'?'percentage':'fixed'
    const entity:SilverItem={
      id:x.id,sku:x.sku,name:x.design_name||x.description||x.sku,category:x.category,
      grossWeight:String(x.gross_weight??0),stoneWeight:String(x.stone_weight??0),netWeight:String(x.net_silver_weight??0),
      purity:String(x.purity??925),pureSilverWeight:String(x.pure_silver_weight??0),quantity:Number(x.quantity??1),
      supplierId:x.supplier_id||undefined,purchaseDate:x.purchase_date||undefined,metalCost:String(x.base_metal_cost??0),
      makingChargeType:makingType,makingChargeValue:String(x.making_charge_value??0),stoneCost:String(x.stone_cost??0),otherCost:String(x.other_cost??0),
      landedCost:String(x.landed_cost??0),sellingPrice:String(x.selling_price??0),location:x.bin_location||'',status:x.status,notes:x.notes||undefined,
      archived:Boolean(x.archived_at),createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),syncStatus:'synced',deviceId:x.device_id||undefined,
    }
    await db.silverItems.put(entity); pulled++
  }

  for(const x of customersRes.data||[]){
    if(pending.has(x.id)) continue
    const entity:Customer={id:x.id,name:x.name,phone:x.phone||undefined,email:x.email||undefined,address:x.address||undefined,openingBalance:String(x.opening_balance??0),notes:x.notes||undefined,archived:Boolean(x.archived_at),createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.customers.put(entity); pulled++
  }
  for(const x of suppliersRes.data||[]){
    if(pending.has(x.id)) continue
    const entity:Supplier={id:x.id,name:x.name,phone:x.phone||undefined,email:x.email||undefined,address:x.address||undefined,openingBalance:String(x.opening_balance??0),notes:x.notes||undefined,archived:Boolean(x.archived_at),createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.suppliers.put(entity); pulled++
  }
  for(const x of expensesRes.data||[]){
    if(pending.has(x.id)) continue
    const entity:Expense={id:x.id,title:x.title,category:x.category,amount:String(x.amount??0),date:String(x.expense_date||'').slice(0,10),paymentMethod:(x.payment_method==='card'?'card':x.payment_method==='bank'?'bank':'cash'),notes:x.notes||undefined,archived:Boolean(x.archived_at),createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.expenses.put(entity); pulled++
  }
  for(const x of salesRes.data||[]){
    if(pending.has(x.id)) continue
    const lines=(x.sale_items||[]).map((l:any)=>({itemId:l.item_id,itemName:l.description,sku:'',netWeight:String(l.net_silver_weight??0),purity:String(l.purity??925),ratePerGram:String(l.silver_rate_snapshot??x.silver_rate_snapshot??0),makingCharge:String(l.making_charge??0),stoneCost:String(l.stone_value??0),lineTotal:String(l.line_total??0)}))
    const parts=[Number(x.cash_usd??0)>0,Number(x.cash_syp??0)>0,Number(x.old_silver_value_usd??0)>0].filter(Boolean).length
    const entity:Sale={id:x.id,invoiceNo:x.invoice_number,customerId:x.customer_id||undefined,lines,subtotal:String(x.subtotal??0),discount:String(x.discount??0),tax:String(x.tax_amount??0),total:String(x.grand_total??0),paid:String(x.amount_paid??0),balance:String(x.balance_due??0),paymentMethod:parts>1||Number(x.old_silver_value_usd??0)>0?'mixed':'cash',paymentBreakdown:{usdCash:String(x.cash_usd??0),sypCash:String(x.cash_syp??0),sypPerUsd:String(x.syp_per_usd??0),sypUsdEquivalent:String(x.syp_usd_equivalent??0),oldSilverNetWeight:String(x.old_silver_net_weight??0),oldSilverPurity:String(x.old_silver_purity??925),oldSilverValueUsd:String(x.old_silver_value_usd??x.trade_in_credit??0)},rateSnapshot:{pureSilverPerGram:String(x.silver_rate_snapshot??0),usdToSyp:String(x.syp_per_usd??0)},status:x.status==='void'?'void':'posted',createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),archived:false,syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.sales.put(entity); pulled++
  }
  for(const x of purchasesRes.data||[]){
    if(pending.has(x.id)) continue
    const lines=(x.purchase_items||[]).map((l:any)=>({id:l.id,description:l.description,quantity:String(l.quantity??1),grossWeight:String(l.gross_weight??0),stoneWeight:String(l.stone_weight??0),netWeight:String(l.net_silver_weight??0),purity:String(l.purity??925),ratePerPureGram:String(l.silver_rate_snapshot??x.silver_rate_snapshot??0),metalCost:String(l.metal_cost??0),makingCost:String(l.making_cost??0),stoneCost:String(l.stone_cost??0),otherCost:String(l.other_cost??0),lineTotal:String(l.line_total??0)}))
    const entity:Purchase={id:x.id,documentNo:x.document_number,supplierId:x.supplier_id||undefined,lines,rateSnapshot:String(x.silver_rate_snapshot??0),subtotal:String(x.subtotal??0),makingTotal:String(x.making_total??0),otherCosts:String(x.other_costs??0),tax:String(x.tax_amount??0),total:String(x.grand_total??0),paid:String(x.amount_paid??0),balance:String(x.balance_due??0),status:x.status==='void'?'void':'posted',notes:x.notes||undefined,createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),archived:false,syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.purchases.put(entity); pulled++
  }
  for(const x of buybacksRes.data||[]){
    if(pending.has(x.id)) continue
    const lines=(x.buyback_items||[]).map((l:any)=>({id:l.id,description:l.description,grossWeight:String(l.gross_weight??0),stoneWeight:String(l.stone_weight??0),netWeight:String(l.net_silver_weight??0),purity:String(l.purity??925),ratePerPureGram:String(l.silver_rate_snapshot??x.silver_rate_snapshot??0),deductionAmount:String(l.deduction_amount??0),lineValue:String(l.line_value??0)}))
    const entity:Buyback={id:x.id,documentNo:x.document_number,customerId:x.customer_id||undefined,lines,rateSnapshot:String(x.silver_rate_snapshot??0),assayDeductionPercent:String(x.assay_deduction_percent??0),payoutAmount:String(x.payout_amount??0),storeCreditAmount:String(x.store_credit_amount??0),disposition:x.disposition,status:x.status==='void'?'void':'posted',notes:x.notes||undefined,createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),archived:false,syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.buybacks.put(entity); pulled++
  }
  for(const x of repairsRes.data||[]){
    if(pending.has(x.id)) continue
    const entity:Repair={id:x.id,ticketNo:x.ticket_number,customerId:x.customer_id||undefined,itemDescription:x.item_description,intakeGrossWeight:String(x.intake_gross_weight??0),expectedNetWeight:x.expected_net_weight!=null?String(x.expected_net_weight):undefined,workRequested:x.work_requested,artisanName:x.artisan_name||undefined,dueDate:x.due_date||undefined,repairStatus:x.status,quotedAmount:String(x.quoted_amount??0),finalAmount:String(x.final_amount??0),notes:x.notes||undefined,archived:Boolean(x.archived_at),createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.repairs.put(entity); pulled++
  }
  for(const x of refiningRes.data||[]){
    if(pending.has(x.id)) continue
    const entity:RefiningBatch={id:x.id,batchNo:x.batch_number,refiningStatus:x.status,inputWeight:String(x.input_weight??0),inputPurity:String(x.input_purity??925),outputWeight:x.output_weight!=null?String(x.output_weight):undefined,outputPurity:x.output_purity!=null?String(x.output_purity):undefined,lossWeight:x.loss_weight!=null?String(x.loss_weight):undefined,refiningCharge:String(x.refining_charge??0),refinerName:x.refiner_name||undefined,sentAt:x.sent_at||undefined,receivedAt:x.received_at||undefined,notes:x.notes||undefined,createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),archived:false,syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.refining.put(entity); pulled++
  }


  for(const x of stocktakesRes.data||[]){
    if(pending.has(x.id)) continue
    const lines=(x.stocktake_items||[]).map((l:any)=>({
      id:l.id,itemId:l.item_id||undefined,sku:'',name:'',expectedQuantity:String(l.expected_quantity??0),countedQuantity:String(l.counted_quantity??0),
      expectedWeight:String(l.expected_weight??0),countedWeight:String(l.counted_weight??0),quantityDifference:String(l.quantity_difference??0),weightDifference:String(l.weight_difference??0),reason:l.reason||undefined,approved:Boolean(l.approved)
    }))
    const localItems=await db.silverItems.bulkGet(lines.map((l:any)=>l.itemId).filter(Boolean))
    lines.forEach((l:any,i:number)=>{const item=localItems[i] as any;if(item){l.sku=item.sku;l.name=item.name}})
    const entity:Stocktake={id:x.id,reference:x.reference,stocktakeStatus:'completed',startedAt:iso(x.started_at),completedAt:iso(x.completed_at),notes:x.notes||undefined,lines,createdAt:iso(x.created_at),updatedAt:iso(x.updated_at),version:Number(x.version??1),archived:false,syncStatus:'synced',deviceId:x.device_id||undefined}
    await db.stocktakes.put(entity); pulled++
  }

  localStorage.setItem('silver-manager-last-pull',new Date().toISOString())
  notifyDataChanged()
  return {pulled,message:'تم تحديث البيانات من الخادم'}
}
