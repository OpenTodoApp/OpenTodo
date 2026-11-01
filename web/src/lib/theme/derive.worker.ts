// Derives a chosen theme off the main thread at start (load.ts): a document whose
// seeds sit in the middle band can take seconds to derive, which must not hold up
// the app. One document in, its resolved theme out; the cached result spares
// this whenever the document is unchanged.
import { deriveTheme } from './derive'
import type { ThemeDocument } from './format'

self.onmessage = (e: MessageEvent<ThemeDocument>) => {
  try {
    self.postMessage({ resolved: deriveTheme(e.data) })
  } catch (err) {
    self.postMessage({ error: String(err) })
  }
}
