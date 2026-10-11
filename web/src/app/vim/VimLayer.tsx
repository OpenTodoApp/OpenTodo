// The optional Vim layer (OpenSpec `vim-keybindings`): mounted by Shell only while
// the per-device switch is on, loaded as its own chunk. It installs one capturing
// keydown listener (dispatch.ts), derives Insert mode from focus, renders the mode
// indicator and the `:` command line, and hands its help section to the `?` overlay.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/db'
import { todayISO } from '../../lib/dates'
import { syncNow } from '../../lib/sync'
import type { Project } from '../../lib/types'
import { navigate, useRoute } from '../router'
import type { HelpSection } from '../ShortcutHelp'
import { isGPending, setGPending } from '../signals'
import { listActions } from './actions'
import { complete, runCommand } from './commands'
import { createDispatcher, isTextField, type Mode } from './dispatch'
import { VIM_HELP } from './help'

/** `i`: the panel renders on the next commit; focus its title once it is there. */
function focusTitle(id: string, tries = 20): void {
  const el = document.querySelector<HTMLInputElement>(`[data-detail-for="${CSS.escape(id)}"] input[aria-label="Title"]`)
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
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at && !p.archived).toArray(), [], [] as Project[])
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

  useEffect(() => {
    const d = createDispatcher({
      actions: listActions,
      gPending: isGPending,
      clearG: () => setGPending(false),
      commandOpen: () => cmdRef.current,
      openCommand: () => openCommand(true),
      focusTitle,
      onPending: setPending,
    })
    const onKey = (e: KeyboardEvent) => void d.handle(e)
    // Capturing, so it sees keys before Shell's and the list's own listeners.
    window.addEventListener('keydown', onKey, true)
    // Insert mode follows focus, so it can never disagree with where keys go.
    let t: ReturnType<typeof setTimeout> | undefined
    const onFocus = () => {
      clearTimeout(t)
      t = setTimeout(() => setTyping(isTextField(document.activeElement)), 0)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onFocus)
      clearTimeout(t)
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
    <div className="border-t border-slate-200 text-xs dark:border-slate-800" data-vim-layer>
      {cmdOpen && (
        <form className="flex items-center gap-1 border-b border-slate-200 px-3 py-1 font-mono dark:border-slate-800"
          onSubmit={(e) => { e.preventDefault(); void run() }}>
          <span aria-hidden>:</span>
          <input
            autoFocus
            data-vim-command
            aria-label="Command"
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
            ? <span role="alert" className="text-red-600 dark:text-red-400">{message}</span>
            : <span className="truncate text-slate-400" aria-label="Completions">{completions.slice(0, 6).join('  ')}</span>}
        </form>
      )}
      <div className="flex items-center gap-2 px-3 py-0.5">
        <span role="status" aria-label="Vim mode" data-vim-mode={mode}
          className={`rounded px-1.5 font-mono font-semibold ${mode === 'insert' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : mode === 'command' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
          {mode.toUpperCase()}
        </span>
        <span className="font-mono text-slate-500" data-vim-pending>{pending}</span>
        <span className="ml-auto text-slate-400"><span className="kbd">:</span> command · <span className="kbd">?</span> help</span>
      </div>
    </div>
  )
}
