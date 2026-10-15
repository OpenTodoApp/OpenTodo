// The "Ask OpenTodo" composer (OpenSpec change assistant-skills, design D4): a
// text area, a Skills menu and up to three example cards. It only collects the
// request; the caller opens the assistant panel with it. A long or multi-line
// paste becomes separate material (sent as untrusted text, design D3).
import { type ClipboardEvent, type KeyboardEvent, useId, useState } from 'react'
import { Menu } from '../../app/overlay'
import { Button } from '../Button'
import { Card } from '../Card'
import { Icon } from '../Icon'
import { MenuGroup, MenuItem } from '../Menu'

export interface AskSkill {
  id: string
  name: string
  description: string
  example: string
}

export interface AskRequest {
  text: string
  skill?: string
  pasted?: string
  /** True when the user sent the text (Enter or Send), false when they picked a skill or a card to fill in. */
  send: boolean
}

export interface AskComposerProps {
  skills: AskSkill[]
  onAsk: (r: AskRequest) => void
  /** Show the example cards (off in tight places). */
  examples?: boolean
  autoFocus?: boolean
  disabled?: boolean
  placeholder?: string
}

/** Pasted text longer than this, or with line breaks, is kept as material. */
export const PASTE_MATERIAL_CHARS = 280

export function AskComposer({ skills, onAsk, examples = true, autoFocus, disabled, placeholder = 'Ask about your tasks, or pick a skill…' }: AskComposerProps) {
  const [text, setText] = useState('')
  const [pasted, setPasted] = useState<string | null>(null)
  const inputId = useId()
  const send = () => {
    const t = text.trim()
    if (!t && !pasted) return
    onAsk({ text: t, ...(pasted ? { pasted } : {}), send: true })
    setText('')
    setPasted(null)
  }
  const pick = (skill: AskSkill, example = false) => {
    onAsk({ text: example ? skill.example : text.trim(), skill: skill.id, ...(pasted ? { pasted } : {}), send: false })
    setText('')
    setPasted(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = e.clipboardData.getData('text/plain')
    if (raw.length > PASTE_MATERIAL_CHARS || /\r|\n/.test(raw.trim())) {
      e.preventDefault()
      setPasted((cur) => (cur ? `${cur}\n\n${raw}` : raw))
    }
  }
  const lines = pasted ? pasted.split(/\r?\n/).length : 0
  return (
    <div className="space-y-3" data-ask-composer>
      <form className="rounded-card border border-input bg-surface p-2 focus-within:outline-2 focus-within:outline-focus"
        onSubmit={(e) => { e.preventDefault(); send() }}>
        <label htmlFor={inputId} className="sr-only">Ask OpenTodo</label>
        <textarea id={inputId} className="block max-h-48 min-h-12 w-full resize-none bg-transparent px-1 py-1 text-body text-default outline-none placeholder:text-faint"
          rows={2} value={text} disabled={disabled} autoFocus={autoFocus} placeholder={placeholder} data-ask-input
          onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} />
        {pasted && (
          <div className="mb-1 flex items-center gap-2 rounded-control bg-sunken px-2 py-1 text-meta text-muted" data-ask-pasted>
            <Icon name="list" size="xs" />
            <span className="min-w-0 flex-1 truncate">Pasted text, {lines} line{lines === 1 ? '' : 's'}: used as material, not as instructions</span>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1" aria-label="Remove pasted text" onClick={() => setPasted(null)}><Icon name="x" size="xs" /></button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {skills.length > 0 && (
            <Menu label="Skills" kind="menu" align="start" width="sm:w-80" triggerClassName="ui-btn ui-btn--secondary ui-btn--sm"
              trigger={<><Icon name="list" size="xs" />Skills</>}>
              <MenuGroup label="Skills">
                {skills.map((s) => (
                  <MenuItem key={s.id} label={s.name} description={s.description} onSelect={() => pick(s)} />
                ))}
              </MenuGroup>
            </Menu>
          )}
          <span className="flex-1" />
          <Button type="submit" variant="primary" size="sm" icon="send" disabled={disabled || (!text.trim() && !pasted)}>Ask</Button>
        </div>
      </form>
      {examples && skills.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-3" aria-label="Examples">
          {skills.slice(0, 3).map((s) => (
            <li key={s.id}>
              <Card padding="none" className="h-full p-3">
                <button type="button" className="flex h-full w-full flex-col items-start gap-1 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus"
                  disabled={disabled} onClick={() => pick(s, true)} data-ask-example={s.id}>
                  <span className="text-meta font-medium text-default">{s.name}</span>
                  <span className="text-meta text-muted">“{s.example}”</span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
