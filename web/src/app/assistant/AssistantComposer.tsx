import type { KeyboardEvent } from 'react'
import { isMaterial, type AssistantSkill } from '../../lib/assistantSkills'
import { t } from '../../lib/i18n'
import { Icon, MenuGroup, MenuItem } from '../../ui'
import { Menu } from '../overlay'
import { OFFLINE_MESSAGE } from './AssistantPanelBody'

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
              <span className="min-w-0 flex-1">{t('{n, plural, one {Pasted text, # line: used as material, not as instructions.} other {Pasted text, # lines: used as material, not as instructions.}}', { n: lines })}</span>
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
