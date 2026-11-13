// Jest with Expo's preset (OpenSpec change native-app-foundation, task 4.2). The shared
// library is compiled by this app's Babel config like the app's own code, and its
// packages resolve from this app's node_modules (test/resolver.js), as in Metro.
module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../../web/src/lib/$1',
    // As in Metro (metro.config.js): the web-only live-query hook is a stub here.
    '^dexie-react-hooks$': '<rootDir>/src/stubs/dexie-react-hooks.ts',
  },
  resolver: '<rootDir>/test/resolver.js',
  // The native gesture and animation libraries' mocks (test/setup.js).
  setupFiles: ['<rootDir>/test/setup.js'],
  // Transform the shared library too (it lives outside this folder).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-native-.*|@react-native/.*|@react-navigation/.*|@bottom-tabs/.*|sf-symbols-typescript|color|color-convert|color-string|color-name|use-latest-callback|nanoid|query-string|decode-uri-component|split-on-first|filter-obj))',
  ],
}
