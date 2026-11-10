// The storage spike's entry (design D4): storage-spike.yml points package.json's
// `main` here for its simulator build only; the app's entry stays index.ts.
import './polyfills'
import { registerRootComponent } from 'expo'
import { installAppPlatform } from '../src/host'
import { opSql } from './opSql'
import { installSql } from './sqlite'
import SpikeApp from './SpikeApp'

installAppPlatform()
installSql(opSql())
registerRootComponent(SpikeApp)
