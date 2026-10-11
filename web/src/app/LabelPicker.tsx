import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { activeLabels, addLabel, createLabel, labelKey, toggleLabel } from '../lib/labels'
import type { Label } from '../lib/types'

export function LabelChip({ label, onRemove }: { label: Label; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-1.5 py-px text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
      {onRemove && (
        <button type="button" aria-label={`Remove label ${label.name}`} onClick={onRemove} className="ml-0.5 leading-none text-faint hover:text-red-600">×</button>
      )}
    </span>
  )
}

/**
 * Type-ahead label picker for one task: Enter toggles the highlighted label or creates
 * a missing one and attaches it; the picker stays open for further labels. The input
 * is a real <input>, so the global single-key shortcuts are suppressed while typing.
 */
export function LabelPicker({ taskId, onClose, inline = false }: { taskId: string; onClose?: () => void; inline?: boolean }) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const labels = useLiveQuery(() => db.labels.toArray().then(activeLabels), [], [] as Label[])
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [focused, setFocused] = useState(!inline)
  const [error, setError] = useState<string | null>(null)

  const key = labelKey(q)
  const matches = key ? labels.filter((l) => labelKey(l.name).includes(key)) : labels
  const exact = labels.some((l) => labelKey(l.name) === key)
  const options: (Label | null)[] = key && !exact ? [...matches, null] : matches // null = "create"
  const selected = new Set(task?.labels ?? [])
  useEffect(() => setHi(0), [q])

  async function pick(opt: Label | null | undefined) {
    if (opt === undefined) return
    setError(null)
    try {
      if (opt) await toggleLabel(taskId, opt.id)
      else await addLabel(taskId, await createLabel({ name: q }))
      setQ('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const open = focused || !inline
  return (
    <div className="relative" onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}>
      <input
        className="input"
        autoFocus={!inline}
        placeholder={inline ? 'Add label…' : 'Type to find or create a label…'}
        aria-label="Label"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
          else if (e.key === 'Enter') { e.preventDefault(); void pick(options[hi]) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (onClose) onClose(); else (e.target as HTMLInputElement).blur() }
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {open && (
        <ul role="listbox" aria-label="Labels" className={`max-h-56 overflow-y-auto py-1 text-sm ${inline ? 'absolute left-0 right-0 z-10 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900' : ''}`}>
          {options.map((l, i) => (
            <li key={l?.id ?? '__new'} role="option" aria-selected={l ? selected.has(l.id) : false}
              onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(l)} onMouseEnter={() => setHi(i)}
              className={`touch-target flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left ${i === hi ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                {l ? (
                  <>
                    <span className="w-4 text-center text-emerald-700 dark:text-emerald-400">{selected.has(l.id) ? '✓' : ''}</span>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="flex-1 truncate">{l.name}</span>
                  </>
                ) : (
                  <><span className="w-4 text-center text-emerald-700 dark:text-emerald-400">+</span><span>Create “{q.trim()}”</span></>
                )}
            </li>
          ))}
          {options.length === 0 && <li className="px-2 py-1.5 text-xs text-faint">No labels yet. Type a name and press Enter.</li>}
        </ul>
      )}
    </div>
  )
}
