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

## Development

- `typescript`: the type-check (`npm run typecheck`), and the import graph walk of `scripts/shared-modules.mjs`.
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
- `dexie`: types only, for now: the shared modules' `import type` chains reach web's data layer (`db.ts`), so the type-check needs Dexie's types. It becomes a runtime dependency with the storage choice (task 4.3).
- `yjs`: types only, for the same reason (the notes document model, reached through `import type`).
