// The assistant panel's state (in-app-assistant, assistant-skills), split out of
// AssistantPanel by web-component-structure: the thread on this device, consent,
// the composer's draft, skill and pasted material, the streamed turn and the review
// of proposed changes. The panel component only renders what this returns.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import {
  applyChanges, autoApplicable, clearThreads, describeStreamError, describeTurnError, getAutoApply, listThreads, newThread,
  refreshReview, reviewChangeSet, saveThread, streamTurn, turnMessages, undoChanges, type AssistantMessage, type AssistantThread, type Review, type TurnRequest,
} from '../../lib/assistant'
import { imagesUnsupportedMessage, isImagesUnsupported, releasePhoto, wireImages, type PreparedPhoto } from '../../lib/assistantImages'
import { assistantStatus, refreshAssistantStatus, setAssistantStatus, setAssistantTurnBusy, takeAssistantPrefill, useAssistantPrefill, type AssistantPrefill, type AssistantStatus } from '../../lib/assistantStatus'
import { useAssistantSkills, workday, type AssistantSkill } from '../../lib/assistantSkills'
import { blockLabel, blockOf, type AssistantBlock } from '../../lib/assistantBlocks'
import type { ProposedChange, TurnEvent } from '../../lib/assistantTypes'
import { t } from '../../lib/i18n'
import type { ReviewResult } from './ChangeSetReview'
import { useSentenceAnnouncer } from './useSentenceAnnouncer'
import { useDeviceAssistant, withDevice } from './useDeviceAssistant'

export interface ConversationOptions {
  /** Light context for the turn: the current view and selected tasks. */
  context: () => { view?: string; selected?: string[]; projectId?: string }
  onApplied: (r: { text: string; undoId: string }) => void
  /** The person's name for an on-device turn's instructions (the server uses the account's). */
  userName?: string
}

type Streaming = { text: string; status: string[]; blocks?: AssistantMessage['blocks'] }

/** The assistant's message of one turn, the change set it proposed, and the error that ended it early, if any. */
interface StreamedAnswer {
  answer: AssistantMessage
  proposal: ProposedChange[] | null
  failure?: { err: unknown }
  /** The stream's error code, when it ended with one. */
  errorCode?: string
}

/**
 * One streamed turn: text, status lines, usage, the proposed change set and the
 * stop reason, gathered into the assistant's message. A failed or stopped stream
 * keeps what arrived before it ended.
 */
type TurnRunner = (req: TurnRequest, onEvent: (e: TurnEvent) => void, signal?: AbortSignal) => Promise<void>

interface StreamCallbacks {
  text: (delta: string, all: string, status: string[]) => void
  status: (line: string, all: string, lines: string[]) => void
  /** A block arrived (assistant-generative-ui D3): every block so far. */
  block?: (block: AssistantBlock, blocks: NonNullable<AssistantMessage['blocks']>) => void
}

async function streamAnswer(req: TurnRequest, signal: AbortSignal, on: StreamCallbacks, run: TurnRunner = streamTurn): Promise<StreamedAnswer> {
  let text = ''
  const statusLines: string[] = []
  const blocks: NonNullable<AssistantMessage['blocks']> = []
  let proposal: ProposedChange[] | null = null
  let failure: StreamedAnswer['failure']
  let errorCode: string | undefined
  const answer: AssistantMessage = { role: 'assistant', text: '', at: Date.now() }
  try {
    await run(req, (ev: TurnEvent) => {
      switch (ev.type) {
        case 'text':
          text += ev.text
          on.text(ev.text, text, statusLines)
          break
        case 'status':
          statusLines.push(ev.text)
          on.status(ev.text, text, [...statusLines])
          break
        case 'block': {
          // Where the model called it: the length of the text so far (D3); an unknown block is skipped.
          const block = blockOf(ev)
          if (block) {
            blocks.push({ at: text.length, block })
            on.block?.(block, [...blocks])
          }
          break
        }
        case 'usage':
          answer.usage = { input: ev.input, output: ev.output, month_total: ev.month_total, cap: ev.cap, own_key: ev.own_key }
          break
        case 'changeset':
          proposal = ev.items
          break
        case 'error':
          answer.error = describeStreamError(ev.code, ev.message)
          errorCode = ev.code
          break
        case 'done':
          answer.stop = ev.stop_reason
          if (ev.stop_reason === 'refusal') text = ''
          if (ev.message && ev.stop_reason !== 'max_tokens') answer.error = ev.message
          break
      }
    }, signal)
  } catch (err) {
    failure = { err }
  }
  answer.text = text
  // The steps stay on the answer (assistant-generative-ui D8).
  if (statusLines.length) answer.status = [...statusLines]
  if (blocks.length) answer.blocks = blocks
  return { answer, proposal, failure, errorCode }
}

