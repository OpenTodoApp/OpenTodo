// Start-up: the host for the shared library comes first, then the screens.
import { registerRootComponent } from 'expo'
import { installCrypto } from './src/crypto'
import { installAppPlatform } from './src/host'
import App from './src/App'

installCrypto()
installAppPlatform()
registerRootComponent(App)
