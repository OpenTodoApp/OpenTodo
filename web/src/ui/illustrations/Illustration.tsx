// Illustrations for empty and finished states (OpenSpec change inbox-means-unplaced,
// design D9; design-system "Illustrations"): calm inline line drawings on the design
// tokens, decorative, 160 by 120 px, at most 4 KB each. Views name one; the empty-state
// pattern draws it above its sentence. `make ui-lint` checks the files in this folder.
import { InboxZero } from './InboxZero'

const ILLUSTRATIONS = { 'inbox-zero': InboxZero } as const

export type IllustrationName = keyof typeof ILLUSTRATIONS

/** The named illustration in the muted text colour; hidden from assistive technology. */
export function Illustration({ name }: { name: IllustrationName }) {
  const Drawing = ILLUSTRATIONS[name]
  return <span className="block text-muted" aria-hidden="true" data-illustration-slot><Drawing /></span>
}
