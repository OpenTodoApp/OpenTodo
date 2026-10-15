// Comment composer (OpenSpec task-detail-redesign D5; comments "Composer behaviour"):
// markdown text that grows with its content, `@` completion from the cached project
// members, Ctrl/⌘+Enter submits, Esc cancels or leaves the field. The new-comment
// composer keeps an unsent draft per task in this tab's session (never synced).
import { forwardRef, type KeyboardEvent, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Kbd } from '../shortcuts/Kbd'
import { mentionAt, mentionCandidates, mentionsInBody, mentionToken } from '../../lib/comments'
import type { ProjectMember } from '../../lib/types'
import { Button, IconButton } from '../../ui'
import { Icon } from '../../ui'
import { Popover } from '../overlay'
import { filesFrom } from './AttachmentsRow'

const MAX_LINES = 10
const LINE_PX = 20

// Drafts live in memory and in sessionStorage: device-local, gone with the browser session.
const drafts = new Map<string, string>()
const draftStorageKey = (taskId: string) => `ot.draft.${taskId}`

export function readDraft(taskId: string): string {
  if (drafts.has(taskId)) return drafts.get(taskId)!
  try {
    return sessionStorage.getItem(draftStorageKey(taskId)) ?? ''
  } catch {
    return ''
  }
}

export function writeDraft(taskId: string, body: string) {
  if (body) drafts.set(taskId, body)
  else drafts.delete(taskId)
  try {
    if (body) sessionStorage.setItem(draftStorageKey(taskId), body)
    else sessionStorage.removeItem(draftStorageKey(taskId))
  } catch {
    // storage unavailable: the in-memory copy still covers closing and reopening the panel
  }
}

/** The submit hint: ⌘ on Apple platforms, Ctrl elsewhere. */
function submitKey(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}

export interface ComposerProps {
  id: string
  /** Keep the unsent text as this task's draft (the main composer only). */
  draftTaskId?: string
  initial?: string
  members: ProjectMember[]
  me: string | null
  /** Resolves false (or rejects inside) when the comment was not stored; the text is then kept. */
  onSubmit: (body: string, mentions: string[], files: File[]) => Promise<unknown>
  /** Offer an attach button: picked or pasted files go with the comment (OpenSpec attachments). */
  attach?: boolean
  onCancel?: () => void
  autoFocus?: boolean
  submitLabel: string
  /** Accessible name of the text field. */
  label: string
}

export const Composer = forwardRef<HTMLTextAreaElement | null, ComposerProps>(function Composer(
  { id, draftTaskId, initial = '', members, me, onSubmit, onCancel, autoFocus, submitLabel, label, attach = false }, ref,
) {
  const [files, setFiles] = useState<File[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const [body, setBodyState] = useState(() => (draftTaskId ? readDraft(draftTaskId) || initial : initial))
  const [picked, setPicked] = useState(() => new Map<string, string>(members.filter((m) => initial.includes(`@${mentionToken(m)}`)).map((m) => [m.userId, mentionToken(m)])))
  const [caret, setCaret] = useState(initial.length)
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const area = useRef<HTMLTextAreaElement | null>(null)
  useImperativeHandle(ref, () => area.current as HTMLTextAreaElement, [])
  const at = members.length ? mentionAt(body, caret) : null
  const options = at && !closed ? mentionCandidates(members, at.query, me) : []
  const listId = `${id}-mentions`

  const setBody = (next: string) => {
    setBodyState(next)
    if (draftTaskId) writeDraft(draftTaskId, next)
  }

  // Another task opened in the same panel: show that task's draft.
  useEffect(() => {
    if (draftTaskId) setBodyState(readDraft(draftTaskId))
  }, [draftTaskId])

  // Grow with the content up to about ten lines, then scroll.
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    const max = MAX_LINES * LINE_PX + 16
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [body])

  function pick(m: Pick<ProjectMember, 'userId' | 'name' | 'email'>) {
    if (!at) return
    const token = mentionToken(m)
    const next = `${body.slice(0, at.start)}@${token} ${body.slice(caret)}`
    const pos = at.start + token.length + 2
    setBody(next)
    setPicked((p) => new Map(p).set(m.userId, token))
    setCaret(pos)
    setActive(0)
    requestAnimationFrame(() => area.current?.setSelectionRange(pos, pos))
  }

  const canSend = !!body.trim() || files.length > 0
  async function submit() {
    if (!canSend || busy) return
    setBusy(true)
    const ok = await onSubmit(body, mentionsInBody(body, picked), files)
    setBusy(false)
    if (ok !== false && !onCancel) {
      setBody('')
      setPicked(new Map())
      setFiles([])
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(options[Math.min(active, options.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setClosed(true)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (onCancel) onCancel()
      else (e.target as HTMLTextAreaElement).blur()
    }
  }

  const key = submitKey()
  return (
    <div className="relative" data-composer>
      <textarea
        id={id}
        ref={area}
        rows={2}
        className="input min-h-16 resize-none text-sm leading-5"
        placeholder={members.length ? 'Write a comment… (markdown, @ to mention)' : 'Write a comment… (markdown)'}
        aria-label={label}
        aria-describedby={`${id}-hint`}
        value={body}
        autoFocus={autoFocus}
        role={options.length ? 'combobox' : undefined}
        aria-expanded={options.length ? true : undefined}
        aria-controls={options.length ? listId : undefined}
        aria-activedescendant={options.length ? `${listId}-${Math.min(active, options.length - 1)}` : undefined}
        onChange={(e) => {
          setBody(e.target.value)
          setCaret(e.target.selectionStart)
          setClosed(false)
          setActive(0)
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={attach ? (e) => {
          const pasted = filesFrom(e.clipboardData)
          if (pasted.length === 0) return
          e.preventDefault()
          setFiles((f) => [...f, ...pasted])
        } : undefined}
      />
      {files.length > 0 && (
        <ul aria-label="Files to attach" className="mt-1 flex flex-wrap gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-control bg-sunken py-0.5 pl-2 text-meta text-default">
              <Icon name="paperclip" size="xs" className="text-faint" /><span className="min-w-0 truncate">{f.name}</span>
              <IconButton icon="x" size="sm" label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      {/* Non-modal: focus stays in the textarea (combobox pattern); a sheet on phones. */}
      <Popover open={options.length > 0} onClose={() => setClosed(true)} anchor={area} label="Mention a member" modal={false} align="start" role={undefined} className="py-1">
        <ul id={listId} role="listbox" aria-label="Mention a member">
          {options.map((m, i) => (
            <li key={m.userId} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`flex min-h-11 cursor-pointer flex-wrap items-center gap-x-1 px-3 py-1 ${i === active ? 'bg-sunken' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m) }}>
              {m.name || m.email} <span className="user-text text-xs text-faint">{m.email}</span>
            </li>
          ))}
        </ul>
      </Popover>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={!canSend} busy={busy} onClick={() => void submit()}>
          {submitLabel === 'Comment' && <Icon name="send" size="sm" />}{submitLabel}
        </Button>
        {attach && (
          <>
            <input ref={picker} type="file" multiple hidden aria-label="Choose files for the comment" data-testid="comment-file-picker"
              onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; setFiles((f) => [...f, ...picked]) }} />
            <IconButton icon="paperclip" size="sm" label="Attach files" onClick={() => picker.current?.click()} />
          </>
        )}
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        <span id={`${id}-hint`} className="ml-auto text-hint text-faint">Send with <Kbd k={`${key}+Enter`} /></span>
      </div>
    </div>
  )
})
