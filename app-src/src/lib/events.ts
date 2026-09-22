export const DATA_CHANGED = 'silver-manager-data-changed'
export const notifyDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED))
