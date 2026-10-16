import { Icon } from '../../ui'
import { Skeleton } from '../../ui'
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '../../lib/api'
import {
  applyChanges, autoApplicable, clearThreads, describeStreamError, describeTurnError, getAutoApply, listThreads, newThread,
  refreshReview, reviewChangeSet, saveThread, streamTurn, takeSentences, turnMessages, undoChanges, usageLine, type Review,
} from '../../lib/assistant'
import { assistantStatus, refreshAssistantStatus, setAssistantStatus, takeAssistantPrefill, useAssistantPrefill, type AssistantPrefill, type AssistantStatus } from '../../lib/assistantStatus'
import { isMaterial, useAssistantSkills, workday, type AssistantSkill } from '../../lib/assistantSkills'
import { MenuGroup, MenuItem } from '../../ui'
import { Menu } from '../overlay'
import type { ProposedChange, TurnEvent } from '../../lib/assistantTypes'
import type { AssistantMessage, AssistantThread } from '../../lib/db'
import { useOnline } from '../../lib/online'
import { Markdown } from '../Markdown'
import { trapTab } from '../overlay/stack'
import { isolate, useOverlay } from '../overlay/useOverlay'
import { AssistantConsent } from './AssistantConsent'
import { ChangeSetReview, type ReviewResult } from './ChangeSetReview'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { requestSettingsFocus } from '../settingsIndex'
import { navigate } from '../router'
import { t, msg } from '../../lib/i18n'

export const ENCRYPTED_MESSAGE = msg('The assistant can’t read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted.')

/** What an encrypted account can do to use the assistant: a link to the encryption settings. */
export function EncryptionOffHint() {
  return (
    <span data-assistant-encryption-hint>
      {t.rich('To use the assistant, you can turn encryption off in <a>Settings → Account → Encryption</a>; your tasks are then stored on the server without end-to-end encryption.', { a: (chunks) => <a className="underline" href="/settings/account" onClick={(e) => { e.preventDefault(); requestSettingsFocus('encryption'); navigate({ view: 'settings', section: 'account' }) }}>{chunks}</a> })}
    </span>
  )
}
export const OFFLINE_MESSAGE = msg('The assistant needs a connection.')

// ------------------------------------------------------------------ frame

/**
 * The side sheet (in-app-assistant D9) on the overlay module's behaviour:
 * Escape through the overlay stack, focus moved in and back to the opener,
 * Tab trapped, the page behind locked. A right-hand sheet from 640 px up and a
 * full-screen sheet below, above the on-screen keyboard.
 */
