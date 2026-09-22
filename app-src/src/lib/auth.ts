import { supabase, setCurrentShopId, clearCurrentShopId } from './supabase'

const DEVICE_AUTH_KEY = 'silver-manager-device-authorization'
const LOCAL_DATA_SHOP_KEY = 'silver-manager-local-data-shop-id'

export type DeviceAuthorization = {
  userId: string
  shopId: string
  authorizedAt: string
}

export function readDeviceAuthorization(): DeviceAuthorization | null {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_KEY)
    return raw ? JSON.parse(raw) as DeviceAuthorization : null
  } catch { return null }
}

export function bindLocalDataToShop(shopId: string) {
  const previous = localStorage.getItem(LOCAL_DATA_SHOP_KEY)
  if (previous && previous !== shopId) {
    throw new Error('هذا المتصفح مرتبط ببيانات منشأة أخرى. استخدم جهازاً أو ملف متصفح منفصلاً لهذه المنشأة حتى لا تختلط البيانات المحلية.')
  }
  localStorage.setItem(LOCAL_DATA_SHOP_KEY, shopId)
}

export function rememberDeviceAuthorization(userId: string, shopId: string) {
  bindLocalDataToShop(shopId)
  const value: DeviceAuthorization = { userId, shopId, authorizedAt: new Date().toISOString() }
  localStorage.setItem(DEVICE_AUTH_KEY, JSON.stringify(value))
  setCurrentShopId(shopId)
}

export function clearDeviceAuthorization() {
  localStorage.removeItem(DEVICE_AUTH_KEY)
  clearCurrentShopId()
}

export async function resolveMembershipShop(userId: string) {
  const { data, error } = await supabase
    .from('shop_memberships')
    .select('shop_id,role,shops(name,currency_code)')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

