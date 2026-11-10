import { lazy, Suspense, type ReactNode } from 'react'
import { BrandMark, Skeleton } from '../../ui'
import type { AssistantSkill } from '../../lib/assistantSkills'
import { AssistantWelcome } from './AssistantWelcome'
import type { Review } from '../../lib/assistant'
import { usageLine, type AssistantMessage, type AssistantThread } from '../../lib/assistant'
import type { AssistantStatus } from '../../lib/assistantStatus'
import { t } from '../../lib/i18n'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { AssistantConsent } from './AssistantConsent'
import { ChangeSetReview, type ReviewResult } from './ChangeSetReview'
import type { ItemEdits } from '../../lib/assistantShape'
import { AnswerActions, QuestionActions } from './MessageActions'
import { AnswerContent } from './blocks/AnswerContent'
import type { ChoiceState } from './blocks/ChoiceBlock'
import { FollowupChips } from './blocks/FollowupChips'
import { answerFollowups, answerMarkdown } from '../../lib/assistantBlocks'
import { DeviceLocked, DeviceSetupForm } from './AssistantDevice'
import type { DeviceMode } from './useDeviceAssistant'

// Shown once to few people (assistant-disclosure-notice), so it loads only when due.
const DisclosureNotice = lazy(() => import('./DisclosureNotice').then((m) => ({ default: m.DisclosureNotice })))

import { ENCRYPTED_MESSAGE, EncryptionOffHint, OFFLINE_MESSAGE } from './assistantHints'
export { ENCRYPTED_MESSAGE, EncryptionOffHint, OFFLINE_MESSAGE }

export interface PanelViewProps {
  status: AssistantStatus | null
  connected: boolean
  messages: AssistantMessage[]
  streaming: { text: string; status: string[]; blocks?: AssistantMessage['blocks'] } | null
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
  /** Edits a proposed value before applying (assistant-generative-ui D6). */
  onEdit?: (i: number, edits: ItemEdits) => void
  onApply: () => void
  onDiscard: () => void
  onUndo: () => void
  onDraft: (s: string) => void
  onSend: () => void
  onStop: () => void
  onAccept: (ownKey?: string) => void
  onPickThread: (id: string) => void
  /** The empty state (assistant-surface D2): the person's name, the starter skills, what a starter does. */
  name?: string
  skills?: AssistantSkill[]
  onStarter?: (s: AssistantSkill) => void
  /** Following the stream (assistant-generative-ui D8): on the element that grows with the conversation. */
  followRef?: (el: HTMLElement | null) => void
  /** Message actions (D8): Regenerate the latest answer, Edit the latest question, when it can be asked again. */
  onRegenerate?: () => void
  onEditLast?: () => void
  canRedo?: boolean
  /** A choice block's option, sent as the next message (assistant-generative-ui D4). */
  onChoose?: (option: string) => void
  /** A follow-up suggestion, sent as the next message (assistant-followups D1). */
  onFollowUp?: (text: string) => void
  /** The page's empty state holds the composer; the sheet keeps it at its foot. */
  composer?: ReactNode
  layout?: 'page' | 'sheet'
  /** The on-device assistant of an encrypted account (assistant-on-device). */
  device?: DeviceMode
  /** The status after the disclosure notice's Got it or Turn off (assistant-disclosure-notice). */
  onStatus?: (s: AssistantStatus) => void
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
  const dev = s.mode === 'device' ? p.device : undefined
  if (dev && s.device) {
    if (dev.locked) return <DeviceLocked />
    if (!dev.loaded) return <Skeleton shape="line" count={3} label={t('Loading the assistant')} />
    if (!dev.setup || dev.editing) return <DeviceSetupForm allowance={s.device} setup={dev.setup} onSave={dev.save} onCancel={dev.setup ? () => dev.edit(false) : undefined} />
  }
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
        <AssistantConsent status={s} connected={p.connected} busy={p.consentBusy} error={p.consentError} onAccept={p.onAccept}
          device={dev?.setup ? { setup: dev.setup, onChange: () => dev.edit(true) } : undefined} />
      ) : (
        <>
          {s.disclosure_notice && <Suspense fallback={null}><DisclosureNotice status={s} connected={p.connected} onStatus={p.onStatus} /></Suspense>}
          {p.messages.length === 0 && !p.streaming && !p.threads ? (
            <AssistantWelcome name={p.name ?? ''} skills={p.skills ?? []} onStarter={(s) => p.onStarter?.(s)} composer={p.composer} layout={p.layout ?? 'sheet'} />
          ) : (
            <ol ref={p.followRef} className="space-y-5" aria-label={t('Conversation')}>
              {p.messages.map((m, i) => <MessageItem key={i} m={m} actions={actionsFor(p, i)} />)}
              {p.streaming && (
                <AnswerItem busy>
                  {p.streaming.status.length > 0 && <p className="text-meta text-muted">{p.streaming.status[p.streaming.status.length - 1]}</p>}
                  {p.streaming.text || p.streaming.blocks?.length ? <AnswerContent text={p.streaming.text} blocks={p.streaming.blocks} /> : <p className="text-muted">{t('Thinking…')}</p>}
                </AnswerItem>
              )}
            </ol>
          )}
          {(p.review || p.result) && (
            <div className="sm:pl-9">
              <ChangeSetReview review={p.review} result={p.result} busy={p.reviewBusy} onToggle={p.onToggle} onEdit={p.onEdit} shapes onApply={p.onApply} onDiscard={p.onDiscard} onUndo={p.onUndo} regionRef={p.reviewRef} />
            </div>
          )}
        </>
      )}
      {p.error && <p role="alert" className="text-body text-danger">{p.error}</p>}
      <div className="sr-only" aria-live="polite" data-assistant-live>{p.announce}</div>
      <div className="sr-only" aria-live="polite" data-assistant-status>{p.statusAnnounce}</div>
    </div>
  )
}

