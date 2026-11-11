// The app's native configuration (OpenSpec change native-app-foundation, D8 and D10):
// `npx expo prebuild` writes ios/ and android/ from this file, in CI and on demand;
// neither folder is committed or edited by hand. SDK 58 always builds with the New
// Architecture and Hermes, so neither needs a setting here.
//
// The ids are the current apps' (D10, the owner's decision of 2026-11-10): the native
// app ships under the existing App Store record as version 2.0.0, on TestFlight first,
// and as the next version of the Android app.
import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'OpenTodo',
  slug: 'opentodo',
  version: '2.0.0',
  scheme: 'opentodo',
  orientation: 'portrait',
  // metro.config.js resolves @shared/* itself (with the shared modules' packages).
  experiments: { tsconfigPaths: false },
  ios: {
    bundleIdentifier: 'app.open-todo.ios',
    supportsTablet: false,
    // Light and dark with the system (on Android this needs expo-system-ui, not installed yet).
    userInterfaceStyle: 'automatic',
  },
  // The Android shell's application id (mobile/android/app/build.gradle.kts).
  android: {
    package: 'app.opentodo',
  },
}

export default config
