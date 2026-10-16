import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { activeLabels, addLabel, createLabel, toggleLabel } from '../lib/labels'
import type { Label } from '../lib/types'
import { Combobox, ComboboxPanel, LabelChip as UiLabelChip } from '../ui'
import { t } from '../lib/i18n'

/** A label as a chip (the design-system LabelChip), with a remove control when `onRemove` is given. */
export function LabelChip({ label, onRemove }: { label: Label; onRemove?: () => void }) {
  return <UiLabelChip name={label.name} color={label.color} onRemove={onRemove} />
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
    label: t('Label'),
    source: labels,
    getKey: (l: Label) => l.id,
    getLabel: (l: Label) => l.name,
    multiple: true,
    selected: task?.labels ?? [],
    rankContext: 'label',
    emptyText: t('No labels yet. Type a name and press Enter.'),
    renderLeading: (l: Label) => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />,
    onPick: (l: Label) => run(() => toggleLabel(taskId, l.id)),
    onCreate: (name: string) => run(async () => addLabel(taskId, await createLabel({ name }))),
    onClose,
  }
  return (
    <div>
      {inline ? <Combobox {...props} placeholder={t('Add label…')} /> : <ComboboxPanel {...props} placeholder={t('Type to find or create a label…')} />}
      {error && <p role="alert" className="mt-1 text-meta text-danger">{error}</p>}
    </div>
  )
}
