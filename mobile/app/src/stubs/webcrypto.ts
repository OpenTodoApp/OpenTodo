// lib0 (Yjs, the notes document model) asks for isomorphic-webcrypto under React Native
// (design D4, the storage spike's third finding); Metro points it here, at the app's Web
// Crypto, which src/setup.ts installs (react-native-quick-crypto) before lib0 loads.
const webcrypto = {
  ensureSecure: () => undefined,
  subtle: globalThis.crypto.subtle,
  getRandomValues: <T extends ArrayBufferView>(a: T): T => globalThis.crypto.getRandomValues(a as never) as T,
}

export default webcrypto
