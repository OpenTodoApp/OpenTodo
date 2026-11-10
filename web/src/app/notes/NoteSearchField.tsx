// The Notes page's search field (OpenSpec change notes-space, design D6): words and
// filter tokens, each committed token a chip with a remove button. While a token's
// value is typed its values open under the field (the Combobox engine): the arrows
// move, Enter, Tab or a click picks, Escape closes. While a word starts a key, the key
// is offered and Tab completes it, so Enter keeps opening the list's cursor row.
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react'
import { addTokens, chipText, commitTokens, KIND_VALUES, missing, replaceTyping, typingOf, type NoteToken, type TokenWorld } from '../../lib/noteQuery'
import { projectSource } from '../../lib/pickerSources'
import type { Label, Project } from '../../lib/types'
import { ComboboxList, Icon, useCombobox } from '../../ui'
import { t } from '../../lib/i18n'

interface Suggestion { key: string; label: string; path: string[]; color?: string; secondary?: string; token?: NoteToken; word?: string }

/** The `changed:` forms offered, each with its meaning. */
const CHANGED = (): Suggestion[] => [
  { key: 'c:<7d', label: '<7d', secondary: t('In the last 7 days'), path: [] },
  { key: 'c:<30d', label: '<30d', secondary: t('In the last 30 days'), path: [] },
  { key: 'c:>30d', label: '>30d', secondary: t('More than 30 days ago'), path: [] },
  { key: 'c:today', label: 'today', secondary: t('Today'), path: [] },
  { key: 'c:yesterday', label: 'yesterday', secondary: t('Yesterday'), path: [] },
]
const KIND_NAME: Record<string, () => string> = { note: () => t('Standalone notes'), task: () => t('Task notes'), project: () => t('Project notes') }

export interface NoteSearchFieldProps {
  text: string
  onText: (text: string) => void
  tokens: readonly NoteToken[]
  onTokens: (tokens: NoteToken[]) => void
  projects: readonly Project[]
  labels: readonly Label[]
  world: TokenWorld
  inputRef: Ref<HTMLInputElement>
  /** Keys the field does not use itself (the list's cursor: arrows, Enter, Escape). */
  onListKey: (e: KeyboardEvent<HTMLInputElement>) => void
  label: string
  shortcut?: string
}

