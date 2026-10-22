// The command bar's own parts (OpenSpec change moments-and-onboarding, design D7):
// the segmented control under the field, the hint naming the prefixes, Add mode (the
// quick add with the opening screen's defaults) and Ask mode (one line handed to the
// assistant panel on Enter; nothing is sent before).
import { useRef, useState, type FormEvent } from 'react'
import { useLabels, useProjects } from '../../lib/localData'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { HelpLink } from '../help/HelpLink'
import { QuickAdd, type QuickAddInput } from '../QuickAdd'
import { ask } from '../assistant/AskEntry'
import { MODE_LABEL, PREFIX_OF, type BarMode } from './modes'

/** Search, Add, Commands and (when available) Ask, as one radio group under the field. */
export function ModeSwitch({ modes, mode, onMode }: { modes: BarMode[]; mode: BarMode; onMode: (m: BarMode) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = modes.indexOf(mode)
    const next = modes[(i + (e.key === 'ArrowRight' ? 1 : modes.length - 1)) % modes.length]
    onMode(next)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={t('Mode')} onKeyDown={move} className="flex gap-1 rounded-control bg-sunken p-0.5" data-bar-modes>
      {modes.map((m) => {
        const checked = m === mode
        return (
          <button key={m} ref={(el) => { refs.current[m] = el }} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
            onClick={() => onMode(m)} data-bar-mode={m}
            className={`min-h-8 flex-1 rounded-chip px-2 text-meta font-medium ${checked ? 'bg-surface text-strong shadow-1' : 'text-muted hover:text-default'}`}>
            {MODE_LABEL[m]}
          </button>
        )
      })}
    </div>
  )
}

/** The hint while the field is empty: what Search finds and the three prefixes. */
export function BarHint({ ask: withAsk }: { ask: boolean }) {
  return (
    <p className="flex items-center gap-2 px-1 text-meta text-muted" data-bar-hint>
      <span className="min-w-0 flex-1">
        {withAsk
          ? t.rich('Search, or start with {add} to add a task, {commands} for commands, {ask} to ask.', { add: <kbd className="ui-kbd">{PREFIX_OF.add}</kbd>, commands: <kbd className="ui-kbd">{PREFIX_OF.commands}</kbd>, ask: <kbd className="ui-kbd">{PREFIX_OF.ask}</kbd> })
          : t.rich('Search, or start with {add} to add a task, {commands} for commands.', { add: <kbd className="ui-kbd">{PREFIX_OF.add}</kbd>, commands: <kbd className="ui-kbd">{PREFIX_OF.commands}</kbd> })}
      </span>
      <HelpLink screen="palette" topic={t('Search and commands')} />
    </p>
  )
}

/** Add mode: the quick add, chips and preview; Enter adds and keeps the field, empty and focused. */
export function AddPanel({ onAdd, initial }: { onAdd: (input: QuickAddInput) => Promise<unknown>; initial?: string }) {
  const projects = useProjects()
  const labels = useLabels()
  return (
    <div className="rounded-control border border-default px-2 py-1" data-bar-add>
      <QuickAdd autoFocus hideHint initialValue={initial} placeholder={t('Add a task…')} label={t('Add a task')} projects={projects} labels={labels}
        onAdd={async (input) => { await onAdd(input) }} />
    </div>
  )
}

/** Ask mode: one line for the assistant; Enter opens the panel with it sent as one turn. */
export function AskPanel({ onSent }: { onSent: () => void }) {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const line = text.trim()
    if (!line) return
    ask({ text: line, send: true })
    onSent()
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-control border border-default px-2 py-1" data-bar-ask>
      <Icon name="message-circle" className="text-accent" />
      <input className="ui-input border-transparent bg-transparent px-1 shadow-none focus:border-transparent focus:ring-0 dark:bg-transparent" autoFocus
        value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Ask the assistant')} placeholder={t('Ask about your tasks…')} enterKeyHint="send" data-bar-ask-input />
    </form>
  )
}
