// The storage spike's Babel configuration: storage-spike's job copies this file over the
// app's babel.config.js. It adds one plugin: async functions become generators driven by
// the global Promise. Hermes runs native async functions on its own promise machinery,
// so Dexie cannot carry a transaction's zone across an `await` (the zone probe:
// PrematureCommitError with await, the same scope as a promise chain works); Dexie
// replaces the global Promise inside a transaction, which the transformed code uses.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [require.resolve('./babel/vite-import-meta.js'), require.resolve('@babel/plugin-transform-async-to-generator')],
  }
}
