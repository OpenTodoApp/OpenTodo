// Files waiting to be attached when the text they were pasted into is saved: the comment
// composer's list and quick add's (quick-add-files D2, D3). Names are text, never rendered.
import { type ClipboardEvent, type RefObject, useRef, useState } from 'react'
import { AttachmentError, checkFiles } from '../../lib/attachments'
import { useDemo } from '../../lib/demoState'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { filesFrom, isTextWithPicture } from '../../lib/pastedFiles'
import { Icon, IconButton } from '../../ui'

interface Batch { files: File[]; checks: Promise<void> }
const newBatch = (): Batch => ({ files: [], checks: Promise.resolve() })

/**
 * Quick add's pasted files (D2): a paste with files is held and, once the attachment
 * checks pass, its files wait for the task; `view` is the list, the refusal and the
 * screen-reader line. Off (`enabled` false), every paste goes on as before.
 */
export function usePastedFiles(field: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  // The last file taken, for screen readers.
  const [taken, setTaken] = useState<string | null>(null)
  const demo = useDemo()
  // The files for the next task and the checks still running for them: a paste just
  // before Enter goes with that task, and each check sees the files before it.
  const batch = useRef<Batch>(newBatch())

  function accept(pasted: File[]) {
    const b = batch.current
    setError(null)
    b.checks = b.checks.then(async () => {
      try {
        if (demo) throw new AttachmentError('disabled', t('Files are not attached on this demo instance.'))
        await checkFiles([...b.files, ...pasted])
        b.files = [...b.files, ...pasted]
        if (b !== batch.current) return
        setFiles(b.files)
        setTaken(pasted[pasted.length - 1].name)
      } catch (err) {
        setError(messageOf(err))
      }
    })
  }

  /** True when the paste held files and was taken here; otherwise the caller handles it. */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): boolean {
    // A spreadsheet's or a slide's rows come as text with a picture of them: they are text.
    const pasted = enabled && !isTextWithPicture(e.clipboardData) ? filesFrom(e.clipboardData) : []
    if (pasted.length === 0) return false
    e.preventDefault()
    accept(pasted)
    return true
  }

  function clear() {
    batch.current = newBatch()
    setFiles([])
    setError(null)
    setTaken(null)
  }

  /** The input with the waiting files once their checks are done (D1, D4). */
  async function attach<T extends object>(input: T): Promise<T & { files?: File[] }> {
    const b = batch.current
    await b.checks
    return b.files.length ? { ...input, files: b.files } : input
  }

  /**
   * Takes the waiting files off the list for a save, those still being checked
   * included: the returned `send` runs it with them. When saving refuses them (a limit
   * learnt since the paste, a locked key), they come back with the reason and
   * `putBack` restores the line (D2).
   */
  function take() {
    const b = batch.current
    clear()
    return async <T extends object>(input: T, run: (input: T & { files?: File[] }) => unknown, putBack: () => void) => {
      await b.checks
      const list = b.files
      try {
        await run(list.length ? { ...input, files: list } : input)
      } catch (err) {
        if (!list.length || !(err instanceof AttachmentError)) throw err
        putBack()
        const now = batch.current
        now.files = [...list, ...now.files]
        setFiles(now.files)
        setError(err.message)
      }
    }
  }

  function remove(i: number) {
    const b = batch.current
    b.files = b.files.filter((_, j) => j !== i)
    setFiles(b.files)
    setTaken(null)
    field.current?.focus()
  }

  const view = (className: string) => (
    <>
      <PendingFiles files={files} onRemove={remove} className={className} />
      {error && <p role="alert" className={`text-meta text-danger ${className}`} data-quick-add-file-error>{error}</p>}
      {enabled && <span className="sr-only" role="status">{taken && t('{name} will be attached', { name: taken })}</span>}
    </>
  )
  return { onPaste, clear, attach, take, view }
}

export function PendingFiles({ files, onRemove, className = '' }: {
  files: readonly File[]
  onRemove: (index: number) => void
  className?: string
}) {
  if (files.length === 0) return null
  return (
    <ul aria-label={t('Files to attach')} className={`flex flex-wrap gap-1 ${className}`} data-pending-files>
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-control bg-sunken py-0.5 pl-2 text-meta text-default">
          <Icon name="paperclip" size="xs" className="text-faint" /><span className="min-w-0 truncate">{f.name}</span>
          <IconButton icon="x" size="sm" label={t('Remove {name}', { name: f.name })} onClick={() => onRemove(i)} />
        </li>
      ))}
    </ul>
  )
}
