// Pressed feedback on iOS (press-feedback-delay D1): WebKit matches `:active` on a
// touch only while the document has a touch listener. A passive no-op keeps that true
// on every page, so the delayed pressed look shows on a phone as it does elsewhere.

/** Installs the listener on `doc`; returns the stop. */
export function keepTouchActive(doc: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  const noop = () => {}
  doc.addEventListener('touchstart', noop, { passive: true })
  return () => doc.removeEventListener('touchstart', noop)
}
