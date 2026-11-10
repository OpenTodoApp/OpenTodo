# The app's dependencies

Every package in `package.json`, with the reason it is there (OpenSpec change `native-app-foundation`, design D7). Versions are pinned exactly in `package.json` and were at least two weeks old when added (`.npmrc` sets `min-release-age=14`). A pull request that adds a package adds its line here; `scripts/repo-checks.test.mjs` fails on a package without a line, a line without a package, or a version that is not exact.

## Runtime

- `expo`: the SDK (58): native project generation (`expo prebuild`), the module system, the Metro and Babel configuration.
- `react`: the UI library; the version React Native 0.88 renders with.
- `react-native`: native views, Hermes and the New Architecture.
- `expo-localization`: the device's time zone for the platform port (`timeZone`).
- `@react-native-community/netinfo`: the network state for the platform port (`network`).
- `react-native-mmkv`: the platform port's small preferences store (`prefs`), synchronous like `localStorage`.
- `react-native-quick-crypto`: `crypto.subtle` and `crypto.getRandomValues` for the shared encryption code (AES-GCM, PBKDF2, HKDF); Hermes has no Web Crypto.
- `react-native-quick-base64`: required by `react-native-quick-crypto` (peer dependency).
- `react-native-nitro-modules`: the native module bridge `react-native-mmkv` and `react-native-quick-crypto` are built on (peer dependency).
- `@op-engineering/op-sqlite`: SQLite for the local database (design D4, task 4.3): the Dexie-subset adapter in `src/storage` runs every statement on the connection's own thread. 19.0.1, the newest release at least 14 days old, which the storage spike also ran.
- `yjs`: the notes document model, which the shared `applyOps` loads to merge a pulled note (`web/src/lib/richtext.ts`); its `lib0` asks for a React Native crypto package, which Metro points at the app's Web Crypto (`src/stubs/webcrypto.ts`).
- `dexie`: the local database's schema, which `web/src/lib/db.ts` declares on a Dexie instance, and the zones the adapter's transactions use (`src/storage/scope.ts`). Dexie never opens a database in the app; the adapter does.

## Development

- `typescript`: the type-check (`npm run typecheck`), and the import graph of `scripts/shared-modules.mjs` (`scripts/shared-graph.mjs` uses the app's TypeScript when web's is not installed).
- `@types/react`: React's types.
- `@types/node`: types for `app.config.ts` and the scripts (Node 24, as in CI).
- `@types/jest`: Jest's globals in the tests.
- `jest`: the test runner.
- `jest-expo`: Jest preset with the React Native and Expo module mocks.
- `@react-native/jest-preset`: required by `jest-expo` (peer dependency).
- `babel-preset-expo`: Expo's Babel preset, named by `babel.config.js` next to the app's own plugin (`babel/vite-import-meta.js`).
- `eslint`: the lint (`npm run lint`).
- `typescript-eslint`: ESLint's TypeScript parser.
- `eslint-plugin-react-hooks`: the Rules of Hooks.
- `fake-indexeddb`: IndexedDB in Node for the adapter's conformance suite (`test/storage`), which runs every scenario on Dexie, as the web does, and on the adapter. 6.2.6, the newest release at least 14 days old (web has 6.2.7).
- `@babel/plugin-transform-async-to-generator`: async functions as generators driven by the global Promise (`babel.config.js`), so the adapter's transaction zone follows an `await` on Hermes (design D4). Already installed by Expo's preset; named here because `babel.config.js` loads it.
