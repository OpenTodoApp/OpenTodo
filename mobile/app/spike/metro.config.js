// The storage spike's Metro configuration: storage-spike.yml renames the app's
// metro.config.js to metro.app.config.js and copies this file over it. It adds one
// thing: dexie-react-hooks, which shared modules of the sync path import at module
// level (task 4.5 settles them), resolves to a stub that throws when called.
const path = require('node:path')
const config = require('./metro.app.config.js')

// lib0 (Yjs) asks for isomorphic-webcrypto under React Native: the app's Web Crypto instead.
const stubs = {
  'dexie-react-hooks': path.join(__dirname, 'spike/stubs/dexie-react-hooks.ts'),
  'isomorphic-webcrypto/src/react-native': path.join(__dirname, 'spike/stubs/webcrypto.ts'),
}
const resolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) =>
  stubs[moduleName] ? { type: 'sourceFile', filePath: stubs[moduleName] } : resolve(context, moduleName, platform)

module.exports = config
