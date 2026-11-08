// The content of the project menu's "List…" step (OpenSpec reusable-lists, design
// D7): the Reusable list and Sort into aisles switches inside the menu's own
// overlay, anchored to the menu, never a modal. Turning aisles on asks once, in
// place, whether to add the missing aisle sections. Editors and above change the
// switches; a viewer sees them disabled. Loaded lazily by listMenu.tsx.
import { useEffect, useState } from 'react'
import { Button, Switch } from '../../ui'
import { t, formatList } from '../../lib/i18n'
import { useProjects } from '../../lib/localData'
import { updateProject } from '../../lib/ops'
import { addAisleSections, aislesToAdd } from '../../lib/reuseAdd'
import { aisleName, type Aisle } from '../../lib/aisles'
import { isReusable, sortsIntoAisles } from '../../lib/reusable'
import { act } from '../actionError'
import { showBulkToast, ACTION_TOAST_MS } from '../bulk/toastStore'

export function ListModeStep({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const project = useProjects().find((p) => p.id === projectId)
  const [offer, setOffer] = useState<Aisle[] | null>(null)
  const reusable = isReusable(project)
  const aisles = sortsIntoAisles(project)
  // Turning the mode off hides the aisle offer with the switch.
  useEffect(() => { if (!aisles) setOffer(null) }, [aisles])
  if (!project) return null
  const setAisles = async (on: boolean) => {
    await updateProject(projectId, { aisles: on })
    if (!on) return
    const missing = await aislesToAdd(projectId)
    if (missing.length) setOffer(missing)
  }
  const create = async () => {
    const n = await addAisleSections(projectId)
    setOffer(null)
    showBulkToast(t('{n, plural, one {Added # aisle section} other {Added # aisle sections}}', { n }), null, { ttl: ACTION_TOAST_MS })
  }
  return (
    <div className="max-w-80 space-y-3 px-2 pt-1 pb-2" data-list-mode>
      <Switch checked={reusable} disabled={!canEdit} onChange={(on) => act(updateProject(projectId, { reusable: on }))}
        label={t('Reusable list')} description={t('Adding an item that’s already here brings it back instead of duplicating it.')} />
      {reusable && (
        <Switch checked={aisles} disabled={!canEdit} onChange={(on) => act(setAisles(on))}
          label={t('Sort into aisles')} description={t('New items go to the aisle section their name suggests.')} />
      )}
      {offer && (
        <div role="group" aria-labelledby="aisle-offer-title" className="space-y-2 rounded-control bg-sunken p-2.5" data-aisle-offer>
          <p id="aisle-offer-title" className="text-body font-medium text-default">{t('Add aisle sections?')}</p>
          <p className="text-meta text-muted">{formatList(offer.map(aisleName))}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => act(create())}>{t('Add sections')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOffer(null)}>{t('Not now')}</Button>
          </div>
        </div>
      )}
      {!canEdit && <p className="text-meta text-muted">{t('Only editors can change this.')}</p>}
    </div>
  )
}
