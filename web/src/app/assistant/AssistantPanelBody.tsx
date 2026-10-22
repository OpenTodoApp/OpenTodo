import { Skeleton } from '../../ui'
import type { Review } from '../../lib/assistant'
import { usageLine, type AssistantMessage, type AssistantThread } from '../../lib/assistant'
import type { AssistantStatus } from '../../lib/assistantStatus'
import { msg, t } from '../../lib/i18n'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { Markdown } from '../Markdown'
import { navigate } from '../router'
import { requestSettingsFocus } from '../settingsIndex'
import { AssistantConsent } from './AssistantConsent'
import { ChangeSetReview, type ReviewResult } from './ChangeSetReview'

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
                <li>{t('Move everything from earlier days to Friday.')}</li>
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
