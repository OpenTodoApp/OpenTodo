// Typed triggers in the editor (OpenSpec change editor-everywhere, design D7, D9):
// `/` at the start of a line or after a space opens the command menu, `@` the
// member completion. The plugin only finds the trigger and the text typed after
// it; the app renders the list and decides what a key does while it is open, so
// the menu is ordinary React (a listbox) and the editor stays framework-free.
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

export type SuggestKind = 'slash' | 'mention'

export interface Suggest {
  kind: SuggestKind
  /** Document range of the trigger and the typed query (`/tab`). */
  from: number
  to: number
  query: string
}

/** The app side of the plugin: told what is open, asked about keys while it is. */
export interface SuggestBridge {
  /** Whether `@` opens member completion (a task with members). */
  mentions: () => boolean
  onChange: (s: Suggest | null, view: EditorView) => void
  /** True when the open list used the key. */
  onKey: (event: KeyboardEvent) => boolean
}

interface PluginState {
  active: Suggest | null
  /** The trigger position the user closed with Escape: stays closed until retyped. */
  dismissed: number | null
}

export const suggestKey = new PluginKey<PluginState>('suggest')

/** The trigger before the caret, if any. */
export function findSuggest(state: EditorState, mentions: boolean): Suggest | null {
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null
  const start = Math.max(0, $from.parentOffset - 64)
  const before = $from.parent.textBetween(start, $from.parentOffset, undefined, '￼')
  // A slash or `@` starts the text block or follows a space; a command query may
  // hold words ("/add column"), a mention query is one token.
  const m = /(^|\s)(\/)([\p{L}\p{N}._-][\p{L}\p{N} ._-]{0,39})?$/u.exec(before) ?? /(^|\s)(@)([\p{L}\p{N}._-]{0,40})$/u.exec(before)
  if (!m || (m[2] === '@' && !mentions)) return null
  const query = m[3] ?? ''
  const len = 1 + query.length
  return { kind: m[2] === '/' ? 'slash' : 'mention', from: $from.pos - len, to: $from.pos, query }
}

/** Close the open list and keep the text (Escape). */
export function dismissSuggest(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(suggestKey, 'dismiss'))
}

export function suggestPlugin(bridge: SuggestBridge): Plugin<PluginState> {
  let last = ''
  return new Plugin<PluginState>({
    key: suggestKey,
    state: {
      init: () => ({ active: null, dismissed: null }),
      apply(tr, prev, _old, next) {
        let dismissed = prev.dismissed === null ? null : tr.mapping.map(prev.dismissed)
        if (tr.getMeta(suggestKey) === 'dismiss' && prev.active) dismissed = prev.active.from
        const found = findSuggest(next, bridge.mentions())
        if (!found) return { active: null, dismissed: null }
        return found.from === dismissed ? { active: null, dismissed } : { active: found, dismissed: null }
      },
    },
    view: (view) => ({
      update: () => {
        const s = suggestKey.getState(view.state)?.active ?? null
        const key = s ? `${s.kind}:${s.from}:${s.query}` : ''
        if (key === last) return
        last = key
        bridge.onChange(s, view)
      },
      destroy: () => {
        if (last) bridge.onChange(null, view)
      },
    }),
    props: {
      handleKeyDown: (view, event) => (suggestKey.getState(view.state)?.active ? bridge.onKey(event) : false),
    },
  })
}
