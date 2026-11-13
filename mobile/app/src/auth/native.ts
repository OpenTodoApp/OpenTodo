// The phone's side of sign-in: the Keychain or Keystore (expo-secure-store), the
// system's authentication sheet (ASWebAuthenticationSession on iOS, a Custom Tab on
// Android, through expo-web-browser), which shares the browser's cookies and passkeys,
// and the account's database.
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { clearPrefs } from '../host'
import { forgetAccount, openAccount } from '../storage/account'
import { stopAccountSync } from '../sync'
import type { AccountDeps, Secrets } from './account'
import type { SignInDeps } from './signIn'

// Readable after the first unlock, so a later background sync can refresh; never
// copied to another device.
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }

const secrets: Secrets = {
  get: (key) => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: (key) => SecureStore.deleteItemAsync(key, options),
}

export const signInDeps: SignInDeps = {
  openSheet: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
  device: Platform.OS === 'ios' ? 'iPhone' : 'Android',
}

export function accountDeps(onEnded: () => void): AccountDeps {
  // Sync stops, and its running exchange with it, before the data goes.
  const forget = () => stopAccountSync().then(forgetAccount)
  return { secrets, database: { open: openAccount, forget }, clearPrefs, onEnded }
}
