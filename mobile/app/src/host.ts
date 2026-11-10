// The React Native side of the platform port (design D3): visibility from AppState,
// the network from NetInfo, preferences in MMKV and the time zone from
// expo-localization. index.ts installs it before anything else runs.
import NetInfo from '@react-native-community/netinfo'
import { getCalendars } from 'expo-localization'
import { AppState } from 'react-native'
import { createMMKV } from 'react-native-mmkv'
import { installPlatform } from '@shared/platform'
import { createPlatform, type Host } from './platform'

export function reactNativeHost(): Host {
  const storage = createMMKV({ id: 'opentodo.prefs' })
  return {
    appState: () => AppState.currentState ?? 'unknown',
    onAppState(fn) {
      const sub = AppState.addEventListener('change', fn)
      return () => sub.remove()
    },
    onConnected: (fn) => NetInfo.addEventListener((s) => fn(s.isConnected !== false)),
    storage: { getString: (k) => storage.getString(k), set: (k, v) => storage.set(k, v), remove: (k) => { storage.remove(k) } },
    timeZone: () => getCalendars()[0]?.timeZone ?? null,
  }
}

export function installAppPlatform(): void {
  installPlatform(createPlatform(reactNativeHost()))
}
