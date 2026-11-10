// The Linked references section's own chunk (note-links D5), loaded once and then kept:
// a section rendered after the chunk is in renders at once instead of suspending. A
// suspended section waited for React's reveal throttle (300 ms after the last fallback,
// such as the note editor's) before it could paint (issue 1179, nightly metric
// note-references); the Notes page loads the chunk when it opens, so opening a note
// paints its Linked references as soon as the link index is built.
import type { ComponentType } from 'react'
import { resettable } from '../lib/moduleState'
import type { LinkKind } from '../lib/noteLinkGrammar'

export type LinkedReferencesProps = { kind: LinkKind; id: string; folded?: boolean }

let loaded: ComponentType<LinkedReferencesProps> | null = null
let loading: Promise<ComponentType<LinkedReferencesProps>> | null = null
resettable('linkedRefsChunk', () => { loaded = null; loading = null })

/** Loads the section's chunk (once); resolves to the section. */
export function loadLinkedReferences(): Promise<ComponentType<LinkedReferencesProps>> {
  loading ??= import('./LinkedReferences').then((m) => (loaded = m.default))
  return loading
}

/** The section once its chunk is in, else null. */
export const linkedReferencesLoaded = (): ComponentType<LinkedReferencesProps> | null => loaded
