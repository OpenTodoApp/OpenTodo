// Unit tests of the Obsidian plugin (make obsidian). They run with web/'s vitest
// and happy-dom, so the plugin adds no test tooling of its own; `obsidian` is
// replaced by an in-memory stand-in (test/obsidian.ts), and web's i18n by the
// same shim the bundle uses (esbuild.config.mjs), so tests run what ships.
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

export default {
  resolve: {
    alias: [
      { find: /^obsidian$/, replacement: here('./test/obsidian.ts') },
      { find: /^vitest$/, replacement: here('../web/node_modules/vitest/dist/index.js') },
      { find: /^(\.{1,2}\/)+i18n(\/catalog)?$/, replacement: here('./src/shims/i18n.ts') },
    ],
  },
  test: {
    root: here('.'),
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['e2e.test.ts', 'node_modules/**'],
    env: { TZ: 'UTC' },
    testTimeout: 30_000,
  },
}
