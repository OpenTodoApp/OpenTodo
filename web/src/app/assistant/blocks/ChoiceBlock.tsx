// A choice (OpenSpec change assistant-generative-ui, spec "Choice block"): the
// question and one button per option, plus "Something else", which puts the focus
// in the composer. Only the latest answer's choice is active; once chosen, or once
// a later message exists, the buttons are disabled and the chosen one is marked.
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { t } from '../../../lib/i18n'
import { Icon } from '../../../ui'
import { focusComposer } from '../focusComposer'

export interface ChoiceState {
  /** The latest answer, online and not streaming. */
  active: boolean
  chosen?: string
  onChoose?: (option: string) => void
}

export function ChoiceBlock({ block, state }: { block: Extract<AssistantBlock, { kind: 'choice' }>; state?: ChoiceState }) {
  const enabled = !!state?.active && !state.chosen && !!state.onChoose
  return (
    <div className="space-y-2 p-3" data-assistant-choice>
      <p className="text-body font-medium user-text">{block.question}</p>
      <div className="flex flex-wrap gap-2">
        {block.options.map((o) => {
          const chosen = state?.chosen === o
          return (
            <button key={o} type="button" disabled={!enabled} aria-pressed={chosen}
              className={`ui-btn ui-btn--sm touch-target gap-1 user-text ${chosen ? 'ui-btn--primary' : 'ui-btn--secondary'}`}
              onClick={() => state?.onChoose?.(o)} data-choice-option>
              {chosen && <Icon name="check" size="sm" />}{o}
            </button>
          )
        })}
        <button type="button" disabled={!enabled} className="ui-btn ui-btn--ghost ui-btn--sm touch-target" onClick={focusComposer} data-choice-other>{t('Something else')}</button>
      </div>
    </div>
  )
}
