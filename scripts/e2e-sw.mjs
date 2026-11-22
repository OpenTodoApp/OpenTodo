// Offline steps wait for the built service worker (issue 1746): it activates only after
// its precache (about 14 MB) is complete, and then claims the page. A step that goes
// offline before that can lose a script chunk the page still needs, and a reload made
// while it installs is not controlled until it finishes. On a busy CI runner that takes
// longer than a fixed few seconds, so the steps wait for the condition itself.

/**
 * Waits until the page's service worker is active (its precache complete) and controls
 * the page, and logs how long that took. `timeout` bounds a worker that never installs.
 */
export async function untilOfflineReady(page, { label = 'page', timeout = 120_000 } = {}) {
  const started = Date.now()
  await page.waitForFunction(() => {
    const sw = navigator.serviceWorker
    return !!sw && !!sw.controller && sw.controller.state === 'activated'
  }, null, { timeout, polling: 250 })
  console.log(`  ${label}: service worker ready after ${Date.now() - started} ms`)
}
