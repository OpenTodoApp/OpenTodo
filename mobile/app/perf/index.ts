// The performance run's entry (design D4, app-perf): app-native.yml points package.json's
// `main` here for its simulator build only; the app's entry stays index.ts. The same
// start-up as the app (src/setup.ts), with the time JavaScript started.
import './start'
import '../src/setup'
import { registerRootComponent } from 'expo'
import PerfApp from './PerfApp'

registerRootComponent(PerfApp)
