import { db } from '../db'
import { calcSilverPrice, D, money, weight } from './money'
import { supabase, currentShopId } from './supabase'

export type AssistantReply = { text: string; details?: string[] }

function includesAny(q: string, words: string[]) {
  return words.some(w => q.includes(w))
}

export async function answerAssistant(input: string): Promise<AssistantReply> {
  const q = input.trim().toLowerCase()
  const endpoint = import.meta.env.VITE_ASSISTANT_ENDPOINT as string | undefined
  if (navigator.onLine && endpoint && currentShopId()) {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ shop_id: currentShopId(), question: input }),
        })
        if (r.ok) {
          const out = await r.json()
          return { text: out.answer || 'تم', details: Array.isArray(out.data) ? out.data.slice(0,10).map((x:any)=>typeof x==='string'?x:JSON.stringify(x)) : out.quick_actions }
        }
      }
    } catch { /* fall back to local offline assistant */ }
  }
  const today = new Date().toISOString().slice(0,10)

  if (includesAny(q, ['مبيعات اليوم','شو مبيعات اليوم','بيع اليوم'])) {
    const sales = (await db.sales.toArray()).filter(s => s.createdAt.slice(0,10) === today && s.status === 'posted')
    const total = sales.reduce((a,s)=>D(a).add(s.total).toString(),'0')
    const weightSold = sales.flatMap(s=>s.lines).reduce((a,l)=>D(a).add(l.netWeight).toString(),'0')
    return { text:`مبيعات اليوم ${sales.length} فاتورة بقيمة ${money(total)}، ووزن صافي مباع ${weight(weightSold)} غرام.`, details:sales.slice(0,5).map(s=>`${s.invoiceNo}: ${s.total}`) }
  }

  if (includesAny(q, ['وزن الفضة','المخزون','متوفر'])) {
    const items = (await db.silverItems.toArray()).filter(i=>!i.archived && i.status==='available')
    const purityMatch = q.match(/\b(999|958|925|900|835|830|800)\b/)
    const filtered = purityMatch ? items.filter(i=>i.purity===purityMatch[1]) : items
    const total = filtered.reduce((a,i)=>D(a).add(i.netWeight).toString(),'0')
    return { text:`المخزون المتوفر${purityMatch ? ` عيار ${purityMatch[1]}`:''}: ${filtered.length} قطعة، بوزن صافي ${weight(total)} غرام.` }
  }

  if (includesAny(q, ['غير متزامنة','المزامنة','اوفلاين','أوفلاين'])) {
    const pending = await db.outbox.toArray()
    const conflicts = pending.filter(x=>x.syncStatus==='conflict').length
    return { text:`في ${pending.length} عملية بانتظار/حالة مزامنة، منها ${conflicts} تعارض.`, details: pending.slice(0,8).map(x=>`${x.entityType} • ${x.operation} • ${x.syncStatus}`) }
  }

  if (includesAny(q, ['بطيئة','ما تحركت','90 يوم'])) {
    const threshold = Date.now() - 90*24*60*60*1000
    const items = (await db.silverItems.toArray()).filter(i=>!i.archived && i.status==='available' && new Date(i.updatedAt).getTime()<threshold)
    return { text:`وجدت ${items.length} قطعة لم تتغير منذ أكثر من 90 يوم.`, details:items.slice(0,10).map(i=>`${i.sku} — ${i.name}`) }
  }

  const nums = q.match(/\d+(?:[.,]\d+)?/g)?.map(x=>x.replace(',','.')) || []
  if (includesAny(q,['احسب','سعر']) && nums.length >= 3) {
    const [netWeight, purity, rate, making='0'] = nums
    try {
      const result = calcSilverPrice({ netWeight, purity, ratePerPureGram:rate, makingType:'fixed', makingValue:making })
      return { text:`الحساب التقريبي: وزن الفضة الخالص ${result.pureWeight} غ، قيمة المعدن ${result.metalValue}، الأجرة ${result.makingCharge}، والإجمالي ${result.total}.`, details:['اعتبرت الرقم الرابع — إن وجد — أجرة ثابتة.','يمكن لاحقاً اختيار أجرة للغرام أو نسبة مئوية.'] }
    } catch { /* continue */ }
  }

  if (includesAny(q,['ساعدني','شو فيك','ماذا تستطيع'])) {
    return { text:'بقدر أقرأ بيانات Silver Manager المحلية وأعطيك ملخصات عن المبيعات والمخزون والأوفلاين، وأعمل حسابات وزن/عيار/سعر. ما بغيّر أي قيد مالي بدون تأكيد صريح.' }
  }

  return { text:'ما فهمت السؤال بشكل كافي. جرّب مثلاً: «شو مبيعات اليوم؟»، «قديش وزن الفضة المتوفر 925؟»، «شو العمليات غير المتزامنة؟»، أو «احسب 18.4 غرام 925 على سعر 1.2 وأجرة 8».' }
}
