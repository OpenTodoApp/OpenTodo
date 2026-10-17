// The optional Vim layer (OpenSpec `vim-keybindings`): mounted by Shell only while
// the per-device switch is on, loaded as its own chunk. It installs one capturing
// keydown listener (dispatch.ts), derives Insert mode from focus, renders the mode
// indicator and the `:` command line, and hands its help section to the `?` overlay.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjects } from '../../lib/localData'
import { visibleProjects } from '../../lib/projects'
import { todayISO } from '../../lib/dates'
import { syncNow } from '../../lib/sync'
import { navigate, useRoute } from '../router'
import type { HelpSection } from '../ShortcutHelp'
import { isGPending, setGPending } from '../signals'
import { useShortcutScope } from '../shortcuts'
import { Kbd } from '../shortcuts/Kbd'
import { listActions } from './actions'
import { complete, runCommand } from './commands'
import { createDispatcher, isTextField, type Mode } from './dispatch'
import { VIM_HELP } from './help'
import { t } from '../../lib/i18n'

/**
 * `i`: the panel renders on the next commit; focus its title once it is there.
 * Found by a data attribute, not the translated label, so it works in every language.
 */
export function focusTitle(id: string, tries = 20): void {
  const el = document.querySelector<HTMLInputElement>(`[data-detail-for="${CSS.escape(id)}"] input[data-task-title]`)
  if (el && !el.disabled) {
    el.focus()
    const end = el.value.length
    el.setSelectionRange?.(end, end)
  } else if (tries > 0) setTimeout(() => focusTitle(id, tries - 1), 25)
}

export default function VimLayer({ userId, onHelp, onHelpTopic, onHelpSection }: {
  userId?: string
  onHelp: () => void
  /** `:help <topic>`: open the Help view on that topic (user-documentation). */
  onHelpTopic?: (topic: string) => void
  onHelpSection: (section: HelpSection | null) => void
}) {
  const route = useRoute()
  const all = useProjects()
  const projects = useMemo(() => visibleProjects(all), [all])
  const [pending, setPending] = useState('')
  const [typing, setTyping] = useState(() => isTextField(document.activeElement))
  const [cmdOpen, setCmdOpen] = useState(false)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const cmdRef = useRef(false)

  const openCommand = (open: boolean) => {
    cmdRef.current = open
    setCmdOpen(open)
    setText('')
    setMessage(null)
  }

  useEffect(() => {
    onHelpSection(VIM_HELP)
    return () => onHelpSection(null)
  }, [onHelpSection])

  // The Vim machine runs inside the shell's dispatcher as the `vim` scope's
  // capturing frame (keyboard-shortcuts): it sees every key first, consumes only
  // its own, and shares the `g` prefix with the dispatcher (`g g` is ours, `g t` is
  // navigation). The registry lists its bindings under "Vim keybindings".
  const [machine] = useState(() => createDispatcher({
    actions: listActions,
    gPending: isGPending,
    clearG: () => setGPending(false),
    commandOpen: () => cmdRef.current,
    openCommand: () => openCommand(true),
    focusTitle,
    onPending: setPending,
  }))
  useShortcutScope('vim', {}, { capture: true, any: (e) => machine.handle(e) })

  useEffect(() => {
    // Insert mode follows focus, so it can never disagree with where keys go.
    let item: ReturnType<typeof setTimeout> | undefined
    const onFocus = () => {
      clearTimeout(item)
      item = setTimeout(() => setTyping(isTextField(document.activeElement)), 0)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onFocus)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onFocus)
      clearTimeout(item)
    }
  }, [])

  const completions = useMemo(() => (cmdOpen ? complete(text, projects) : []), [cmdOpen, text, projects])
  const mode: Mode = cmdOpen ? 'command' : typing ? 'insert' : 'normal'

  async function run() {
    const res = await runCommand(text, {
      route,
      today: todayISO(),
      userId,
      projects,
      navigate,
      closePanel: () => listActions()?.closePanel(),
      sync: syncNow,
      help: onHelp,
      helpTopic: (topic: string) => (onHelpTopic ? onHelpTopic(topic) : onHelp()),
    })
    // An unknown or incomplete command keeps the line open for correction.
    if (res.ok) openCommand(false)
    else setMessage(res.message)
  }

  return (
    <div className="border-t border-default text-meta" data-vim-layer>
      {cmdOpen && (
        <form className="flex items-center gap-1 border-b border-default px-3 py-1 font-mono"
          onSubmit={(e) => { e.preventDefault(); void run() }}>
          <span aria-hidden>:</span>
          <input
            autoFocus
            data-vim-command
            aria-label={t('Command')}
            className="min-w-0 flex-1 bg-transparent focus:outline-none"
            value={text}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => { setText(e.target.value); setMessage(null) }}
            onBlur={() => openCommand(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                openCommand(false)
              } else if (e.key === 'Tab') {
                e.preventDefault()
                if (completions[0]) setText(completions[0])
              }
            }}
          />
          {message
            ? <span role="alert" className="text-danger">{message}</span>
            : <span className="truncate text-faint"><span className="sr-only">{t('Completions')} </span>{completions.slice(0, 6).join('  ')}</span>}
        </form>
      )}
      <div className="flex items-center gap-2 px-3 py-0.5">
        <span role="status" aria-label={t('Vim mode')} data-vim-mode={mode}
          className={`rounded-control px-1.5 font-mono font-semibold ${mode === 'insert' ? 'bg-accent-soft text-on-accent-soft' : mode === 'command' ? 'bg-warning-soft text-on-warning-soft' : 'bg-sunken dark:bg-raised text-muted'}`}>
          {mode.toUpperCase()}
        </span>
        <span className="font-mono text-muted" data-vim-pending>{pending}</span>
        <span className="ml-auto text-faint">{t.rich('{kbd} command · {kbd2} help', { kbd: <Kbd k=":" />, kbd2: <Kbd k="?" /> })}</span>
      </div>
    </div>
  )
}