/** The composer's draft, chosen skill and pasted material, and prefills from elsewhere (assistant-skills D4). */
function useComposerState() {
  const [draft, setDraft] = useState('')
  const skills = useAssistantSkills()
  const [skill, setSkill] = useState<AssistantSkill | null>(null)
  const [pickedSkillId, setPickedSkillId] = useState<string | null>(null)
  const [pasted, setPasted] = useState<string | null>(null)
  // Photos of the next message (voice-ramble D3): in memory only, never in the thread.
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  // Each request to start the microphone (the palette's "Ramble into tasks").
  const [listenRequest, setListenRequest] = useState(0)
  const selectedFor = useRef<string[] | null>(null)
  // The same selection as state, for the tray's context chip (assistant-surface D3).
  const [selection, setSelection] = useState<string[] | null>(null)
  const [autoSend, setAutoSend] = useState(false)
  // The next send shows its change set for review whatever the auto-apply setting says (a turn the person did not type).
  const reviewNext = useRef(false)
  // Opened from the composer, the Ask screen or a task's menu (assistant-skills D4).
  const pendingPrefill = useAssistantPrefill()
  const applyPrefill = useCallback((p: AssistantPrefill | null) => {
    if (!p) return
    if (p.text !== undefined) setDraft(p.text)
    setPickedSkillId(p.skill ?? null)
    setPasted(p.pasted ?? null)
    selectedFor.current = p.selected ?? null
    setSelection(p.selected ?? null)
    setAutoSend(!!p.send)
    reviewNext.current = !!p.review
    if (p.listen) setListenRequest((n) => n + 1)
  }, [])
  useEffect(() => { applyPrefill(takeAssistantPrefill()) }, [applyPrefill, pendingPrefill])
  useEffect(() => {
    if (!pickedSkillId) { setSkill(null); return }
    const found = skills.find((x) => x.id === pickedSkillId)
    if (found) setSkill(found)
  }, [pickedSkillId, skills])
  const chooseSkill = (sk: AssistantSkill | null) => { setPickedSkillId(sk?.id ?? null); setSkill(sk) }
  const clearSelection = () => { selectedFor.current = null; setSelection(null) }
  return { draft, setDraft, skills, skill, setSkill, pickedSkillId, chooseSkill, pasted, setPasted, photos, setPhotos, listenRequest, selectedFor, selection, clearSelection, autoSend, setAutoSend, reviewNext }
}

