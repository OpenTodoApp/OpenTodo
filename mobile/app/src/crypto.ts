// crypto.subtle and crypto.getRandomValues for the shared library's encryption
// (web/src/lib/crypto.ts: AES-GCM, PBKDF2, HKDF, random values), from
// react-native-quick-crypto's native implementation (OpenSpec change
// native-app-foundation D3). Hermes has no Web Crypto of its own.
import { install } from 'react-native-quick-crypto'

export function installCrypto(): void {
  install()
}