export function AssistantSheet({ title, onClose, onEscape, children, footer, headerExtra }: {
  title: ReactNode
  onClose: () => void
  /** Escape: discards a focused proposal before it closes the panel. */
  onEscape?: () => void
  children: ReactNode
  footer?: ReactNode
  headerExtra?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useOverlay({ panel, onClose: onEscape ?? onClose })
  const tree = (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-end bg-scrim" data-overlay-root {...isolate}
      style={{ bottom: 'var(--vv-bottom, 0px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (panel.current) trapTab(e, panel.current); e.stopPropagation() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-overlay="dialog" data-assistant-panel
        className="flex h-full w-full flex-col bg-surface shadow-3 outline-none sm:max-w-md sm:border-l sm:border-default">
        <div className="flex items-center gap-1 border-b border-default pl-4 pr-1 pt-[env(safe-area-inset-top)]">
          <h2 id={titleId} className="min-w-0 flex-1 truncate py-2 text-body font-semibold">{title}</h2>
          {headerExtra}
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target my-1 px-2 text-h3 leading-none" onClick={onClose} aria-label={t('Close')} data-overlay-close><Icon name="x" size="md" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" data-assistant-scroll>{children}</div>
        {footer && <div className="border-t border-default px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">{footer}</div>}
      </div>
    </div>
  )
  return typeof document === 'undefined' ? tree : createPortal(tree, document.body)
}

// ------------------------------------------------------------------ view

export interface PanelViewProps {
  status: AssistantStatus | null
  connected: boolean
  messages: AssistantMessage[]
  streaming: { text: string; status: string[] } | null
  /** Polite live regions: completed sentences of the answer, and status lines. */
  announce: string
  statusAnnounce: string
  review: Review | null
  result: ReviewResult | null
  reviewBusy: boolean
  error: string | null
  draft: string
  consentBusy: boolean
  consentError: string | null
  threads: AssistantThread[] | null
  reviewRef?: React.RefObject<HTMLDivElement | null>
  onToggle: (i: number, c: boolean) => void
  onApply: () => void
  onDiscard: () => void
  onUndo: () => void
  onDraft: (s: string) => void
  onSend: () => void
  onStop: () => void
  onAccept: (ownKey?: string) => void
  onPickThread: (id: string) => void
}

/** The panel's content without state (rendered to markup in tests). */
export function AssistantPanelBody(p: PanelViewProps) {
  const dt = useDateTimeFormat()
  const s = p.status
  if (!s) return <Skeleton shape="line" count={3} label={t('Loading the assistant')} />
  if (s.reason === 'encryption_enabled') {
    return (
      <div className="space-y-2 text-body" data-assistant-encrypted>
        <p className="font-medium">{t(ENCRYPTED_MESSAGE)}</p>
        <p className="text-muted">{t('Your account uses end-to-end encryption, so the server holds no key to your tasks and cannot pass them to a model. The rest of the app works as usual.')}</p>
        <p className="text-muted"><EncryptionOffHint /></p>
      </div>
    )
  }
  if (s.reason === 'demo') return <p className="text-body">{t('The assistant is not available on the demo instance.')}</p>
  if (!s.enabled) return <p className="text-body">{t('The server owner has not turned the assistant on.')}</p>
  return (
    <div className="space-y-4">
      {p.threads && (
        <nav aria-label={t('Earlier conversations')} className="space-y-1">
          <h3 className="text-body font-semibold">{t('Earlier conversations on this device')}</h3>
          {p.threads.length === 0 ? <p className="text-body text-muted">{t('None yet.')}</p> : (
            <ul className="space-y-1">
              {p.threads.map((item) => (
                <li key={item.id}>
                  <button type="button" className="ui-btn ui-btn--ghost ui-btn--md w-full justify-start text-left" onClick={() => p.onPickThread(item.id)}>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="text-meta text-faint">{dt.formatInstant(item.updated_at, 'date')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      )}
      {!s.consented ? (
        <AssistantConsent status={s} connected={p.connected} busy={p.consentBusy} error={p.consentError} onAccept={p.onAccept} />
      ) : (
        <>
          {p.messages.length === 0 && !p.streaming && (
            <div className="space-y-1 text-body text-muted" data-assistant-empty>
              <p>{t('Ask about your tasks or ask for changes. For example:')}</p>
              <ul className="list-disc pl-5">
                <li>{t('What is due today?')}</li>
                <li>{t('Move everything overdue to Friday.')}</li>
                <li>{t('Break “Plan the team offsite” into steps.')}</li>
              </ul>
              <p>{t('Changes are proposed for you to review; nothing changes until you apply them.')}</p>
            </div>
          )}
          <ol className="space-y-3" aria-label={t('Conversation')}>
            {p.messages.map((m, i) => <MessageItem key={i} m={m} />)}
            {p.streaming && (
              <li className="text-body" aria-busy="true">
                {p.streaming.status.length > 0 && <p className="text-meta text-muted">{p.streaming.status[p.streaming.status.length - 1]}</p>}
                {p.streaming.text ? <Markdown source={p.streaming.text} /> : <p className="text-muted">{t('Thinking…')}</p>}
              </li>
            )}
          </ol>
          <ChangeSetReview review={p.review} result={p.result} busy={p.reviewBusy} onToggle={p.onToggle} onApply={p.onApply} onDiscard={p.onDiscard} onUndo={p.onUndo} regionRef={p.reviewRef} />
        </>
      )}
      {p.error && <p role="alert" className="text-body text-danger">{p.error}</p>}
      <div className="sr-only" aria-live="polite" data-assistant-live>{p.announce}</div>
      <div className="sr-only" aria-live="polite" data-assistant-status>{p.statusAnnounce}</div>
    </div>
  )
}

function MessageItem({ m }: { m: AssistantMessage }) {
  if (m.role === 'user') {
    return (
      <li className="ml-8 rounded-control bg-sunken dark:bg-raised px-3 py-2 text-body">
        {(m.skill || m.pastedLines) && (
          <p className="mb-1 text-meta text-muted">{[m.skill && t('Skill: {name}', { name: m.skill }), m.pastedLines && t('{n, plural, one {pasted text, # line} other {pasted text, # lines}}', { n: m.pastedLines })].filter(Boolean).join(' · ')}</p>
        )}
        <span className="sr-only">{t('You:')}</span><span className="whitespace-pre-wrap user-text">{m.text}</span>
      </li>
    )
  }
  return (
    <li className="space-y-1 text-body">
      <span className="sr-only">{t('Assistant:')}{' '}</span>
      {m.text && <Markdown source={m.text} />}
      {m.stop === 'max_tokens' && <p className="text-meta font-medium text-on-warning-soft">{t('Cut off: the answer reached its length limit.')}</p>}
      {m.error && <p className="text-danger">{m.error}</p>}
      {m.note && <p className="text-meta text-muted">{m.note}</p>}
      {m.usage && <p className="text-meta text-faint">{usageLine(m.usage)}</p>}
    </li>
  )
}

export function Composer({ draft, onDraft, onSend, onStop, streaming, connected, disabled, skills = [], skill = null, onSkill, pasted = null, onPasted }: {
  draft: string; onDraft: (s: string) => void; onSend: () => void; onStop: () => void; streaming: boolean; connected: boolean; disabled: boolean
  /** Skills menu (assistant-skills): the list, the chosen one and pasted material. */
  skills?: AssistantSkill[]; skill?: AssistantSkill | null; onSkill?: (s: AssistantSkill | null) => void
  pasted?: string | null; onPasted?: (s: string | null) => void
}) {
  const ready = !!draft.trim() || !!skill || !!pasted
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!streaming && ready) onSend()
    }
  }
  const off = !connected || disabled
  const lines = pasted ? pasted.split(/\r?\n/).length : 0
  return (
    <div className="space-y-1">
      {(skill || pasted) && (
        <div className="space-y-1" data-assistant-chosen>
          {skill && (
            <div className="flex items-start gap-2 rounded-control bg-sunken px-2 py-1 text-meta dark:bg-raised" role="status">
              <span className="min-w-0 flex-1">{t.rich('<span>Skill: {name}.</span> {description} <span2>For example: “{example}”</span2>', { name: skill.name, description: skill.description, example: skill.example, span: (chunks) => <span className="font-medium">{chunks}</span>, span2: (chunks) => <span className="text-muted">{chunks}</span> })}</span>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1" aria-label={t('Remove the skill {name}', { name: skill.name })} onClick={() => onSkill?.(null)}><Icon name="x" size="xs" /></button>
            </div>
          )}
          {pasted && (
            <div className="flex items-center gap-2 rounded-control bg-sunken px-2 py-1 text-meta dark:bg-raised" data-assistant-pasted>
              <span className="min-w-0 flex-1">{t('Pasted text, {lines} line', { lines })}{lines === 1 ? '' : 's'}{t(': used as material, not as instructions.')}</span>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1" aria-label={t('Remove pasted text')} onClick={() => onPasted?.(null)}><Icon name="x" size="xs" /></button>
            </div>
          )}
        </div>
      )}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!streaming && ready) onSend() }}>
        {skills.length > 0 && onSkill && (
          <Menu label={t('Skills')} kind="menu" align="start" width="sm:w-80" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2" trigger={<Icon name="list" />}>
            <MenuGroup label={t('Skills')}>
              {skills.map((sk) => <MenuItem key={sk.id} label={sk.name} description={sk.description} checked={skill?.id === sk.id} onSelect={() => onSkill(sk)} />)}
            </MenuGroup>
          </Menu>
        )}
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('Message to the assistant')}</span>
          <textarea className="ui-input max-h-40 min-h-11 resize-none" rows={1} value={draft} disabled={off} data-autofocus data-assistant-composer
            placeholder={!connected ? t(OFFLINE_MESSAGE) : skill ? t('Add details, or send as it is…') : t('Ask about your tasks…')} onChange={(e) => onDraft(e.target.value)} onKeyDown={onKeyDown}
            onPaste={(e) => {
              const raw = e.clipboardData.getData('text/plain')
              if (onPasted && isMaterial(raw)) {
                e.preventDefault()
                onPasted(pasted ? `${pasted}\n\n${raw}` : raw)
              }
            }} />
        </label>
        {streaming
          ? <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={onStop}>{t('Stop')}</button>
          : <button type="submit" className="ui-btn ui-btn--primary ui-btn--md" disabled={off || !ready}>{t('Send')}</button>}
      </form>
    </div>
  )
}

// ------------------------------------------------------------------ state

/** Announces streamed text at sentence boundaries (debounced), not per token. */
function useSentenceAnnouncer() {
  const [announce, setAnnounce] = useState('')
  const pending = useRef('')
  const ready = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const push = useCallback((delta: string) => {
    pending.current += delta
    const [done, rest] = takeSentences(pending.current)
    if (!done) return
    pending.current = rest
    ready.current = ready.current ? `${ready.current} ${done}` : done
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setAnnounce(ready.current)
      ready.current = ''
    }, 400)
  }, [])
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const rest = [ready.current, pending.current.trim()].filter(Boolean).join(' ')
    pending.current = ''
    ready.current = ''
    if (rest) setAnnounce(rest)
  }, [])
  const reset = useCallback(() => { pending.current = ''; ready.current = ''; clearTimeout(timer.current) }, [])
  return { announce, push, flush, reset, setAnnounce }
}

