// The Locations page (OpenSpec change task-locations, "Locations page"): the user's saved
// locations (the `place` entity) in their order, each with its address and its number of open tasks, and a
// map of every place with coordinates when maps are on. A place opens its open tasks
// as a list. Places are created here or with "Save as a place" in a task's location
// editor; rename, move up and down and delete are in each row's menu.
import { type FormEvent, useMemo, useState } from 'react'
import { useOpenTasks } from '../../lib/liveTasks'
import { createPlace, deletePlace, geoOf, linkedPlaceId, parseCoordinates, placeEncrypted, reorderPlaces, updatePlace } from '../../lib/locations'
import type { Place } from '../../lib/types'
import { Button, EmptyState, Input, PageBody, PageHeader, Field } from '../../ui'
import { t } from '../../lib/i18n'
import { act, reportActionError } from '../actionError'
import { ActionMenu, useConfirm, type ActionGroup } from '../menus/ActionMenu'
import { NamePrompt } from '../NamePrompt'
import { navigate } from '../router'
import { LocationMap } from './LocationMap'
import { usePlaces } from './LocationEditor'

/** Inline "new location" form: a name, and optionally an address and coordinates. */
function NewPlaceForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return onDone()
    const geo = coords.trim() ? parseCoordinates(coords) : null
    if (coords.trim() && !geo) { setError(t('Type coordinates as latitude, longitude, such as 45.4642, 9.19.')); return }
    try {
      await createPlace({ name, address, geo })
      onDone()
    } catch (err) {
      reportActionError(err)
    }
  }
  return (
    <form className="mb-4 space-y-2 rounded-control border border-default p-3" onSubmit={submit} data-new-place>
      <Field label={t('Name')}><Input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={t('Home, Office, Gym…')} /></Field>
      <Field label={t('Address')} description={t('Optional')}><Input value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} /></Field>
      <Field label={t('Coordinates')} description={t('Optional, such as 45.4642, 9.19')} error={error || undefined}>
        <Input value={coords} inputMode="decimal" onChange={(e) => { setCoords(e.target.value); setError('') }} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>{t('Add location')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}

function PlaceRow({ place, count, index, total, order }: { place: Place; count: number; index: number; total: number; order: string[] }) {
  const [renaming, setRenaming] = useState(false)
  const confirm = useConfirm()
  const encrypted = placeEncrypted(place)
  const name = encrypted ? t('Encrypted') : place.name || t('Untitled location')
  const move = (to: number) => {
    const next = [...order]
    next.splice(index, 1)
    next.splice(to, 0, place.id)
    act(reorderPlaces(next))
  }
  const groups: ActionGroup[] = [
    { items: [
      { kind: 'action', id: 'rename', label: t('Rename…'), icon: 'pencil', disabled: encrypted, reason: t('Unlock encryption on this device to rename it.'), onSelect: () => setRenaming(true) },
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: index === 0, onSelect: () => move(index - 1) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: index === total - 1, onSelect: () => move(index + 1) },
    ] },
    { items: [
      { kind: 'confirm', id: 'delete', label: t('Delete location'), icon: 'trash-2', tone: 'danger', confirm: {
        title: t('Delete “{name}”?', { name }),
        body: count > 0
          ? t('{n, plural, one {# task keeps showing this location as it was set.} other {# tasks keep showing this location as it was set.}}', { n: count })
          : t('No task is linked to this location.'),
        confirmLabel: t('Delete location'), tone: 'danger', onConfirm: () => deletePlace(place.id),
      } },
    ] },
  ]
  return (
    <li className="group flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-sunken dark:hover:bg-raised" data-place-row={place.id}>
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-1.5 text-left" onClick={() => navigate({ view: 'place', id: place.id })}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-default">{name}</span>
          {!encrypted && place.address && <span className="block truncate text-meta text-muted">{place.address}</span>}
        </span>
        <span className="shrink-0 text-meta tabular-nums text-faint">{t('{n, plural, one {# open task} other {# open tasks}}', { n: count })}</span>
      </button>
      <ActionMenu label={t('Menu for location {name}', { name })} groups={groups} />
      {renaming && (
        <NamePrompt title={t('Rename location')} label={t('Name')} initial={place.name}
          onSubmit={async (n) => { await updatePlace(place.id, { name: n }); setRenaming(false) }} onCancel={() => setRenaming(false)} />
      )}
      {confirm.element}
    </li>
  )
}

export function PlacesView() {
  const places = usePlaces()
  const openTasks = useOpenTasks()
  const [adding, setAdding] = useState(false)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const task of openTasks) {
      const id = linkedPlaceId(task)
      if (id) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [openTasks])
  const points = useMemo(() => places.flatMap((p) => {
    const g = geoOf(p)
    return g && g !== 'encrypted' ? [{ lat: g.lat, lon: g.lon, label: p.name }] : []
  }), [places])
  const order = places.map((p) => p.id)
  return (
    <PageBody width="form" data-places-page>
      <PageHeader title={t('Locations')} meta={places.length} help="locations"
        actions={<Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>{t('New location')}</Button>} />
      {adding && <NewPlaceForm onDone={() => setAdding(false)} />}
      {points.length > 0 && (
        <LocationMap label={t('Map of your locations')} points={points} className="mb-4 h-56 w-full overflow-hidden rounded-control border border-default" />
      )}
      {places.length > 0 && (
        <ul className="space-y-0.5" aria-label={t('Locations')}>
          {places.map((p, i) => <PlaceRow key={p.id} place={p} count={counts.get(p.id) ?? 0} index={i} total={places.length} order={order} />)}
        </ul>
      )}
      {places.length === 0 && !adding && (
        <EmptyState icon="map-pin" title={t('No saved locations yet')}
          body={t('Keep the locations you use often (home, the office, the gym) and give tasks a location in one step. A task’s location editor saves any address for reuse.')}
          control={<Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>{t('New location')}</Button>} />
      )}
    </PageBody>
  )
}
