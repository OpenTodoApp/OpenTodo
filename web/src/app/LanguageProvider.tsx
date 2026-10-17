// Interface language in the UI (OpenSpec change app-localization, design D3): the
// provider watches the synced `user_prefs` row and applies its `language` when it
// differs from the active one (a change in Settings, on another device by sync,
// or the first sync on a new device). Loading a catalog is asynchronous; while it
// loads the current language stays, and when it fails the Language panel says so
// and the next attempt (back online, another change) applies it.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useUserPrefsRow } from '../lib/localData'
import { applyLanguagePreference, isApplied } from '../lib/i18n'
import { readLanguage } from '../lib/userPrefs'

export type LanguageStatus = 'ready' | 'loading' | 'failed'

const LanguageContext = createContext<LanguageStatus>('ready')

export function LanguageProvider({ children }: { children: ReactNode }) {
  // null: no row yet (signed out, or a new device before its first sync); the
  // language applied at first paint stays.
  const row = useUserPrefsRow()
  const pref = row ? readLanguage(row) : null
  const [status, setStatus] = useState<LanguageStatus>('ready')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (pref === null || isApplied(pref)) {
      setStatus('ready')
      return
    }
    let live = true
    setStatus('loading')
    applyLanguagePreference(pref).then(
      () => { if (live) setStatus('ready') },
      () => { if (live) setStatus('failed') },
    )
    return () => { live = false }
  }, [pref, attempt])

  // A catalog that could not be fetched is tried again when the browser is back online.
  useEffect(() => {
    if (status !== 'failed') return
    const again = () => setAttempt((n) => n + 1)
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [status])

  return <LanguageContext.Provider value={status}>{children}</LanguageContext.Provider>
}

/** Whether the chosen language is loading or could not be loaded (the Language panel). */
export function useLanguageStatus(): LanguageStatus {
  return useContext(LanguageContext)
}
