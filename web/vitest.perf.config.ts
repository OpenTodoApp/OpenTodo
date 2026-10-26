// The scale tests (`*.perf.test.ts(x)`, 2,000 rows or tasks): they assert counts
// (renders, reads), not times, but take tens of seconds each, so they run on their
// own (`npm run test:perf`; CI's "Web scale tests" job), never beside the unit suite.
import { defineConfig } from 'vitest/config'
import base from './vite.config'

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.perf.test.{ts,tsx}'],
    exclude: ['node_modules/**'],
  },
})
