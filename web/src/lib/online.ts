import { useSyncExternalStore } from 'react'

function subscribe(fn: () => void) {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

/** Browser connectivity as React state. True when the browser cannot tell. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    () => true,
  )
}
