// The React Native side of the platform port (design D3): visibility from AppState,
// the network from NetInfo, preferences in MMKV and the time zone from
// expo-localization, the database on op-sqlite. src/setup.ts installs it before any
// shared module loads.
import NetInfo from '@react-native-community/netinfo'
import { getCalendars, getLocales } from 'expo-localization'
import { AppState } from 'react-native'
import { createMMKV } from 'react-native-mmkv'
import { installPlatform } from '@shared/platform'
import { createPlatform, type Host } from './platform'
import { opSqlite } from './storage/opSqlite'

let prefs: ReturnType<typeof createMMKV> | undefined
const prefsStore = () => (prefs ??= createMMKV({ id: 'opentodo.prefs' }))

/** Sign-out: the device's settings go with the account. */
export function clearPrefs(): void {
  prefsStore().clearAll()
}

export function reactNativeHost(): Host {
  const storage = prefsStore()
  return {
    appState: () => AppState.currentState ?? 'unknown',
    onAppState(fn) {
      const sub = AppState.addEventListener('change', fn)
      return () => sub.remove()
    },
    onConnected: (fn) => NetInfo.addEventListener((s) => fn(s.isConnected !== false)),
    storage: { getString: (k) => storage.getString(k), set: (k, v) => storage.set(k, v), remove: (k) => { storage.remove(k) } },
    timeZone: () => getCalendars()[0]?.timeZone ?? null,
    languages: () => getLocales().map((l) => l.languageTag),
    sql: opSqlite(),
  }
}

export function installAppPlatform(): void {
  installPlatform(createPlatform(reactNativeHost()))
}
