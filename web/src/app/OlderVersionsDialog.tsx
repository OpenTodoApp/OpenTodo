// The items whose older versions this device refused (OpenSpec change
// e2ee-rollback, design D4): opened from the line in Settings → End-to-end
// encryption. The list and the titles are this device's own; Clear forgets the
// list and changes nothing else.
import { useEffect, useState } from 'react'
import { Button, Dialog } from '../ui'
import { clearOlderVersions, olderVersionItems, type OlderVersion } from '../lib/e2ee'
import { formatInstant } from '../lib/dates'
import { fieldLabel } from '../lib/history'
import { t } from '../lib/i18n'

interface Row extends OlderVersion {
  name: string
}

export function OlderVersionsList({ rows }: { rows: Row[] }) {
  return (
    <ul className="max-h-80 divide-y divide-default overflow-y-auto" data-testid="older-versions">
      {rows.map((r) => (
        <li key={`${r.entity}:${r.entityId}:${r.field}`} className="flex items-baseline justify-between gap-3 py-2 text-body">
          <span className="min-w-0 truncate text-default">{r.name}</span>
          <span className="shrink-0 text-meta text-muted">{fieldLabel(r.field)} · {formatInstant(r.at, 'datetime')}</span>
        </li>
      ))}
    </ul>
  )
}

export function OlderVersionsDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    let live = true
    void olderVersionItems().then((r) => { if (live) setRows(r) })
    return () => { live = false }
  }, [])
  return (
    <Dialog title={t('Older versions this device kept out')} onClose={onClose} size="md"
      actions={<>
        <Button variant="secondary" onClick={() => void clearOlderVersions().then(onClose)}>{t('Clear')}</Button>
        <Button variant="primary" onClick={onClose}>{t('Done')}</Button>
      </>}>
      {rows && <OlderVersionsList rows={rows} />}
    </Dialog>
  )
}
