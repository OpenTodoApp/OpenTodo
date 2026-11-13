// The app's native configuration (OpenSpec change native-app-foundation, D8 and D10):
// `npx expo prebuild` writes ios/ and android/ from this file, in CI and on demand;
// neither folder is committed or edited by hand. SDK 58 always builds with the New
// Architecture and Hermes, so neither needs a setting here.
//
// The ids are the current apps' (D10, the owner's decision of 2026-11-10): the native
// app ships under the existing App Store record as version 2.0.0, on TestFlight first,
// and as the next version of the Android app.
import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins'

// Plain http for a server on the person's own network, as in the shells (native-shells
// D3): the server screen accepts http only for local addresses (src/server.ts), iOS
// enforces the same with NSAllowsLocalNetworking, and Android has only all or nothing.
const withLocalHttp: ConfigPlugin = (c) =>
  withAndroidManifest(c, (m) => {
    const application = m.modResults.manifest.application?.[0]
    if (application) application.$['android:usesCleartextTraffic'] = 'true'
    return m
  })

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
    infoPlist: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } },
  },
  // The Android shell's application id (mobile/android/app/build.gradle.kts).
  android: {
    package: 'app.opentodo',
  },
  // The Keychain is read without Face ID, so the plugin's usage text is not needed.
  plugins: [['expo-secure-store', { faceIDPermission: false }], 'expo-web-browser'],
}

export default withLocalHttp(config)
