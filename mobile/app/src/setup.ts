// Start-up, imported first by index.ts so it runs before any shared module loads (an
// import's body runs before the importing module's): db.ts asks the platform port for
// its database when it loads, so the app's port must be installed by then.
//
// Dexie loads before Web Crypto: at load it reads the engine's own promise from
// crypto.subtle (design D4, the storage spike), which must be Hermes' and not
// react-native-quick-crypto's.
import 'dexie'
import { installCrypto } from './crypto'
import { installAppPlatform } from './host'
import { installPolyfills } from './polyfills'

installPolyfills()
installCrypto()
installAppPlatform()