/** An answer: the assistant's mark at the left, the text beside it (assistant-surface D2). */
function AnswerItem({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-body" aria-busy={busy || undefined}>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control border border-default" aria-hidden="true"><BrandMark size={16} /></span>
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </li>
  )
}

/** The progress lines of a finished answer, closed by default (assistant-generative-ui D8). */
function AnswerSteps({ lines }: { lines: string[] }) {
  return (
    <details className="text-meta text-muted" data-assistant-steps>
      <summary className="w-fit cursor-pointer rounded-control">{t('{n, plural, one {# step} other {# steps}}', { n: lines.length })}</summary>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ol>
    </details>
  )
}

interface ItemActions { enabled: boolean; regenerate?: () => void; edit?: () => void; choice: ChoiceState; followUp?: (text: string) => void }

/** Which actions a message offers: Copy on every answer, Regenerate and Edit on the latest ones only. */
function actionsFor(p: PanelViewProps, i: number): ItemActions {
  const enabled = p.connected && !p.streaming
  const msgs = p.messages
  const latest = (role: 'user' | 'assistant') => msgs.findLastIndex((m) => m.role === role) === i
  const redo = !!p.canRedo
  return {
    enabled,
    // Only the latest answer's choice is active, and only while nothing follows it.
    choice: { active: enabled && i === msgs.length - 1, chosen: msgs[i]?.chosen, onChoose: p.onChoose },
    // Only the latest answer offers its follow-ups (assistant-followups).
    followUp: i === msgs.length - 1 ? p.onFollowUp : undefined,
    regenerate: redo && latest('assistant') && i === msgs.length - 1 && !p.streaming ? p.onRegenerate : undefined,
    edit: redo && latest('user') && !p.streaming ? p.onEditLast : undefined,
  }
}

function MessageItem({ m, actions }: { m: AssistantMessage; actions: ItemActions }) {
  if (m.role === 'user') {
    return (
      <li className="ml-auto w-fit max-w-[85%] rounded-card bg-sunken px-3 py-2 text-body">
        {(m.skill || m.pastedLines || m.photos) && (
          <p className="mb-1 text-meta text-muted">{[m.skill && t('Skill: {name}', { name: m.skill }), m.pastedLines && t('{n, plural, one {pasted text, # line} other {pasted text, # lines}}', { n: m.pastedLines }),
            m.photos && t('{n, plural, one {# photo (not kept)} other {# photos (not kept)}}', { n: m.photos })].filter(Boolean).join(' · ')}</p>
        )}
        <span className="sr-only">{t('You:')}</span><span className="whitespace-pre-wrap user-text">{m.text}</span>
        {actions.edit && <QuestionActions onEdit={actions.edit} enabled={actions.enabled} />}
      </li>
    )
  }
  return (
    <AnswerItem>
      <span className="sr-only">{t('Assistant:')}{' '}</span>
      {m.status && m.status.length > 0 && <AnswerSteps lines={m.status} />}
      <AnswerContent text={m.text} blocks={m.blocks} choice={actions.choice} />
      {m.stop === 'max_tokens' && <p className="text-meta font-medium text-on-warning-soft">{t('Cut off: the answer reached its length limit.')}</p>}
      {m.error && <p className="text-danger">{m.error}</p>}
      {m.note && <p className="text-meta text-muted">{m.note}</p>}
      {m.usage && <p className="text-meta text-faint">{usageLine(m.usage)}</p>}
      {(m.text || m.blocks?.length) && <AnswerActions text={() => answerMarkdown(m)} onRegenerate={actions.regenerate} enabled={actions.enabled} />}
      {actions.followUp && <FollowupChips suggestions={answerFollowups(m)} enabled={actions.enabled} onFollowUp={actions.followUp} />}
    </AnswerItem>
  )
}
