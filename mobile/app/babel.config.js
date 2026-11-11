// Expo's preset, plus the Vite forms the shared library uses (babel/vite-import-meta.js)
// and async functions as generators driven by the global Promise (design D4, the storage
// spike's first finding). Hermes runs native async functions on its own promise
// machinery, so a zone cannot follow an `await` there; the database adapter's
// transactions use Dexie's zones (src/storage/scope.ts), which swap the global Promise,
// and the transformed functions use whichever is current. Jest uses the same, so the
// tests run the transactions as the phone does.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [require.resolve('./babel/vite-import-meta.js'), require.resolve('@babel/plugin-transform-async-to-generator')],
  }
}
