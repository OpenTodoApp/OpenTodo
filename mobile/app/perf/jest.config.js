// The performance run's computer half (perf/local.test.ts): only run by hand or by
// app-native.yml's app-perf job (`npx jest -c perf/jest.config.js`), never by make app.
const path = require('node:path')
const base = require('../jest.config.js')

module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, '..'),
  roots: ['<rootDir>/perf'],
  testEnvironment: 'node',
  testTimeout: 30 * 60_000,
}
