// The first module of the performance run: when JavaScript started, on the JS clock
// (cold start splits into launch to JS and JS to Today) and on the wall clock (the host
// compares it with the time it launched the app). An error that would end the app
// (a Release build has no red screen) is posted to the host first, so the job shows it.
const g = globalThis as {
  __perfStart?: number
  __perfStartedAt?: number
  ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(fn: (e: unknown, fatal?: boolean) => void): void }
}
g.__perfStart = performance.now()
g.__perfStartedAt = Date.now()

const report = (what: string, e: unknown) => {
  const text = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e)
  return fetch('http://127.0.0.1:8099/log', { method: 'POST', body: `${what}: ${text}` }).catch(() => undefined)
}

const utils = g.ErrorUtils
if (utils) {
  const previous = utils.getGlobalHandler()
  utils.setGlobalHandler((e, fatal) => {
    void report(fatal ? 'fatal error' : 'error', e).finally(() => setTimeout(() => previous(e, fatal), 1000))
  })
}

export {}
