export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'conflict'

export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
  version: number
  archived?: boolean
  deletedAt?: string | null
  syncStatus?: SyncStatus
  deviceId?: string
}

export interface SilverItem extends BaseEntity {
  sku: string
  name: string
  category: string
  grossWeight: string
  stoneWeight: string
  netWeight: string
  purity: string
  pureSilverWeight: string
  quantity: number
  supplierId?: string
  purchaseDate?: string
  metalCost: string
  makingChargeType: 'fixed' | 'perGram' | 'percentage'
  makingChargeValue: string
  stoneCost: string
  otherCost: string
  landedCost: string
  sellingPrice: string
  location: string
  status: 'available' | 'reserved' | 'sold' | 'returned' | 'repair' | 'scrap' | 'archived'
  notes?: string
}

export interface Customer extends BaseEntity {
  name: string
  phone?: string
  email?: string
  address?: string
  openingBalance: string
  notes?: string
}

export interface Supplier extends BaseEntity {
  name: string
  phone?: string
  email?: string
  address?: string
  openingBalance: string
  notes?: string
}

export interface SaleLine {
  itemId: string
  itemName: string
  sku: string
  netWeight: string
  purity: string
  ratePerGram: string
  makingCharge: string
  stoneCost: string
  lineTotal: string
}

export interface SalePaymentBreakdown {
  usdCash: string
  sypCash: string
  sypPerUsd: string
  sypUsdEquivalent: string
  oldSilverNetWeight: string
  oldSilverPurity: string
  oldSilverValueUsd: string
}

export interface Sale extends BaseEntity {
  invoiceNo: string
  customerId?: string
  lines: SaleLine[]
  subtotal: string
  discount: string
  tax: string
  total: string
  paid: string
  balance: string
  paymentMethod: 'cash' | 'card' | 'bank' | 'mixed'
  paymentBreakdown?: SalePaymentBreakdown
  rateSnapshot: Record<string, string>
  status: 'posted' | 'void'
  voidReason?: string
}

export interface Expense extends BaseEntity {
  title: string
  category: string
  amount: string
  date: string
  paymentMethod: 'cash' | 'card' | 'bank'
  notes?: string
}

export interface SilverRate extends BaseEntity {
  purity: string
  currency: string
  ratePerGram: string
  effectiveAt: string
}

export interface CashClosing extends BaseEntity {
  businessDate: string
  openingUsd: string
  openingSyp: string
  salesUsd: string
  salesSyp: string
  cashOutUsd: string
  expectedUsd: string
  expectedSyp: string
  countedUsd: string
  countedSyp: string
  differenceUsd: string
  differenceSyp: string
  notes?: string
  closedAt: string
}


export interface PurchaseLine {
  id: string
  description: string
  quantity: string
  grossWeight: string
  stoneWeight: string
  netWeight: string
  purity: string
  ratePerPureGram: string
  metalCost: string
  makingCost: string
  stoneCost: string
  otherCost: string
  lineTotal: string
}

export interface Purchase extends BaseEntity {
  documentNo: string
  supplierId?: string
  lines: PurchaseLine[]
  rateSnapshot: string
  subtotal: string
  makingTotal: string
  otherCosts: string
  tax: string
  total: string
  paid: string
  balance: string
  status: 'posted' | 'void'
  notes?: string
}

export interface BuybackLine {
  id: string
  description: string
  grossWeight: string
  stoneWeight: string
  netWeight: string
  purity: string
  ratePerPureGram: string
  deductionAmount: string
  lineValue: string
}

export interface Buyback extends BaseEntity {
  documentNo: string
  customerId?: string
  lines: BuybackLine[]
  rateSnapshot: string
  assayDeductionPercent: string
  payoutAmount: string
  storeCreditAmount: string
  disposition: 'resale' | 'scrap' | 'refining' | 'repair'
  status: 'posted' | 'void'
  notes?: string
}

export interface Repair extends BaseEntity {
  ticketNo: string
  customerId?: string
  itemDescription: string
  intakeGrossWeight: string
  expectedNetWeight?: string
  workRequested: string
  artisanName?: string
  dueDate?: string
  repairStatus: 'received' | 'in_progress' | 'ready' | 'delivered' | 'cancelled'
  quotedAmount: string
  finalAmount: string
  notes?: string
}

export interface RefiningBatch extends BaseEntity {
  batchNo: string
  refiningStatus: 'open' | 'sent' | 'received' | 'closed' | 'void'
  inputWeight: string
  inputPurity: string
  outputWeight?: string
  outputPurity?: string
  lossWeight?: string
  refiningCharge: string
  refinerName?: string
  sentAt?: string
  receivedAt?: string
  notes?: string
}

export interface OutboxMutation {
  mutationId: string
  entityId: string
  entityType: string
  operation: 'create' | 'update' | 'archive' | 'restore' | 'void'
  payload: unknown
  version: number
  createdAt: string
  deviceId: string
  idempotencyKey: string
  syncStatus: SyncStatus
  retryCount: number
  lastError?: string
}

export interface AuditEvent {
  id: string
  entityId: string
  entityType: string
  action: string
  payload?: unknown
  createdAt: string
  deviceId: string
}

export interface AppSetting {
  key: string
  value: string
}

export interface StocktakeLine {
  id: string
  itemId?: string
  sku: string
  name: string
  expectedQuantity: string
  countedQuantity: string
  expectedWeight: string
  countedWeight: string
  quantityDifference: string
  weightDifference: string
  reason?: string
  approved: boolean
}

export interface Stocktake extends BaseEntity {
  reference: string
  stocktakeStatus: 'completed'
  startedAt: string
  completedAt: string
  notes?: string
  lines: StocktakeLine[]
}
