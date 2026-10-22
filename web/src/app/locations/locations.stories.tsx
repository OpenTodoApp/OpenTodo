import type { Meta, StoryObj } from '@storybook/react-vite'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { createPlace, makeLocation, setTaskLocation } from '../../lib/locations'
import { createTask } from '../../lib/ops'
import { seeded, storyUser, withSeed } from '../stories/fixtures'
import { TaskListView } from '../TaskListView'
import { LocationEditor } from './LocationEditor'
import { PlacesView } from './PlacesView'

// Task locations (OpenSpec change task-locations): the location editor and the
// Locations page, with maps off as in the workbench (no map proxy here), so they
// show what every device shows without a map.
const meta: Meta = { title: 'Screens/Locations' }
export default meta

function Editor({ id }: { id: string }) {
  const task = useLiveQuery(() => db.tasks.get(id), [id])
  return task ? <div className="max-w-md rounded-card border border-default bg-surface p-4"><LocationEditor task={task} onClose={() => undefined} /></div> : null
}

/** A task linked to the saved location "Office": its name, address and coordinates, Open in maps and Unlink. */
export const EditorWithSavedLocation: StoryObj = {
  name: 'Editor, saved location',
  ...withSeed(async () => {
    const office = await createPlace({ name: 'Office', address: 'Via Roma 1, 10121 Torino, Italia', geo: { lat: 45.0703, lon: 7.6869 } })
    await createPlace({ name: 'Gym', address: 'Corso Francia 12, Torino' })
    seeded.task = await createTask({ title: 'Print the slides' })
    await setTaskLocation(seeded.task, makeLocation({ name: 'Office', address: 'Via Roma 1, 10121 Torino, Italia', lat: 45.0703, lon: 7.6869, place_id: office }))
  }),
  render: () => <Editor id={seeded.task} />,
}

/** A task without a location: the search field, the saved locations and Use my location. */
export const EditorEmpty: StoryObj = {
  name: 'Editor, no location',
  ...withSeed(async () => {
    await createPlace({ name: 'Home', address: 'Via Po 2, Torino' })
    seeded.task = await createTask({ title: 'Water the plants' })
  }),
  render: () => <Editor id={seeded.task} />,
}

/** The Locations page with three saved locations and their open tasks. */
export const LocationsPage: StoryObj = {
  name: 'Locations page',
  ...withSeed(async () => {
    const office = await createPlace({ name: 'Office', address: 'Via Roma 1, 10121 Torino, Italia', geo: { lat: 45.0703, lon: 7.6869 } })
    await createPlace({ name: 'Gym', address: 'Corso Francia 12, Torino' })
    await createPlace({ name: 'Parcel locker', address: '', geo: { lat: 45.06, lon: 7.67 } })
    for (const title of ['Print the slides', 'Book the meeting room']) {
      const id = await createTask({ title })
      await setTaskLocation(id, makeLocation({ name: 'Office', place_id: office }))
    }
  }),
  render: () => <div className="-m-4 bg-canvas"><PlacesView /></div>,
}

/** A saved location's page (`/location/<id>`, screen-stories-rare D1): the tasks linked to "Office". */
export const LocationPage: StoryObj = {
  ...withSeed(async () => {
    seeded.place = await createPlace({ name: 'Office', address: 'Via Roma 1, 10121 Torino, Italia', geo: { lat: 45.0703, lon: 7.6869 } })
    const at = makeLocation({ name: 'Office', address: 'Via Roma 1, 10121 Torino, Italia', lat: 45.0703, lon: 7.6869, place_id: seeded.place })
    for (const title of ['Print the slides', 'Return the badge', 'Water the office plants']) await setTaskLocation(await createTask({ title }), at)
  }),
  render: () => <div className="-m-4 h-[40rem] overflow-y-auto bg-canvas"><TaskListView route={{ view: 'place', id: seeded.place }} userId={storyUser.id} userRole={storyUser.role} /></div>,
}
