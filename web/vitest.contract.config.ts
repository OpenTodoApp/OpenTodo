/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

// Contract tests (OpenSpec self-hosting "The sync client is tested against the
// server"): the real client code in src/lib (sync, ops, db, api, hlc) against the
// real Go server, started once from the built binary on a fresh data directory
// (src/test/contractServer.ts). `npm run test:contract`; needs ../bin/opentodo
// (`make server`) or OPENTODO_BIN.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.contract.test.ts'],
    setupFiles: ['./src/test/contractSetup.ts'],
    globalSetup: ['./src/test/contractServer.ts'],
    // One server, one account per test: files run one after another.
    fileParallelism: false,
    testTimeout: 60_000,
    env: { TZ: 'UTC' },
  },
})
