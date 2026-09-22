export const newId = () => crypto.randomUUID()

export function getDeviceId() {
  const key = 'silver-manager-device-id'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
}
