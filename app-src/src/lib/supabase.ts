import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const backendConfigured = Boolean(url && publishableKey)

export const supabase = createClient(url || 'https://invalid.local', publishableKey || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export function currentShopId() {
  return localStorage.getItem('silver-manager-shop-id') || ''
}

export function setCurrentShopId(id: string) {
  localStorage.setItem('silver-manager-shop-id', id)
}

export function clearCurrentShopId() {
  localStorage.removeItem('silver-manager-shop-id')
}
