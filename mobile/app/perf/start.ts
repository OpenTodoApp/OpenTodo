// The first module of the performance run: when JavaScript started, on the JS clock
// (cold start splits into launch to JS and JS to Today) and on the wall clock (the host
// compares it with the time it launched the app).
const g = globalThis as { __perfStart?: number; __perfStartedAt?: number }
g.__perfStart = performance.now()
g.__perfStartedAt = Date.now()

export {}
