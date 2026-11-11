// Start-up: the host for the shared library first (src/setup.ts: polyfills, Web Crypto,
// the platform port with the SQLite database), then the screens.
import './src/setup'
import { registerRootComponent } from 'expo'
import App from './src/App'

registerRootComponent(App)