/** Accepting the provider's terms (in-app-assistant consent), with an optional own key. */
function useConsent(status: AssistantStatus | null, setStatus: (s: AssistantStatus | null) => void) {
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const accept = async (ownKey?: string) => {
    if (!status) return
    setConsentBusy(true)
    setConsentError(null)
    try {
      // On a device the consent names the device's provider (assistant-on-device D6); no key goes to the server.
      const next = status.mode === 'device'
        ? await api.setMyAssistant({ consent: true, provider: `device:${status.provider}` })
        : await api.setMyAssistant({ consent: true, provider: status.provider, routines: true, ...(ownKey ? { own_key: ownKey } : {}) })
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
  return { consentBusy, consentError, accept, update: setStatus }
}

/** The review of a proposed change set: apply the checked items, discard, undo. */
function useReview(thread: AssistantThread | null, note: (x: AssistantThread, text: string) => Promise<void>, announce: (s: string) => void, onApplied: ConversationOptions['onApplied']) {
  const [review, setReview] = useState<Review | null>(null)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const reviewRef = useRef<HTMLDivElement>(null)
  const apply = async () => {
    if (!review || !thread || reviewBusy) return
    setReviewBusy(true)
    try {
      // Another device may have synced since the proposal arrived.
      const fresh = await refreshReview(review)
      const newlyStale = fresh.items.some((i) => i.state === 'stale' && review.items.find((o) => o.change.entityId === i.change.entityId)?.state === 'ok')
      if (newlyStale) {
        setReview(fresh)
        announce(t('Some items changed since they were proposed and were unchecked. Review and apply again.'))
        return
      }
      const chosen = fresh.items.filter((i) => i.checked).map((i) => i.change)
      const undo = await applyChanges(chosen)
      const res: ReviewResult = { applied: chosen.length, total: fresh.items.length, undoId: undo?.id ?? null }
      setReview(null)
      setResult(res)
      const summary = res.applied === res.total ? t('{n, plural, one {# change applied.} other {# changes applied.}}', { n: res.applied }) : t('{n} of {total} changes applied.', { n: res.applied, total: res.total })
      await note(thread, summary)
      announce(`${summary} ${t('Undo is available.')}`)
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
    announce(t('Proposal discarded.'))
  }
  const undo = async () => {
    if (!result?.undoId || !thread) return
    setReviewBusy(true)
    try {
      const u = await undoChanges(result.undoId)
      setResult({ ...result, undone: u })
      await note(thread, u.skipped.length ? t('Undone, except: {items}.', { items: u.skipped.join(', ') }) : t('Undone.'))
      announce(t('Undone: {n} restored.', { n: u.restored }))
    } finally {
      setReviewBusy(false)
    }
  }
  const toggle = (i: number, c: boolean) => setReview((r) => r && { ...r, items: r.items.map((it, j) => (j === i ? { ...it, checked: c } : it)) })
  return { review, setReview, result, setResult, reviewBusy, reviewRef, apply, discard, undo, toggle }
}

/** A question asked again: where it cuts the thread, its text and its skill. */
interface Redo { cut: number; question: string; skill: AssistantSkill | null; base?: AssistantThread }

/**
 * The latest question of a thread, when it can be asked again (assistant-generative-ui
 * D8): pasted text and photos are not kept, and a skill must still be offered.
 */
export function redoTarget(thread: AssistantThread | null, skills: AssistantSkill[]): Redo | null {
  const msgs = thread?.messages ?? []
  let i = msgs.length - 1
  while (i >= 0 && msgs[i].role !== 'user') i--
  if (i < 0) return null
  const q = msgs[i]
  if (q.pastedLines || q.photos) return null
  const skill = q.skill ? skills.find((x) => x.name === q.skill) ?? null : null
  if (q.skill && !skill) return null
  return { cut: i, question: q.text, skill }
}

export function useAssistantConversation({ context, onApplied, userName = '' }: ConversationOptions) {
  // The cached status renders at once (offline too); a fresh one follows.
  const [serverStatus, setStatus] = useState<AssistantStatus | null>(assistantStatus)
  // An encrypted account in device mode takes provider, model and consent from this device (assistant-on-device).
  const device = useDeviceAssistant(serverStatus)
  const status = withDevice(serverStatus, device.setup)
  const [thread, setThread] = useState<AssistantThread | null>(null)
  const [threads, setThreads] = useState<AssistantThread[] | null>(null)
  const composer = useComposerState()
  const [streaming, setStreaming] = useState<Streaming | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusAnnounce, setStatusAnnounce] = useState('')
  const live = useSentenceAnnouncer()
  const abort = useRef<AbortController | null>(null)
  // Where an edited question replaces the thread (assistant-generative-ui D8).
  const editCut = useRef<number | null>(null)
  const consent = useConsent(status, setStatus)

  // Tells the suggest-after-add trigger that a turn is running (it skips instead of replacing the draft).
  const running = !!streaming
  useEffect(() => {
    setAssistantTurnBusy(running)
    return () => setAssistantTurnBusy(false)
  }, [running])

  useEffect(() => {
    void refreshAssistantStatus().then(setStatus)
    void listThreads().then((all) => setThread((cur) => cur ?? all[0] ?? newThread('')))
    return () => abort.current?.abort()
  }, [])

  const persist = useCallback(async (item: AssistantThread) => {
    setThread(item)
    await saveThread(item).catch(() => {})
  }, [])
  const note = async (x1: AssistantThread, text: string) => {
    const msgs = [...x1.messages]
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, note: text }
    await persist({ ...x1, messages: msgs, updated_at: Date.now() })
  }
  const rv = useReview(thread, note, setStatusAnnounce, onApplied)

  /**
   * Auto-apply a small, fully fresh change set when the person turned that on; otherwise offer it for review.
   * A capture (a ramble or photos) is always reviewed: its proposal is never applied automatically (voice-ramble),
   * and so is a suggestion after adding a task (`review` in the prefill): the person did not type that turn.
   */
  const offer = async (entry: AssistantThread, items: ProposedChange[], review = false) => {
    const r = await reviewChangeSet(items)
    if (r.items.length && !review && (await getAutoApply()) && r.items.every((i) => i.state === 'ok') && autoApplicable(r.items.map((i) => i.change))) {
      const undo = await applyChanges(r.items.map((i) => i.change))
      const res: ReviewResult = { applied: r.items.length, total: r.items.length, undoId: undo?.id ?? null, auto: true }
      rv.setResult(res)
      await note(entry, t('{n, plural, one {# change applied automatically.} other {# changes applied automatically.}}', { n: res.applied }))
      if (undo) onApplied({ text: t('{n, plural, one {Assistant: # change applied.} other {Assistant: # changes applied.}}', { n: res.applied }), undoId: undo.id })
      setStatusAnnounce(t('{n, plural, one {# change applied automatically. Undo is available.} other {# changes applied automatically. Undo is available.}}', { n: res.applied }))
    } else {
      rv.setReview(r)
      setStatusAnnounce(t('{n, plural, one {# proposed change to review below.} other {# proposed changes to review below.}}', { n: r.items.length }))
    }
  }

  /** Regenerate runs a question again from the thread, never from the composer (assistant-generative-ui D8). */
  const send = async (redo?: Redo) => {
    const { draft, pasted, photos } = redo ? { draft: redo.question, pasted: null, photos: [] as PreparedPhoto[] } : composer
    const chosen = redo ? redo.skill : composer.skill
    // A skill, pasted material or photos can be sent without typed text.
    const question = draft.trim() || (chosen ? chosen.example : pasted ? t('Use the pasted text.') : photos.length ? t('Turn this into tasks') : '')
    if (!question || streaming) return
    const material = pasted
    const selection = redo ? null : composer.selectedFor.current
    const mustReview = !redo && composer.reviewNext.current
    // Edit and Regenerate replace the question they start from and everything after it.
    const cut = redo ? redo.cut : editCut.current
    editCut.current = null
    // The latest thread may still be loading from the device: start a new one then.
    const loaded = redo?.base ?? thread ?? newThread(status?.provider ?? '')
    const current = cut === null ? loaded : { ...loaded, messages: loaded.messages.slice(0, cut) }
    if (!redo) {
      composer.reviewNext.current = false
      composer.setDraft('')
      composer.setSkill(null)
      composer.setPasted(null)
      composer.setPhotos([])
      composer.clearSelection()
    }
    setError(null)
    rv.setReview(null)
    rv.setResult(null)
    live.reset()
    const userMsg: AssistantMessage = { role: 'user', text: question, at: Date.now(),
      ...(chosen ? { skill: chosen.name } : {}), ...(material ? { pastedLines: material.split(/\r?\n/).length } : {}), ...(photos.length ? { photos: photos.length } : {}) }
    const history = current.messages
    let entry: AssistantThread = { ...current, messages: [...history, userMsg], updated_at: Date.now(), provider: status?.provider ?? '',
      title: current.messages.length ? current.title : question.slice(0, 60) }
    await persist(entry)
    const ctl = new AbortController()
    abort.current = ctl
    setStreaming({ text: '', status: [] })
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    let streamed: StreamedAnswer
    try {
      // projectId only drives the panel's kept-away line; the server never gets it.
      const ctx = { ...context() }
      delete ctx.projectId
      const req: TurnRequest = { messages: turnMessages(history, question, material ?? undefined, photos.length ? wireImages(photos) : undefined), timezone: zone, ...ctx,
        ...(selection ? { selected: selection } : {}),
        ...(chosen ? { skill: chosen.id, workday: await workday() } : {}) }
      // Device mode runs the loop here and calls the provider directly; the server sees nothing (assistant-on-device D7).
      const setup = device.setup
      const run = status?.mode === 'device' && setup
        ? await import('../../lib/assistantDevice/loop').then(({ runDeviceTurn }) => (r: TurnRequest, on: (e: TurnEvent) => void, sig?: AbortSignal) => runDeviceTurn(r, on, sig, { setup, userName }))
        : undefined
      streamed = await streamAnswer(req, ctl.signal, {
        text: (delta, text, lines) => { live.push(delta); setStreaming((cur) => ({ text, status: lines, blocks: cur?.blocks })) },
        status: (line, text, lines) => { setStatusAnnounce(line); setStreaming((cur) => ({ text, status: lines, blocks: cur?.blocks })) },
        // A block is announced once, by its label, where it arrives (D4).
        block: (block, all) => { live.push(` ${blockLabel(block)}. `); setStreaming((cur) => ({ text: cur?.text ?? '', status: cur?.status ?? [], blocks: all })) },
      }, run)
    } catch (err) {
      streamed = { answer: { role: 'assistant', text: '', at: Date.now() }, proposal: null, failure: { err } }
    }
    let { answer } = streamed
    // A model that does not read photos: the message and the photos go back to the composer (voice-ramble D5).
    const failedCode = streamed.failure?.err instanceof ApiError ? streamed.failure.err.code : streamed.errorCode
    if (photos.length && isImagesUnsupported(failedCode)) {
      abort.current = null
      setStreaming(null)
      composer.setDraft(draft)
      composer.setPhotos(photos)
      if (chosen) composer.chooseSkill(chosen)
      if (material) composer.setPasted(material)
      setError(imagesUnsupportedMessage(failedCode))
      live.setAnnounce(imagesUnsupportedMessage(failedCode))
      await persist({ ...current, updated_at: Date.now() })
      return
    }
    photos.forEach(releasePhoto)
    if (streamed.failure) {
      const { err } = streamed.failure
      if (ctl.signal.aborted) answer.note = t('Stopped.')
      else {
        answer.error = describeTurnError(err)
        if (err instanceof ApiError && (err.code === 'consent_required' || err.code === 'encryption_enabled')) setStatus(await refreshAssistantStatus())
      }
    }
    abort.current = null
    // A refusal shows the fixed message and no partial text (design D5).
    answer = { ...answer, text: answer.stop === 'refusal' ? '' : answer.text }
    live.flush()
    if (answer.error) live.setAnnounce(answer.error)
    setStreaming(null)
    entry = { ...entry, messages: [...entry.messages, answer], updated_at: Date.now(),
      usage: { input: entry.usage.input + (answer.usage?.input ?? 0), output: entry.usage.output + (answer.usage?.output ?? 0) } }
    await persist(entry)
    const items = answer.stop === 'end_turn' ? streamed.proposal : null
    if (items && items.length) await offer(entry, items, mustReview || chosen?.id === 'capture' || photos.length > 0)
  }

  /** Edit puts the latest question back in the composer; sending it replaces that question and its answer. */
  const editLast = () => {
    const target = redoTarget(thread, composer.skills)
    if (!target || streaming) return
    editCut.current = target.cut
    composer.setDraft(target.question)
    composer.chooseSkill(target.skill)
  }
  const regenerate = () => {
    const target = redoTarget(thread, composer.skills)
    if (target && !streaming) void send(target)
  }

  /** A choice block's option, sent as the next message (assistant-generative-ui D4); the answer keeps what was chosen. */
  const choose = async (option: string) => {
    const msgs = [...(thread?.messages ?? [])]
    const last = msgs[msgs.length - 1]
    if (!thread || streaming || last?.role !== 'assistant' || last.chosen) return
    msgs[msgs.length - 1] = { ...last, chosen: option }
    const base = { ...thread, messages: msgs }
    await persist(base)
    await send({ cut: msgs.length, question: option, skill: null, base })
  }

  const startNew = () => {
    editCut.current = null
    abort.current?.abort()
    setThread(newThread(status?.provider ?? ''))
    rv.setReview(null)
    rv.setResult(null)
    setThreads(null)
    setError(null)
  }
  const toggleThreads = async () => setThreads(threads ? null : await listThreads())
  const clearAll = async () => {
    await clearThreads()
    startNew()
  }
  const pickThread = (id: string) => {
    void listThreads().then((all) => {
      const item = all.find((x) => x.id === id)
      if (item) { editCut.current = null; setThread(item); setThreads(null); rv.setReview(null); rv.setResult(null) }
    })
  }

  return {
    status, device, thread, threads, toggleThreads, clearAll, composer, streaming, error, statusAnnounce, live, abort, consent, review: rv,
    send, startNew, pickThread, stop: () => abort.current?.abort(), editLast, regenerate, choose,
    /** Whether the latest question can be asked again: its material (pasted text, photos) is not kept. */
    canRedo: !!redoTarget(thread, composer.skills),
  }
}
