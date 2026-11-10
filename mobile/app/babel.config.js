// Expo's preset, plus the Vite forms the shared library uses (babel/vite-import-meta.js).
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [require.resolve('./babel/vite-import-meta.js')],
  }
}
