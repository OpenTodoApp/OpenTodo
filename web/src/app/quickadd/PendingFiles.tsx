// Files waiting to be attached when the text they were pasted into is saved: the comment
// composer's list and quick add's (quick-add-files D2, D3). Names are text, never rendered.
import { type ClipboardEvent, type RefObject, useState } from 'react'
import { AttachmentError, checkFiles } from '../../lib/attachments'
import { useDemo } from '../../lib/demoState'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { filesFrom } from '../../lib/pastedFiles'
import { Icon, IconButton } from '../../ui'

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

  async function accept(pasted: File[]) {
    setError(null)
    try {
      if (demo) throw new AttachmentError('disabled', t('Files are not attached on this demo instance.'))
      await checkFiles([...files, ...pasted])
      setFiles((f) => [...f, ...pasted])
      setTaken(pasted[pasted.length - 1].name)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  /** True when the paste held files and was taken here; otherwise the caller handles it. */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): boolean {
    const pasted = enabled ? filesFrom(e.clipboardData) : []
    if (pasted.length === 0) return false
    e.preventDefault()
    void accept(pasted)
    return true
  }

  function clear() {
    setFiles([])
    setError(null)
    setTaken(null)
  }

  /** The input with the waiting files (D1, D4). */
  function attach<T extends object>(input: T): T & { files?: File[] } {
    return files.length ? { ...input, files } : input
  }

  /**
   * Takes the waiting files off the list for a save: the returned `send` runs it with
   * them. When saving refuses them (a limit learnt since the paste, a locked key),
   * they come back with the reason and `putBack` restores the line (D2).
   */
  function take() {
    const list = files
    clear()
    return async <T extends object>(input: T, run: (input: T & { files?: File[] }) => unknown, putBack: () => void) => {
      try {
        await run(list.length ? { ...input, files: list } : input)
      } catch (err) {
        if (!list.length || !(err instanceof AttachmentError)) throw err
        putBack()
        setFiles(list)
        setError(err.message)
      }
    }
  }

  function remove(i: number) {
    setFiles((f) => f.filter((_, j) => j !== i))
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
