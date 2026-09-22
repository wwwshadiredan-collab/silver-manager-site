import { db } from '../db'
import { newId } from './ids'

const legacyDemoSkus = new Set(['SV-0001','SV-0002','SV-0003','SV-0004'])

async function cleanupLegacyDemoInventory() {
  const rows = await db.silverItems.toArray()
  const ids = rows
    .filter(x => !x.archived && x.status === 'available' && x.notes === 'بيانات تجريبية فقط' && legacyDemoSkus.has(x.sku))
    .map(x => x.id)

  if (!ids.length) return

  await db.transaction('rw', db.silverItems, db.outbox, async () => {
    await db.silverItems.bulkDelete(ids)
    for (const id of ids) await db.outbox.where('entityId').equals(id).delete()
  })
}

export async function ensureSeedData() {
  await cleanupLegacyDemoInventory()

  const existing = await db.settings.get('seeded')
  if (existing) return

  const now = new Date().toISOString()
  await db.transaction('rw', db.rates, db.settings, async () => {
    for (const purity of ['999','958','925','900','835','830','800']) {
      await db.rates.put({
        id:newId(), purity, currency:'USD', ratePerGram:'1.20', effectiveAt:now,
        createdAt:now, updatedAt:now, version:1, archived:false, syncStatus:'synced'
      })
    }

    await db.settings.bulkPut([
      { key:'seeded', value:'yes' },
      { key:'currency', value:'USD' },
      { key:'pureSilverRate', value:'1.20' },
      { key:'shopName', value:'Silver Manager' },
    ])
  })
}
