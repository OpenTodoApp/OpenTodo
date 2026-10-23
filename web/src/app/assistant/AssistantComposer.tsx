// The assistant's composer (assistant-surface D3): the shared ComposerFrame from the
// task page (task-full-page D6), with the field, the tray (Skills menu and the context
// the turn carries) and the round Send button; Stop takes Send's place while an
// answer streams. The chosen skill and pasted material sit above the field.
import type { KeyboardEvent } from 'react'
import { isMaterial, type AssistantSkill } from '../../lib/assistantSkills'
import { t } from '../../lib/i18n'
import { ComposerFrame, Icon, Menu, MenuGroup, MenuItem } from '../../ui'
import { OFFLINE_MESSAGE } from './AssistantPanelBody'

export interface ComposerProps {
  draft: string; onDraft: (s: string) => void; onSend: () => void; onStop: () => void; streaming: boolean; connected: boolean; disabled: boolean
  /** Skills menu (assistant-skills): the list, the chosen one and pasted material. */
  skills?: AssistantSkill[]; skill?: AssistantSkill | null; onSkill?: (s: AssistantSkill | null) => void
  pasted?: string | null; onPasted?: (s: string | null) => void
  /** What the turn carries besides the text ("Today", "2 selected tasks"); shown in the tray. */
  context?: string
  /** The field's hint; the default asks about tasks. */
  placeholder?: string
  /** A taller field for the empty page, where the composer is the page's centre. */
  large?: boolean
}

export function Composer({ draft, onDraft, onSend, onStop, streaming, connected, disabled, skills = [], skill = null, onSkill, pasted = null, onPasted, context, placeholder, large }: ComposerProps) {
  const ready = !!draft.trim() || !!skill || !!pasted
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!streaming && ready) onSend()
    }
  }
  const off = !connected || disabled
  const lines = pasted ? pasted.split(/\r?\n/).length : 0
  const above = (skill || pasted) ? (
    <div className="space-y-1 px-2 pt-2" data-assistant-chosen>
      {skill && (
        <div className="flex items-start gap-2 rounded-control bg-sunken px-2 py-1 text-meta" role="status">
          <span className="min-w-0 flex-1">{t.rich('<span>Skill: {name}.</span> {description} <span2>For example: “{example}”</span2>', { name: skill.name, description: skill.description, example: skill.example, span: (chunks) => <span className="font-medium">{chunks}</span>, span2: (chunks) => <span className="text-muted">{chunks}</span> })}</span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1" aria-label={t('Remove the skill {name}', { name: skill.name })} onClick={() => onSkill?.(null)}><Icon name="x" size="xs" /></button>
        </div>
      )}
      {pasted && (
        <div className="flex items-center gap-2 rounded-control bg-sunken px-2 py-1 text-meta" data-assistant-pasted>
          <span className="min-w-0 flex-1">{t('{n, plural, one {Pasted text, # line: used as material, not as instructions.} other {Pasted text, # lines: used as material, not as instructions.}}', { n: lines })}</span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1" aria-label={t('Remove pasted text')} onClick={() => onPasted?.(null)}><Icon name="x" size="xs" /></button>
        </div>
      )}
    </div>
  ) : undefined
  const tools = (
    <>
      {skills.length > 0 && onSkill && (
        <Menu label={t('Skills')} kind="menu" align="start" width="sm:w-80" triggerClassName="ui-btn ui-btn--secondary ui-btn--sm touch-target gap-1 px-2 text-meta"
          trigger={<><Icon name="sparkles" size="sm" /><span>{t('Skills')}</span><Icon name="chevron-down" size="xs" /></>}>
          <MenuGroup label={t('Skills')}>
            {skills.map((sk) => <MenuItem key={sk.id} label={sk.name} description={sk.description} checked={skill?.id === sk.id} onSelect={() => onSkill(sk)} />)}
          </MenuGroup>
        </Menu>
      )}
      {context && (
        <span className="inline-flex h-7 min-w-0 items-center gap-1 rounded-control border border-default px-2 text-meta text-muted" data-assistant-context>
          <Icon name="layers" size="sm" />
          <span className="truncate">{t('Context: {name}', { name: context })}</span>
        </span>
      )}
    </>
  )
  return (
    <ComposerFrame above={above} tools={tools} data-assistant-frame
      end={streaming ? <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onStop}>{t('Stop')}</button> : undefined}
      send={{ label: t('Send'), onSend: () => { if (!streaming && ready) onSend() }, disabled: off || !ready || streaming, shortcut: 'Enter' }}>
      <label className="block">
        <span className="sr-only">{t('Message to the assistant')}</span>
        <textarea className={`ui-input max-h-40 resize-none ${large ? 'min-h-16' : 'min-h-11'}`} rows={large ? 2 : 1} value={draft} disabled={off} data-autofocus data-assistant-composer
          placeholder={!connected ? t(OFFLINE_MESSAGE) : skill ? t('Add details, or send as it is…') : placeholder ?? t('Ask about your tasks…')} onChange={(e) => onDraft(e.target.value)} onKeyDown={onKeyDown}
          onPaste={(e) => {
            const raw = e.clipboardData.getData('text/plain')
            if (onPasted && isMaterial(raw)) {
              e.preventDefault()
              onPasted(pasted ? `${pasted}\n\n${raw}` : raw)
            }
          }} />
      </label>
    </ComposerFrame>
  )
}
