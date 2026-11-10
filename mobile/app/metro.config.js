// Metro sees the shared library (OpenSpec change native-app-foundation D2): @shared/*
// is web/src/lib/*, and web/src is watched. (tsconfig.json's paths say the same for
// tsc, next to type-only entries, so app.config.ts turns Expo's reading of them off.)
// A package a shared module imports resolves as if this app imported it, never from
// web/node_modules: one React, one version of each dependency, and a build that does
// not need web's install (test/resolver.js does the same for Jest).
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const app = __dirname
const web = path.resolve(app, '../../web') + path.sep
const entry = path.join(app, 'index.ts')

const config = getDefaultConfig(app)
config.watchFolders = [path.join(web, 'src')]
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@shared/')) {
    return context.resolveRequest(context, path.join(web, 'src/lib', moduleName.slice('@shared/'.length)), platform)
  }
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName)
  const fromWeb = context.originModulePath.startsWith(web)
  return context.resolveRequest(bare && fromWeb ? { ...context, originModulePath: entry } : context, moduleName, platform)
}

module.exports = config