export function NoteSearchField({ text, onText, tokens, onTokens, projects, labels, world, inputRef, onListKey, label, shortcut }: NoteSearchFieldProps) {
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const pasted = useRef(false)
  const typing = focused ? typingOf(text) : null
  const source = useMemo<Suggestion[]>(() => {
    if (!typing) return []
    if (typing.kind === 'key') return typing.words.map((w) => ({ key: `k:${w}`, label: w, path: [], word: w }))
    switch (typing.key) {
      case 'in': return projectSource(projects.filter((p) => !p.deleted_at && !p.archived), { inbox: false })
        .map((p) => ({ key: `p:${p.key}`, label: p.label, path: p.path, color: p.color, token: { key: 'in', id: String(p.value), name: p.label } }))
      case 'label': return labels.filter((l) => !l.deleted_at).map((l) => ({ key: `l:${l.id}`, label: l.name, path: [], color: l.color, token: { key: 'label', id: l.id, name: l.name } }))
      case 'kind': return KIND_VALUES.map((k) => ({ key: `k:${k}`, label: k, secondary: KIND_NAME[k](), path: [], token: { key: 'kind', value: k } }))
      case 'linked': return world.notes.filter((n) => !n.deleted_at).map((n) => ({ key: `n:${n.id}`, label: n.title?.trim() || t('Untitled note'), path: [], token: { key: 'linked', id: n.id, name: n.title ?? '' } }))
      case 'changed': return CHANGED().map((c) => ({ ...c, token: { key: 'changed', value: c.label } }))
    }
  }, [typing?.kind, typing?.kind === 'value' ? typing.key : typing?.words.join(), projects, labels, world.notes]) // eslint-disable-line react-hooks/exhaustive-deps -- typing is new each render; its key and words decide the source
  const pick = (s: Suggestion) => {
    if (!typing) return
    if (s.word) {
      // A key: its value is typed next; a key without a value is a chip at once.
      const next = replaceTyping(text, typing, s.word.endsWith(':') ? s.word : `${s.word} `)
      change(next)
    } else if (s.token) {
      onTokens(addTokens(tokens, [s.token]))
      onText(replaceTyping(text, typing, ''))
    }
  }
  const state = useCombobox<Suggestion>({
    source, getKey: (s) => s.key, getLabel: (s) => s.label, getPath: (s) => s.path, getSecondary: (s) => s.secondary,
    rankContext: typing?.kind === 'value' ? `notes.token.${typing.key}` : undefined, limit: 8,
    onPick: pick, onClose: () => setDismissed(text),
  })
  const query = typing?.kind === 'value' ? typing.value : ''
  const { setQuery } = state
  useEffect(() => { setQuery(query) }, [query, setQuery])
  const open = !!typing && dismissed !== text && state.options.length > 0

  function change(next: string) {
    const all = pasted.current
    pasted.current = false
    const done = commitTokens(next, world, all)
    if (done.tokens.length) onTokens(addTokens(tokens, done.tokens))
    onText(done.text)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) { state.onKeyDown(e); return }
    if (open && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); void state.pick(state.options[state.activeIndex]); return }
    if (open && e.key === 'Enter' && typing?.kind === 'value') { state.onKeyDown(e); return }
    if (e.key === 'Backspace' && text === '' && tokens.length > 0) { e.preventDefault(); onTokens(tokens.slice(0, -1)); return }
    onListKey(e)
  }
  return (
    <div className="relative min-w-0 flex-[1_1_14rem]" data-note-search-field>
      <div className="ui-input flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 py-1 pl-2 focus-within:ring-2 focus-within:ring-focus/30"
        onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus() } }}>
        <Icon name="search" className="pointer-events-none shrink-0 text-faint" />
        {tokens.map((tk, i) => {
          const c = chipText(tk, world)
          const gone = missing(tk, world)
          const name = `${c.key}${c.value ? ` ${c.value}` : ''}`
          return (
            <span key={`${tk.key}:${'id' in tk ? tk.id : 'value' in tk ? tk.value : ''}`} data-note-chip={tk.key}
              className={`inline-flex max-w-48 min-w-0 items-center gap-1 rounded-chip bg-sunken px-1.5 py-px text-meta text-default dark:bg-raised ${gone ? 'line-through text-faint' : ''}`}>
              <span className="truncate"><span className="text-muted">{c.key}</span>{c.value ? ` ${c.value}` : ''}</span>
              <button type="button" aria-label={t('Remove {name}', { name })} data-touch-exempt="hit-area" style={{ minWidth: 0, minHeight: 0 }}
                onClick={() => onTokens(tokens.filter((_, j) => j !== i))}
                className="relative rounded-chip leading-none text-faint after:absolute after:-inset-[14px] hover:text-default focus-visible:outline-2 focus-visible:outline-focus"><Icon name="x" size={10} /></button>
            </span>
          )
        })}
        <input ref={inputRef} type="search" role="combobox" aria-expanded={open} aria-controls={state.listboxId} aria-autocomplete="list"
          aria-activedescendant={open ? state.optionId(state.activeIndex) : undefined}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-body text-default outline-none placeholder:text-faint" aria-label={label} placeholder={tokens.length ? '' : label}
          aria-keyshortcuts={shortcut} value={text} data-note-search autoComplete="off" spellCheck={false}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onPaste={(_e: ClipboardEvent<HTMLInputElement>) => { pasted.current = true }}
          onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown} />
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-popover border border-default bg-pop shadow-3" data-note-suggestions>
          <ComboboxList state={state} label={t('Suggestions')}
            renderLeading={(s) => (s.color ? <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} /> : null)} />
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">{state.announcement}</span>
    </div>
  )
}
