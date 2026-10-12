import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '../../lib/api'
import {
  applyChanges, autoApplicable, clearThreads, describeStreamError, describeTurnError, getAutoApply, listThreads, newThread,
  refreshReview, reviewChangeSet, saveThread, streamTurn, takeSentences, turnMessages, undoChanges, usageLine, type Review,
} from '../../lib/assistant'
import { assistantStatus, refreshAssistantStatus, setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import type { ProposedChange, TurnEvent } from '../../lib/assistantTypes'
import type { AssistantMessage, AssistantThread } from '../../lib/db'
import { useOnline } from '../../lib/online'
import { Markdown } from '../Markdown'
import { trapTab } from '../overlay/stack'
import { isolate, useOverlay } from '../overlay/useOverlay'
import { AssistantConsent } from './AssistantConsent'
import { ChangeSetReview, type ReviewResult } from './ChangeSetReview'

export const ENCRYPTED_MESSAGE = 'The assistant can’t read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted.'
export const OFFLINE_MESSAGE = 'The assistant needs a connection.'

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
    <div className="fixed inset-x-0 top-0 z-50 flex justify-end bg-black/40" data-overlay-root {...isolate}
      style={{ bottom: 'var(--vv-bottom, 0px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (panel.current) trapTab(e, panel.current); e.stopPropagation() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-overlay="dialog" data-assistant-panel
        className="flex h-full w-full flex-col bg-white shadow-xl outline-none dark:bg-slate-900 sm:max-w-md sm:border-l sm:border-slate-200 sm:dark:border-slate-800">
        <div className="flex items-center gap-1 border-b border-slate-100 pl-4 pr-1 pt-[env(safe-area-inset-top)] dark:border-slate-800">
          <h2 id={titleId} className="min-w-0 flex-1 truncate py-2 text-base font-semibold">{title}</h2>
          {headerExtra}
          <button type="button" className="btn-ghost touch-target my-1 px-2 text-lg leading-none" onClick={onClose} aria-label="Close" data-overlay-close>×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" data-assistant-scroll>{children}</div>
        {footer && <div className="border-t border-slate-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 dark:border-slate-800">{footer}</div>}
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
  const s = p.status
  if (!s) return <p className="text-sm text-muted" role="status">Loading…</p>
  if (s.reason === 'encryption_enabled') {
    return (
      <div className="space-y-2 text-sm" data-assistant-encrypted>
        <p className="font-medium">{ENCRYPTED_MESSAGE}</p>
        <p className="text-muted">Your account uses end-to-end encryption, so the server holds no key to your tasks and cannot pass them to a model. The rest of the app works as usual.</p>
      </div>
    )
  }
  if (s.reason === 'demo') return <p className="text-sm">The assistant is not available on the demo instance.</p>
  if (!s.enabled) return <p className="text-sm">The server owner has not turned the assistant on.</p>
  return (
    <div className="space-y-4">
      {p.threads && (
        <nav aria-label="Earlier conversations" className="space-y-1">
          <h3 className="text-sm font-semibold">Earlier conversations on this device</h3>
          {p.threads.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
            <ul className="space-y-1">
              {p.threads.map((t) => (
                <li key={t.id}>
                  <button type="button" className="btn-ghost w-full justify-start text-left" onClick={() => p.onPickThread(t.id)}>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-faint">{new Date(t.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
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
            <div className="space-y-1 text-sm text-muted" data-assistant-empty>
              <p>Ask about your tasks or ask for changes. For example:</p>
              <ul className="list-disc pl-5">
                <li>What is due today?</li>
                <li>Move everything overdue to Friday.</li>
                <li>Break “Plan the team offsite” into steps.</li>
              </ul>
              <p>Changes are proposed for you to review; nothing changes until you apply them.</p>
            </div>
          )}
          <ol className="space-y-3" aria-label="Conversation">
            {p.messages.map((m, i) => <MessageItem key={i} m={m} />)}
            {p.streaming && (
              <li className="text-sm" aria-busy="true">
                {p.streaming.status.length > 0 && <p className="text-xs text-muted">{p.streaming.status[p.streaming.status.length - 1]}</p>}
                {p.streaming.text ? <Markdown source={p.streaming.text} /> : <p className="text-muted">Thinking…</p>}
              </li>
            )}
          </ol>
          <ChangeSetReview review={p.review} result={p.result} busy={p.reviewBusy} onToggle={p.onToggle} onApply={p.onApply} onDiscard={p.onDiscard} onUndo={p.onUndo} regionRef={p.reviewRef} />
        </>
      )}
      {p.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{p.error}</p>}
      <div className="sr-only" aria-live="polite" data-assistant-live>{p.announce}</div>
      <div className="sr-only" aria-live="polite" data-assistant-status>{p.statusAnnounce}</div>
    </div>
  )
}

function MessageItem({ m }: { m: AssistantMessage }) {
  if (m.role === 'user') {
    return (
      <li className="ml-8 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
        <span className="sr-only">You: </span><span className="whitespace-pre-wrap user-text">{m.text}</span>
      </li>
    )
  }
  return (
    <li className="space-y-1 text-sm">
      <span className="sr-only">Assistant: </span>
      {m.text && <Markdown source={m.text} />}
      {m.stop === 'max_tokens' && <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Cut off: the answer reached its length limit.</p>}
      {m.error && <p className="text-red-700 dark:text-red-300">{m.error}</p>}
      {m.note && <p className="text-xs text-muted">{m.note}</p>}
      {m.usage && <p className="text-xs text-faint">{usageLine(m.usage)}</p>}
    </li>
  )
}

export function Composer({ draft, onDraft, onSend, onStop, streaming, connected, disabled }: {
  draft: string; onDraft: (s: string) => void; onSend: () => void; onStop: () => void; streaming: boolean; connected: boolean; disabled: boolean
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!streaming && draft.trim()) onSend()
    }
  }
  const off = !connected || disabled
  return (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!streaming && draft.trim()) onSend() }}>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Message to the assistant</span>
        <textarea className="input max-h-40 min-h-11 resize-none" rows={1} value={draft} disabled={off} data-autofocus data-assistant-composer
          placeholder={!connected ? OFFLINE_MESSAGE : 'Ask about your tasks…'} onChange={(e) => onDraft(e.target.value)} onKeyDown={onKeyDown} />
      </label>
      {streaming
        ? <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={onStop}>Stop</button>
        : <button type="submit" className="btn-primary" disabled={off || !draft.trim()}>Send</button>}
    </form>
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

  const persist = useCallback(async (t: AssistantThread) => {
    setThread(t)
    await saveThread(t).catch(() => {})
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
        setConsentError('The provider changed while you were reading. Read the updated text and accept again.')
      } else setConsentError(describeTurnError(err))
    } finally {
      setConsentBusy(false)
    }
  }

  const proposal = useRef<ProposedChange[] | null>(null)

  const send = async () => {
    const question = draft.trim()
    if (!question || streaming) return
    // The latest thread may still be loading from the device: start a new one then.
    const thread = threadState ?? newThread(status?.provider ?? '')
    setDraft('')
    setError(null)
    setReview(null)
    setResult(null)
    live.reset()
    proposal.current = null
    const userMsg: AssistantMessage = { role: 'user', text: question, at: Date.now() }
    const history = thread.messages
    let t: AssistantThread = { ...thread, messages: [...history, userMsg], updated_at: Date.now(), provider: status?.provider ?? '',
      title: thread.messages.length ? thread.title : question.slice(0, 60) }
    await persist(t)
    const ctl = new AbortController()
    abort.current = ctl
    let text = ''
    const statusLines: string[] = []
    let answer: AssistantMessage = { role: 'assistant', text: '', at: Date.now() }
    setStreaming({ text: '', status: [] })
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    try {
      await streamTurn({ messages: turnMessages(history, question), timezone: zone, ...context() }, (ev: TurnEvent) => {
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
            answer.usage = { input: ev.input, output: ev.output, month_total: ev.month_total, cap: ev.cap }
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
      if (ctl.signal.aborted) answer.note = 'Stopped.'
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
    t = { ...t, messages: [...t.messages, answer], updated_at: Date.now(),
      usage: { input: t.usage.input + (answer.usage?.input ?? 0), output: t.usage.output + (answer.usage?.output ?? 0) } }
    await persist(t)
    const items = answer.stop === 'end_turn' ? (proposal.current as ProposedChange[] | null) : null
    if (items && items.length) {
      const r = await reviewChangeSet(items)
      if (r.items.length && (await getAutoApply()) && r.items.every((i) => i.state === 'ok') && autoApplicable(r.items.map((i) => i.change))) {
        const undo = await applyChanges(r.items.map((i) => i.change))
        const res: ReviewResult = { applied: r.items.length, total: r.items.length, undoId: undo?.id ?? null, auto: true }
        setResult(res)
        await note(t, `${res.applied} change${res.applied === 1 ? '' : 's'} applied automatically.`)
        if (undo) onApplied({ text: `Assistant: ${res.applied} change${res.applied === 1 ? '' : 's'} applied.`, undoId: undo.id })
        setStatusAnnounce(`${res.applied} changes applied automatically. Undo is available.`)
      } else {
        setReview(r)
        setStatusAnnounce(`${r.items.length} proposed change${r.items.length === 1 ? '' : 's'} to review below.`)
      }
    }
  }

  const note = async (t: AssistantThread, text: string) => {
    const msgs = [...t.messages]
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, note: text }
    await persist({ ...t, messages: msgs, updated_at: Date.now() })
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
        setStatusAnnounce('Some items changed since they were proposed and were unchecked. Review and apply again.')
        return
      }
      const chosen = fresh.items.filter((i) => i.checked).map((i) => i.change)
      const undo = await applyChanges(chosen)
      const res: ReviewResult = { applied: chosen.length, total: fresh.items.length, undoId: undo?.id ?? null }
      setReview(null)
      setResult(res)
      const summary = res.applied === res.total ? `${res.applied} change${res.applied === 1 ? '' : 's'} applied.` : `${res.applied} of ${res.total} changes applied.`
      await note(thread, summary)
      setStatusAnnounce(summary + ' Undo is available.')
      if (undo) onApplied({ text: `Assistant: ${summary}`, undoId: undo.id })
    } finally {
      setReviewBusy(false)
    }
  }

  const discard = async () => {
    if (!review || !thread) return
    setReview(null)
    setResult({ applied: 0, total: review.items.length, undoId: null, discarded: true })
    await note(thread, 'Proposal discarded.')
    setStatusAnnounce('Proposal discarded.')
  }

  const undo = async () => {
    if (!result?.undoId || !thread) return
    setReviewBusy(true)
    try {
      const u = await undoChanges(result.undoId)
      setResult({ ...result, undone: u })
      await note(thread, u.skipped.length ? `Undone, except: ${u.skipped.join(', ')}.` : 'Undone.')
      setStatusAnnounce(`Undone: ${u.restored} restored.`)
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

  const ready = !!status && status.available && status.consented
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
      <button type="button" className="btn-ghost touch-target px-2 text-xs" onClick={() => void toggleThreads()} aria-expanded={!!threads}>History</button>
      <button type="button" className="btn-ghost touch-target px-2 text-xs" onClick={startNew}>New</button>
    </>
  ) : null
  return (
    <AssistantSheet title="Assistant" onClose={onClose} onEscape={onEscape} headerExtra={headerExtra}
      footer={status?.reason === 'encryption_enabled' || !status?.enabled ? undefined : (
        <div className="space-y-1">
          <Composer draft={draft} onDraft={setDraft} onSend={() => void send()} onStop={() => abort.current?.abort()} streaming={!!streaming} connected={connected} disabled={!ready} />
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-faint">
            <span>{!connected ? OFFLINE_MESSAGE : status ? `${status.provider === 'compatible' ? 'Model server' : status.provider_label}${status.model ? ` · ${status.model}` : ''}` : ''}</span>
            {threads && <button type="button" className="btn-ghost touch-target px-2 text-xs" onClick={() => void clearAll()}>Clear conversations</button>}
          </div>
        </div>
      )}>
      <AssistantPanelBody status={status} connected={connected} messages={thread?.messages ?? []} streaming={streaming} announce={live.announce}
        statusAnnounce={statusAnnounce} review={review} result={result} reviewBusy={reviewBusy} error={error} draft={draft}
        consentBusy={consentBusy} consentError={consentError} threads={threads} reviewRef={reviewRef}
        onToggle={(i, c) => setReview((r) => r && { ...r, items: r.items.map((it, j) => (j === i ? { ...it, checked: c } : it)) })}
        onApply={() => void apply()} onDiscard={() => void discard()} onUndo={() => void undo()} onDraft={setDraft} onSend={() => void send()}
        onStop={() => abort.current?.abort()} onAccept={(k) => void accept(k)}
        onPickThread={(id) => { void listThreads().then((all) => { const t = all.find((x) => x.id === id); if (t) { setThread(t); setThreads(null); setReview(null); setResult(null) } }) }} />
    </AssistantSheet>
  )
}
