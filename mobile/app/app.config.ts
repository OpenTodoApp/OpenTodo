// The app's native configuration (OpenSpec change native-app-foundation, D8 and D10):
// `npx expo prebuild` writes ios/ and android/ from this file, in CI and on demand;
// neither folder is committed or edited by hand. SDK 58 always builds with the New
// Architecture and Hermes, so neither needs a setting here.
import type { ExpoConfig } from 'expo/config'

const version = process.env.OPENTODO_VERSION ?? '0.0.0'

const config: ExpoConfig = {
  name: 'OpenTodo Preview',
  slug: 'opentodo-preview',
  version,
  scheme: 'opentodo',
  orientation: 'portrait',
  // metro.config.js resolves @shared/* itself (with the shared modules' packages).
  experiments: { tsconfigPaths: false },
  ios: {
    bundleIdentifier: 'app.open-todo.preview',
    supportsTablet: false,
    // Light and dark with the system (on Android this needs expo-system-ui, not installed yet).
    userInterfaceStyle: 'automatic',
  },
  // An Android application id cannot hold a hyphen; the Android shell is app.opentodo.
  android: {
    package: 'app.opentodo.preview',
  },
}

export default config
