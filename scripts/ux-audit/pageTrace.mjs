// What a page did on its own just before a screen failed to open (a NAV finding): its
// main-frame navigations, failed document requests, console errors and warnings, and
// uncaught errors. A navigation the tour starts can be aborted by one the page starts
// itself (a reload, a redirect), and the finding alone does not say which.

const LIMIT = 12

/**
 * A ring of the last `limit` events, each with the milliseconds since the ring was made.
 * One page serves many screens: `mark` starts a new screen, and `lines` keeps only what
 * happened since the last mark (the mark included), so earlier screens' events do not read
 * as this one's cause.
 */
export function createTrace(limit = LIMIT, now = () => Date.now()) {
  const t0 = now()
  const events = []
  let since = 0 // events dropped before the last mark are gone; count them to find it
  let dropped = 0
  const push = (kind, text) => {
    events.push(`+${now() - t0}ms ${kind} ${String(text).replace(/\s+/g, ' ').slice(0, 160)}`)
    if (events.length > limit) { events.shift(); dropped++ }
  }
  return {
    push,
    mark(label) { since = dropped + events.length; push('screen', label) },
    lines: () => events.slice(Math.max(0, since - dropped)),
  }
}

const traces = new WeakMap()

/** Records what `page` does into its trace (traceOf); call it on every page the tour opens. */
export function tracePage(page) {
  const trace = createTrace()
  traces.set(page, trace)
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) trace.push('navigated', f.url()) })
  page.on('requestfailed', (r) => { if (r.isNavigationRequest()) trace.push('request failed', `${r.url()} ${r.failure()?.errorText ?? ''}`) })
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') trace.push(`console.${m.type()}`, m.text()) })
  page.on('pageerror', (e) => trace.push('page error', e.message))
  return trace
}

/** Marks the start of a screen on a page passed to tracePage (createTrace's mark). */
export function markScreen(page, label) {
  traces.get(page)?.mark(label)
}

/** The trace of a page passed to tracePage since its last markScreen, or none. */
export function traceOf(page) {
  return traces.get(page)?.lines() ?? []
}
