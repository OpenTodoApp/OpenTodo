// React binding of the translations (OpenSpec `app-localization`, design D3):
// components that call useT() re-render when the language changes.
import { useSyncExternalStore } from 'react'
import { catalogVersion, subscribe, t } from './catalog'

/** Returns t, re-rendering the caller whenever the active language changes. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, catalogVersion, catalogVersion)
  return t
}
