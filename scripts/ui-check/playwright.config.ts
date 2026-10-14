// Visual regression over the static workbench (OpenSpec design-system "Visual
// regression gate on stories"). Baselines are only generated inside the pinned
// Playwright image (`make ui-baselines`), because font rasterisation differs per OS.
// No import from @playwright/test here, so a global install works (see Makefile).
const port = Number(process.env.UI_CHECK_PORT ?? 6106)

export default {
  testDir: '.',
  testMatch: 'visual.spec.ts',
  outputDir: '../../web/test-results/ui-visual',
  snapshotPathTemplate: process.env.UI_BASELINE_DIR
    ? `${process.env.UI_BASELINE_DIR}/{arg}{ext}`
    : '../../web/src/ui/__screenshots__/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../web/playwright-report/ui-visual' }]],
  fullyParallel: true,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' } },
  webServer: { command: 'node serve-cli.mjs', url: `http://127.0.0.1:${port}/index.json`, reuseExistingServer: false },
}