export interface AssistantPanelProps {
  onClose: () => void
  /** Light context for the turn: the current view and selected tasks. */
  context: () => { view?: string; selected?: string[] }
  onApplied: (r: { text: string; undoId: string }) => void
}

export function AssistantPanel({ onClose, context, onApplied }: AssistantPanelProps) {
  const connected = useOnline()
  // The cached status renders at once (offline too); a fresh one follows.
  const [status, setStatus] = useState<AssistantStatus | null>(assistantStatus)
  const [thread, setThread] = useState<AssistantThread | null>(null)
  const threadState = thread
  const [threads, setThreads] = useState<AssistantThread[] | null>(null)
  const [draft, setDraft] = useState('')
  const skills = useAssistantSkills()
  const [skill, setSkill] = useState<AssistantSkill | null>(null)
  const [pickedSkillId, setPickedSkillId] = useState<string | null>(null)
  const [pasted, setPasted] = useState<string | null>(null)
  const selectedFor = useRef<string[] | null>(null)
  const [autoSend, setAutoSend] = useState(false)
  const [streaming, setStreaming] = useState<{ text: string; status: string[] } | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const [statusAnnounce, setStatusAnnounce] = useState('')
  const live = useSentenceAnnouncer()
  const abort = useRef<AbortController | null>(null)
  const reviewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void refreshAssistantStatus().then(setStatus)
    void listThreads().then((all) => setThread((cur) => cur ?? all[0] ?? newThread('')))
    return () => abort.current?.abort()
  }, [])

  const persist = useCallback(async (item: AssistantThread) => {
    setThread(item)
    await saveThread(item).catch(() => {})
  }, [])

  const accept = async (ownKey?: string) => {
    if (!status) return
    setConsentBusy(true)
    setConsentError(null)
    try {
      const next = await api.setMyAssistant({ consent: true, provider: status.provider, ...(ownKey ? { own_key: ownKey } : {}) })
      setAssistantStatus(next)
      setStatus(next)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'provider_changed') {
        setStatus(await refreshAssistantStatus())
        setConsentError(t('The provider changed while you were reading. Read the updated text and accept again.'))
      } else setConsentError(describeTurnError(err))
    } finally {
      setConsentBusy(false)
    }
  }

  const proposal = useRef<ProposedChange[] | null>(null)

  const send = async () => {
    const chosen = skill
    // A skill or pasted material can be sent without typed text.
    const question = draft.trim() || (chosen ? chosen.example : pasted ? t('Use the pasted text.') : '')
    if (!question || streaming) return
    const material = pasted
    const selection = selectedFor.current
    // The latest thread may still be loading from the device: start a new one then.
    const thread = threadState ?? newThread(status?.provider ?? '')
    setDraft('')
    setSkill(null)
    setPasted(null)
    selectedFor.current = null
    setError(null)
    setReview(null)
    setResult(null)
    live.reset()
    proposal.current = null
    const userMsg: AssistantMessage = { role: 'user', text: question, at: Date.now(),
      ...(chosen ? { skill: chosen.name } : {}), ...(material ? { pastedLines: material.split(/\r?\n/).length } : {}) }
    const history = thread.messages
    let entry: AssistantThread = { ...thread, messages: [...history, userMsg], updated_at: Date.now(), provider: status?.provider ?? '',
      title: thread.messages.length ? thread.title : question.slice(0, 60) }
    await persist(entry)
    const ctl = new AbortController()
    abort.current = ctl
    let text = ''
    const statusLines: string[] = []
    let answer: AssistantMessage = { role: 'assistant', text: '', at: Date.now() }
    setStreaming({ text: '', status: [] })
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    try {
      const ctx = context()
      const req = { messages: turnMessages(history, question, material ?? undefined), timezone: zone, ...ctx,
        ...(selection ? { selected: selection } : {}),
        ...(chosen ? { skill: chosen.id, workday: await workday() } : {}) }
      await streamTurn(req, (ev: TurnEvent) => {
        switch (ev.type) {
          case 'text':
            text += ev.text
            live.push(ev.text)
            setStreaming({ text, status: statusLines })
            break
          case 'status':
            statusLines.push(ev.text)
            setStatusAnnounce(ev.text)
            setStreaming({ text, status: [...statusLines] })
            break
          case 'usage':
            answer.usage = { input: ev.input, output: ev.output, month_total: ev.month_total, cap: ev.cap, own_key: ev.own_key }
            break
          case 'changeset':
            proposal.current = ev.items
            break
          case 'error':
            answer.error = describeStreamError(ev.code, ev.message)
            break
          case 'done':
            answer.stop = ev.stop_reason
            if (ev.stop_reason === 'refusal') text = ''
            if (ev.message && ev.stop_reason !== 'max_tokens') answer.error = ev.message
            break
        }
      }, ctl.signal)
    } catch (err) {
      if (ctl.signal.aborted) answer.note = t('Stopped.')
      else {
        answer.error = describeTurnError(err)
        if (err instanceof ApiError && (err.code === 'consent_required' || err.code === 'encryption_enabled')) setStatus(await refreshAssistantStatus())
      }
    }
    abort.current = null
    // A refusal shows the fixed message and no partial text (design D5).
    answer = { ...answer, text: answer.stop === 'refusal' ? '' : text }
    live.flush()
    if (answer.error) live.setAnnounce(answer.error)
    setStreaming(null)
    entry = { ...entry, messages: [...entry.messages, answer], updated_at: Date.now(),
      usage: { input: entry.usage.input + (answer.usage?.input ?? 0), output: entry.usage.output + (answer.usage?.output ?? 0) } }
    await persist(entry)
    const items = answer.stop === 'end_turn' ? (proposal.current as ProposedChange[] | null) : null
    if (items && items.length) {
      const r = await reviewChangeSet(items)
      if (r.items.length && (await getAutoApply()) && r.items.every((i) => i.state === 'ok') && autoApplicable(r.items.map((i) => i.change))) {
        const undo = await applyChanges(r.items.map((i) => i.change))
        const res: ReviewResult = { applied: r.items.length, total: r.items.length, undoId: undo?.id ?? null, auto: true }
        setResult(res)
        await note(entry, t('{n, plural, one {# change applied automatically.} other {# changes applied automatically.}}', { n: res.applied }))
        if (undo) onApplied({ text: t('{n, plural, one {Assistant: # change applied.} other {Assistant: # changes applied.}}', { n: res.applied }), undoId: undo.id })
        setStatusAnnounce(t('{n, plural, one {# change applied automatically. Undo is available.} other {# changes applied automatically. Undo is available.}}', { n: res.applied }))
      } else {
        setReview(r)
        setStatusAnnounce(t('{n, plural, one {# proposed change to review below.} other {# proposed changes to review below.}}', { n: r.items.length }))
      }
    }
  }

  const note = async (x1: AssistantThread, text: string) => {
    const msgs = [...x1.messages]
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, note: text }
    await persist({ ...x1, messages: msgs, updated_at: Date.now() })
  }

  const apply = async () => {
    if (!review || !thread || reviewBusy) return
    setReviewBusy(true)
    try {
      // Another device may have synced since the proposal arrived.
      const fresh = await refreshReview(review)
      const newlyStale = fresh.items.some((i) => i.state === 'stale' && review.items.find((o) => o.change.entityId === i.change.entityId)?.state === 'ok')
      if (newlyStale) {
        setReview(fresh)
        setStatusAnnounce(t('Some items changed since they were proposed and were unchecked. Review and apply again.'))
        return
      }
      const chosen = fresh.items.filter((i) => i.checked).map((i) => i.change)
      const undo = await applyChanges(chosen)
      const res: ReviewResult = { applied: chosen.length, total: fresh.items.length, undoId: undo?.id ?? null }
      setReview(null)
      setResult(res)
      const summary = res.applied === res.total ? t('{n, plural, one {# change applied.} other {# changes applied.}}', { n: res.applied }) : t('{n} of {total} changes applied.', { n: res.applied, total: res.total })
      await note(thread, summary)
      setStatusAnnounce(`${summary} ${t('Undo is available.')}`)
      if (undo) onApplied({ text: t('Assistant: {summary}', { summary }), undoId: undo.id })
    } finally {
      setReviewBusy(false)
    }
  }

  const discard = async () => {
    if (!review || !thread) return
    setReview(null)
    setResult({ applied: 0, total: review.items.length, undoId: null, discarded: true })
    await note(thread, t('Proposal discarded.'))
    setStatusAnnounce(t('Proposal discarded.'))
  }

  const undo = async () => {
    if (!result?.undoId || !thread) return
    setReviewBusy(true)
    try {
      const u = await undoChanges(result.undoId)
      setResult({ ...result, undone: u })
      await note(thread, u.skipped.length ? t('Undone, except: {items}.', { items: u.skipped.join(', ') }) : t('Undone.'))
      setStatusAnnounce(t('Undone: {n} restored.', { n: u.restored }))
    } finally {
      setReviewBusy(false)
    }
  }

  const onEscape = () => {
    if (review && reviewRef.current?.contains(document.activeElement)) void discard()
    else onClose()
  }

  const startNew = () => {
    abort.current?.abort()
    setThread(newThread(status?.provider ?? ''))
    setReview(null)
    setResult(null)
    setThreads(null)
    setError(null)
  }

  const toggleThreads = async () => setThreads(threads ? null : await listThreads())

  const clearAll = async () => {
    await clearThreads()
    startNew()
  }

  // Opened from the composer, the Ask screen or a task's menu (assistant-skills D4).
  const pendingPrefill = useAssistantPrefill()
  const applyPrefill = useCallback((p: AssistantPrefill | null) => {
    if (!p) return
    if (p.text !== undefined) setDraft(p.text)
    setPickedSkillId(p.skill ?? null)
    setPasted(p.pasted ?? null)
    selectedFor.current = p.selected ?? null
    setAutoSend(!!p.send)
  }, [])
  useEffect(() => { applyPrefill(takeAssistantPrefill()) }, [applyPrefill, pendingPrefill])
  useEffect(() => {
    if (!pickedSkillId) { setSkill(null); return }
    const found = skills.find((x) => x.id === pickedSkillId)
    if (found) setSkill(found)
  }, [pickedSkillId, skills])

  const ready = !!status && status.available && status.consented
  useEffect(() => {
    if (!autoSend || !ready || !connected || !threadState || streaming) return
    if (pickedSkillId && !skill) return // wait for the skill list
    setAutoSend(false)
    void send()
    // send reads the latest state; this runs when a prefilled send can go.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, ready, connected, threadState, skill, pickedSkillId])
  // Focus the composer once it can take input (after consent or a slow status),
  // unless the person already moved focus to something else in the panel.
  useEffect(() => {
    if (!ready || !connected) return
    const el = document.querySelector<HTMLTextAreaElement>('[data-assistant-composer]')
    const active = document.activeElement
    if (el && (!active || active === document.body || active.hasAttribute('data-assistant-panel') || active.hasAttribute('data-assistant-accept'))) el.focus({ preventScroll: true })
  }, [ready, connected])
  const headerExtra = status?.enabled && status.reason !== 'encryption_enabled' ? (
    <>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-meta" onClick={() => void toggleThreads()} aria-expanded={!!threads}>{t('History')}</button>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-meta" onClick={startNew}>{t('New')}</button>
    </>
  ) : null
  return (
    <AssistantSheet title={t('Assistant')} onClose={onClose} onEscape={onEscape} headerExtra={headerExtra}
      footer={status?.reason === 'encryption_enabled' || !status?.enabled ? undefined : (
        <div className="space-y-1">
          <Composer draft={draft} onDraft={setDraft} onSend={() => void send()} onStop={() => abort.current?.abort()} streaming={!!streaming} connected={connected} disabled={!ready}
            skills={skills} skill={skill} onSkill={(sk) => { setPickedSkillId(sk?.id ?? null); setSkill(sk) }} pasted={pasted} onPasted={setPasted} />
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-meta text-faint">
            <span>{!connected ? t(OFFLINE_MESSAGE) : status ? `${status.provider === 'compatible' ? t('Model server') : status.provider_label}${status.model ? ` · ${status.model}` : ''}` : ''}</span>
            {threads && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-meta" onClick={() => void clearAll()}>{t('Clear conversations')}</button>}
          </div>
        </div>
      )}>
      <AssistantPanelBody status={status} connected={connected} messages={thread?.messages ?? []} streaming={streaming} announce={live.announce}
        statusAnnounce={statusAnnounce} review={review} result={result} reviewBusy={reviewBusy} error={error} draft={draft}
        consentBusy={consentBusy} consentError={consentError} threads={threads} reviewRef={reviewRef}
        onToggle={(i, c) => setReview((r) => r && { ...r, items: r.items.map((it, j) => (j === i ? { ...it, checked: c } : it)) })}
        onApply={() => void apply()} onDiscard={() => void discard()} onUndo={() => void undo()} onDraft={setDraft} onSend={() => void send()}
        onStop={() => abort.current?.abort()} onAccept={(k) => void accept(k)}
        onPickThread={(id) => { void listThreads().then((all) => { const tVar = all.find((x) => x.id === id); if (tVar) { setThread(tVar); setThreads(null); setReview(null); setResult(null) } }) }} />
    </AssistantSheet>
  )
}
