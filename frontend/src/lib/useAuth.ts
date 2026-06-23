import { useSyncExternalStore } from 'react'
import { TOKEN_CHANGE_EVENT, getToken } from './auth'

function subscribe(callback: () => void) {
  window.addEventListener(TOKEN_CHANGE_EVENT, callback)
  return () => window.removeEventListener(TOKEN_CHANGE_EVENT, callback)
}

function getSnapshot() {
  return getToken() != null
}

export function useAuth(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
