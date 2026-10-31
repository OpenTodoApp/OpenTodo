// `make obsidian-e2e`: e2e.test.ts against ../bin/opentodo (built by `make build`).
import base from './vitest.config.mjs'

export default {
  ...base,
  test: { ...base.test, include: ['e2e.test.ts'], exclude: ['node_modules/**'], testTimeout: 60_000, fileParallelism: false },
}
