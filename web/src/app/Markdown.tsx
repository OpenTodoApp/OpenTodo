// The app's Markdown renderer: MarkdownView plus what only the device knows
// (OpenSpec editor-everywhere D5, D6): images from the task's attachments and
// links to tasks that show the task's current title and done state.
import type { ReactNode } from 'react'
import { useEmbeddedImage } from '../lib/embeds'
import { useTask } from '../lib/localData'
import { t } from '../lib/i18n'
import { Icon } from '../ui'
import { ImagePlaceholder, MarkdownView, type MarkdownEmbeds, type MarkdownProps } from './MarkdownView'
import { openTaskPanel } from './panel'

export type { MarkdownProps }

export function Markdown(props: MarkdownProps) {
  return <MarkdownView {...props} embeds={EMBEDS} />
}

/** A link to a task: its current title and done state when it is on this device, else the stored text. */
function TaskLink({ id, children }: { id: string; children: ReactNode }) {
  const task = useTask(id)
  const live = task && !task.deleted_at ? task : null
  return (
    <a
      href={`?task=${encodeURIComponent(id)}`}
      className={`task-ref inline-flex items-center gap-1 ${live?.completed_at ? 'text-muted line-through' : 'text-accent underline'}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        openTaskPanel(id)
      }}
    >
      {live?.completed_at ? <Icon name="check" size="xs" label={t('Done')} /> : null}
      {live ? live.title : children}
    </a>
  )
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

const EMBEDS: MarkdownEmbeds = { Image: EmbeddedImage, TaskLink }
