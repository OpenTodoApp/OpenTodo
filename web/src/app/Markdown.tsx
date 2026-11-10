// The app's Markdown renderer: MarkdownView plus what only the device knows
// (OpenSpec editor-everywhere D5, D6, note-links D2, D4): images from the task's
// attachments, and links to tasks, notes and projects that read as the item's
// current title (a done task struck through), or as muted text when the item is
// missing, in the Trash or out of reach.
import { lazy, Suspense, type ReactNode } from 'react'
import { useEmbeddedImage } from '../lib/embeds'
import { t } from '../lib/i18n'
import { linkedReferencesLoaded, loadLinkedReferences, type LinkedReferencesProps } from './linkedRefsChunk'
import { ImagePlaceholder, MarkdownView, type MarkdownEmbeds, type MarkdownProps } from './MarkdownView'

export type { MarkdownProps }

export function Markdown(props: MarkdownProps) {
  return <MarkdownView {...props} embeds={EMBEDS} />
}

// Internal links load with a small chunk of their own (note-links D2): the stored text shows until then.
const RefLinkLazy = lazy(() => import('./RefChip'))
function RefLink(props: { kind: 'task' | 'note' | 'project'; id: string; children: ReactNode }) {
  return <Suspense fallback={props.children}><RefLinkLazy {...props} /></Suspense>
}

// Linked references (note-links D5) below a task's notes, at the end of a note and in a
// project's note area: the section and the link index are a chunk of their own. Once the
// chunk is in, the section renders without suspending (linkedRefsChunk.ts).
const LinkedReferences = lazy(() => loadLinkedReferences().then((c) => ({ default: c })))
export function LinkedRefs(props: LinkedReferencesProps) {
  const Loaded = linkedReferencesLoaded()
  return <Suspense fallback={null}>{Loaded ? <Loaded {...props} /> : <LinkedReferences {...props} />}</Suspense>
}

/** An attachment of the task shown in place, or a placeholder naming its state. */
export function EmbeddedImage({ id, alt, taskId }: { id: string; alt: string; taskId: string | null }) {
  const s = useEmbeddedImage(id, taskId)
  if (s.kind === 'ready') return <img src={s.src} alt={alt} className="embedded-image max-h-96 max-w-full rounded-control" />
  const text = s.kind === 'removed' ? t('Removed image')
    : s.kind === 'locked' ? t('Encrypted image')
      : s.kind === 'uploading' ? t('{name}: uploading', { name: s.name })
        : s.kind === 'waiting' ? t('{name}: waiting to upload', { name: s.name }) : t('Loading image')
  return <ImagePlaceholder text={text} alt={alt} state={s.kind} locked={s.kind === 'locked'} />
}

const EMBEDS: MarkdownEmbeds = { Image: EmbeddedImage, RefLink }
