import { Icon } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { activeLabels, addLabel, createLabel, toggleLabel } from '../lib/labels'
import type { Label } from '../lib/types'
import { Combobox, ComboboxPanel } from '../ui'

export function LabelChip({ label, onRemove }: { label: Label; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-default px-1.5 py-px text-[11px] text-muted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
      {onRemove && (
        <button type="button" aria-label={`Remove label ${label.name}`} onClick={onRemove} className="ml-0.5 leading-none text-faint hover:text-danger"><Icon name="x" size={10} /></button>
      )}
    </span>
  )
}

/**
 * Label picker for one task (OpenSpec `labels`, rebuilt on the design-system
 * Combobox by `ui-primitives`): labels used recently on this device first, then
 * the rest by position; typing matches by word prefix or fuzzily. Picking toggles
 * the label (one op on the task's `labels` array); "Create “name”" creates and
 * attaches it. The picker stays open for further labels.
 */
export function LabelPicker({ taskId, onClose, inline = false }: { taskId: string; onClose?: () => void; inline?: boolean }) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const labels = useLiveQuery(() => db.labels.toArray().then(activeLabels), [], [] as Label[])
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const props = {
    label: 'Label',
    source: labels,
    getKey: (l: Label) => l.id,
    getLabel: (l: Label) => l.name,
    multiple: true,
    selected: task?.labels ?? [],
    rankContext: 'label',
    emptyText: 'No labels yet. Type a name and press Enter.',
    renderLeading: (l: Label) => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />,
    onPick: (l: Label) => run(() => toggleLabel(taskId, l.id)),
    onCreate: (name: string) => run(async () => addLabel(taskId, await createLabel({ name }))),
    onClose,
  }
  return (
    <div>
      {inline ? <Combobox {...props} placeholder="Add label…" /> : <ComboboxPanel {...props} placeholder="Type to find or create a label…" />}
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
