// The storage spike's computer half (design D4): builds the account's rows from the
// pulled ops with the shared applyOps, and runs the session on both candidates over
// node:sqlite. Only run by hand or by storage-spike.yml (`npx jest -c spike/jest.config.js`).
const path = require('node:path')
const base = require('../jest.config.js')

module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, '..'),
  roots: ['<rootDir>/spike'],
  moduleNameMapper: { ...base.moduleNameMapper, '^dexie-react-hooks$': '<rootDir>/spike/stubs/dexie-react-hooks.ts' },
  testEnvironment: 'node',
  testTimeout: 30 * 60_000,
}
