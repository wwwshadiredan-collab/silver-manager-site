import Dexie, { Table } from 'dexie'
import type { AppSetting, AuditEvent, Buyback, CashClosing, Customer, Expense, OutboxMutation, Purchase, RefiningBatch, Repair, Sale, SilverItem, SilverRate, Stocktake, Supplier } from './types'

class SilverManagerDB extends Dexie {
  silverItems!: Table<SilverItem, string>
  customers!: Table<Customer, string>
  suppliers!: Table<Supplier, string>
  sales!: Table<Sale, string>
  expenses!: Table<Expense, string>
  rates!: Table<SilverRate, string>
  outbox!: Table<OutboxMutation, string>
  audit!: Table<AuditEvent, string>
  settings!: Table<AppSetting, string>
  purchases!: Table<Purchase, string>
  buybacks!: Table<Buyback, string>
  repairs!: Table<Repair, string>
  refining!: Table<RefiningBatch, string>
  stocktakes!: Table<Stocktake, string>
  cashClosings!: Table<CashClosing, string>

  constructor() {
    super('silver-manager-local-v1')
    this.version(1).stores({
      silverItems: 'id, sku, name, category, purity, status, archived, updatedAt, syncStatus',
      customers: 'id, name, phone, archived, updatedAt, syncStatus',
      suppliers: 'id, name, phone, archived, updatedAt, syncStatus',
      sales: 'id, invoiceNo, customerId, createdAt, status, syncStatus',
      expenses: 'id, category, date, createdAt, syncStatus',
      rates: 'id, purity, currency, effectiveAt',
      outbox: 'mutationId, entityId, entityType, createdAt, syncStatus',
      audit: 'id, entityId, entityType, createdAt',
      settings: 'key',
    })
    this.version(2).stores({
      silverItems: 'id, sku, name, category, purity, status, archived, updatedAt, syncStatus',
      customers: 'id, name, phone, archived, updatedAt, syncStatus',
      suppliers: 'id, name, phone, archived, updatedAt, syncStatus',
      sales: 'id, invoiceNo, customerId, createdAt, status, syncStatus',
      expenses: 'id, category, date, createdAt, syncStatus',
      rates: 'id, purity, currency, effectiveAt',
      purchases: 'id, documentNo, supplierId, createdAt, status, syncStatus',
      buybacks: 'id, documentNo, customerId, createdAt, status, syncStatus',
      repairs: 'id, ticketNo, customerId, repairStatus, dueDate, updatedAt, syncStatus',
      refining: 'id, batchNo, refiningStatus, updatedAt, syncStatus',
      outbox: 'mutationId, entityId, entityType, createdAt, syncStatus',
      audit: 'id, entityId, entityType, createdAt',
      settings: 'key',
    })

    this.version(3).stores({
      silverItems: 'id, sku, name, category, purity, status, archived, updatedAt, syncStatus',
      customers: 'id, name, phone, archived, updatedAt, syncStatus',
      suppliers: 'id, name, phone, archived, updatedAt, syncStatus',
      sales: 'id, invoiceNo, customerId, createdAt, status, syncStatus',
      expenses: 'id, category, date, createdAt, syncStatus',
      rates: 'id, purity, currency, effectiveAt',
      purchases: 'id, documentNo, supplierId, createdAt, status, syncStatus',
      buybacks: 'id, documentNo, customerId, createdAt, status, syncStatus',
      repairs: 'id, ticketNo, customerId, repairStatus, dueDate, updatedAt, syncStatus',
      refining: 'id, batchNo, refiningStatus, updatedAt, syncStatus',
      stocktakes: 'id, reference, stocktakeStatus, startedAt, completedAt, updatedAt, syncStatus',
      outbox: 'mutationId, entityId, entityType, createdAt, syncStatus',
      audit: 'id, entityId, entityType, createdAt',
      settings: 'key',
    })

    this.version(4).stores({
      silverItems: 'id, sku, name, category, purity, status, archived, updatedAt, syncStatus',
      customers: 'id, name, phone, archived, updatedAt, syncStatus',
      suppliers: 'id, name, phone, archived, updatedAt, syncStatus',
      sales: 'id, invoiceNo, customerId, createdAt, status, syncStatus',
      expenses: 'id, category, date, createdAt, syncStatus',
      rates: 'id, purity, currency, effectiveAt',
      purchases: 'id, documentNo, supplierId, createdAt, status, syncStatus',
      buybacks: 'id, documentNo, customerId, createdAt, status, syncStatus',
      repairs: 'id, ticketNo, customerId, repairStatus, dueDate, updatedAt, syncStatus',
      refining: 'id, batchNo, refiningStatus, updatedAt, syncStatus',
      stocktakes: 'id, reference, stocktakeStatus, startedAt, completedAt, updatedAt, syncStatus',
      cashClosings: 'id, businessDate, closedAt, createdAt, syncStatus',
      outbox: 'mutationId, entityId, entityType, createdAt, syncStatus',
      audit: 'id, entityId, entityType, createdAt',
      settings: 'key',
    })
  }
}

export const db = new SilverManagerDB()
