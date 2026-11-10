// The storage spike only: lib0 (Yjs) asks for isomorphic-webcrypto under React Native;
// the app's Web Crypto is react-native-quick-crypto's, which spike/polyfills.ts installs
// as globalThis.crypto before anything else loads.
const webcrypto = {
  ensureSecure: () => undefined,
  subtle: globalThis.crypto.subtle,
  getRandomValues: <T extends ArrayBufferView>(a: T): T => globalThis.crypto.getRandomValues(a as never) as T,
}

export default webcrypto
