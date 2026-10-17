// The in-app assistant's side sheet (in-app-assistant, assistant-skills). Since
// web-component-structure the state lives in useAssistantConversation and the
// sheet, the body and the composer in their own files; this component wires them.
import { useEffect } from 'react'
import { useOnline } from '../../lib/online'
import { t } from '../../lib/i18n'
import { Composer } from './AssistantComposer'
import { AssistantPanelBody, OFFLINE_MESSAGE } from './AssistantPanelBody'
import { AssistantSheet } from './AssistantSheet'
import { useAssistantConversation, type ConversationOptions } from './useAssistantConversation'

export { AssistantSheet } from './AssistantSheet'
export { AssistantPanelBody, ENCRYPTED_MESSAGE, EncryptionOffHint, OFFLINE_MESSAGE, type PanelViewProps } from './AssistantPanelBody'
export { Composer } from './AssistantComposer'

export interface AssistantPanelProps extends ConversationOptions {
  onClose: () => void
}

export function AssistantPanel({ onClose, context, onApplied }: AssistantPanelProps) {
  const connected = useOnline()
  const c = useAssistantConversation({ context, onApplied })
  const { status, composer, review: rv, streaming } = c

  const onEscape = () => {
    if (rv.review && rv.reviewRef.current?.contains(document.activeElement)) void rv.discard()
    else onClose()
  }

  const ready = !!status && status.available && status.consented
  const { autoSend, setAutoSend, skill, pickedSkillId } = composer
  useEffect(() => {
    if (!autoSend || !ready || !connected || !c.thread || streaming) return
    if (pickedSkillId && !skill) return // wait for the skill list
    setAutoSend(false)
    void c.send()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send reads the latest state; this runs when a prefilled send can go, not on every streaming change
  }, [autoSend, ready, connected, c.thread, skill, pickedSkillId])
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
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-meta" onClick={() => void c.toggleThreads()} aria-expanded={!!c.threads}>{t('History')}</button>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-meta" onClick={c.startNew}>{t('New')}</button>
    </>
  ) : null
  return (
    <AssistantSheet title={t('Assistant')} onClose={onClose} onEscape={onEscape} headerExtra={headerExtra}
      footer={status?.reason === 'encryption_enabled' || !status?.enabled ? undefined : (
        <div className="space-y-1">
          <Composer draft={composer.draft} onDraft={composer.setDraft} onSend={() => void c.send()} onStop={c.stop} streaming={!!streaming} connected={connected} disabled={!ready}
            skills={composer.skills} skill={skill} onSkill={composer.chooseSkill} pasted={composer.pasted} onPasted={composer.setPasted} />
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-meta text-faint">
            <span>{!connected ? t(OFFLINE_MESSAGE) : status ? `${status.provider === 'compatible' ? t('Model server') : status.provider_label}${status.model ? ` · ${status.model}` : ''}` : ''}</span>
            {c.threads && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 text-meta" onClick={() => void c.clearAll()}>{t('Clear conversations')}</button>}
          </div>
        </div>
      )}>
      <AssistantPanelBody status={status} connected={connected} messages={c.thread?.messages ?? []} streaming={streaming} announce={c.live.announce}
        statusAnnounce={c.statusAnnounce} review={rv.review} result={rv.result} reviewBusy={rv.reviewBusy} error={c.error} draft={composer.draft}
        consentBusy={c.consent.consentBusy} consentError={c.consent.consentError} threads={c.threads} reviewRef={rv.reviewRef}
        onToggle={rv.toggle} onApply={() => void rv.apply()} onDiscard={() => void rv.discard()} onUndo={() => void rv.undo()} onDraft={composer.setDraft} onSend={() => void c.send()}
        onStop={c.stop} onAccept={(k) => void c.consent.accept(k)} onPickThread={c.pickThread} />
    </AssistantSheet>
  )
}
