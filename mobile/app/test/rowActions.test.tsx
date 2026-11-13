// A row's actions and their Undo (native-app-everyday "Native list gestures"): each is
// one undoable batch, a completed task keeps its place for the grace period, and the
// accessibility actions do what the swipes do.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { logicalToday } from '@shared/dates'
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { createSubtask, createTask, getDeviceId } from '@shared/ops'
import { installPlatform } from '@shared/platform'
import type { Task } from '@shared/types'
import type { SignedIn } from '../src/auth/account'
import { completeTask, scheduleTask, trashTask, undo } from '../src/data/actions'
import RootNavigation from '../src/navigation/Root'
import { createPlatform } from '../src/platform'
import { GRACE_MS, withLingering } from '../src/ui/RowActions'
import { nodeSqlite } from './storage/nodeSqlite'

const TODAY = logicalToday()
let n = 0
beforeEach(async () => {
  const values = new Map<string, string>()
  installPlatform(createPlatform({
    appState: () => 'active',
    onAppState: () => () => undefined,
    onConnected: () => () => undefined,
    storage: { getString: (k) => values.get(k), set: (k, v) => { values.set(k, v) }, remove: (k) => { values.delete(k) } },
    timeZone: () => 'Europe/Rome',
    languages: () => ['en-GB'],
    sql: nodeSqlite(),
  }))
  openDatabaseNamed(`row-actions-${n++}`)
  await getDeviceId()
  await db.meta.put({ key: 'userId', value: 'u1' })
})

const row = async (id: string) => (await db.tasks.get(id))!

describe('the actions', () => {
  it('complete a task with its subtasks, and Undo reopens all of them', async () => {
    const id = await createTask({ title: 'Pack', due: { date: TODAY } })
    const sub = await createSubtask(id, 'Socks')
    const undoId = await completeTask(id)
    expect((await row(id)).completed_at).toBeTruthy()
    expect((await row(sub)).completed_at).toBeTruthy()
    await undo(undoId!)
    expect((await row(id)).completed_at).toBeFalsy()
    expect((await row(sub)).completed_at).toBeFalsy()
    // Completing a completed task changes nothing and offers no Undo.
    await completeTask(id)
    expect(await completeTask(id)).toBeNull()
  })

  it('complete a repeating task by moving it on, and Undo brings its date back', async () => {
    const id = await createTask({ title: 'Water the plants', due: { date: TODAY }, recurrence: 'every day' })
    const undoId = await completeTask(id)
    expect((await row(id)).due?.date).not.toBe(TODAY)
    expect((await row(id)).completed_at).toBeFalsy()
    await undo(undoId!)
    expect((await row(id)).due?.date).toBe(TODAY)
  })

  it('move a task and its subtasks to the Trash, and Undo restores them', async () => {
    const id = await createTask({ title: 'Pack' })
    const sub = await createSubtask(id, 'Socks')
    const undoId = await trashTask(id)
    expect((await row(id)).deleted_at).toBeTruthy()
    expect((await row(sub)).deleted_at).toBeTruthy()
    await undo(undoId!)
    expect((await row(id)).deleted_at).toBeFalsy()
    expect((await row(sub)).deleted_at).toBeFalsy()
  })

  it('give a task a date, or none, and Undo puts the old one back', async () => {
    const id = await createTask({ title: 'Call', due: { date: TODAY, time: '09:30' } })
    const tomorrow = await scheduleTask(await row(id), 'tomorrow')
    expect((await row(id)).due).toMatchObject({ time: '09:30' })
    expect((await row(id)).due?.date).not.toBe(TODAY)
    await undo(tomorrow!)
    expect((await row(id)).due?.date).toBe(TODAY)
    await scheduleTask(await row(id), null)
    expect((await row(id)).due).toBeFalsy()
  })
})

describe('the grace period', () => {
  const task = (id: string) => ({ id, title: id }) as Task
  const sections = (spec: Record<string, string[]>) => Object.entries(spec).map(([key, ids]) => ({ key, data: ids.map(task) }))
  const shape = (list: { key: string; data: Task[] }[]) => Object.fromEntries(list.map((s) => [s.key, s.data.map((t) => t.id)]))

  it('keeps a completed task in its place, and its section when it was the last', () => {
    const before = sections({ earlier: ['a'], day: ['b', 'c', 'd'] })
    const lingering = new Map([['c', task('c')], ['a', task('a')]])
    expect(shape(withLingering(sections({ day: ['b', 'd'] }), before, lingering))).toEqual({ earlier: ['a'], day: ['b', 'c', 'd'] })
    expect(Object.keys(shape(withLingering(sections({ day: ['b', 'd'] }), before, lingering)))).toEqual(['earlier', 'day'])
  })

  it('leaves the list alone when nothing lingers or the task is still listed', () => {
    const now = sections({ day: ['a', 'b'] })
    expect(withLingering(now, now, new Map())).toBe(now)
    expect(withLingering(now, now, new Map([['a', task('a')]]))).toBe(now)
  })
})

const signed = {
  account: { server: 'https://todo.example.com', user: { id: 'u1', name: 'Ada', email: 'ada@example.com' }, tokens: { access: 'a', refresh: 'r', expiresAt: 0 } },
  session: { server: 'https://todo.example.com', fetch: async () => new Response('{}'), access: async () => 'a', tokens: () => ({ access: 'a', refresh: 'r', expiresAt: 0 }) },
} satisfies SignedIn

describe('in the list', () => {
  it('the row\'s Complete action completes it, keeps it in place, and Undo reopens it', async () => {
    const id = await createTask({ title: 'Water the plants', due: { date: TODAY } })
    await render(<RootNavigation onSignOut={() => undefined} signed={signed} />)
    const circle = await screen.findByTestId('complete-Water the plants')
    // The same action a VoiceOver user picks from the row's actions.
    await fireEvent(circle.parent!, 'accessibilityAction', { nativeEvent: { actionName: 'complete' } })
    await waitFor(async () => expect((await row(id)).completed_at).toBeTruthy())
    expect(screen.getByText('Water the plants')).toBeTruthy()
    await fireEvent.press(await screen.findByTestId('undo'))
    await waitFor(async () => expect((await row(id)).completed_at).toBeFalsy())
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('a completed row leaves the list when the grace period ends', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] })
    try {
      await createTask({ title: 'Water the plants', due: { date: TODAY } })
      await render(<RootNavigation onSignOut={() => undefined} signed={signed} />)
      await fireEvent.press(await screen.findByTestId('complete-Water the plants'))
      await screen.findByTestId('toast')
      expect(screen.getByText('Water the plants')).toBeTruthy()
      await act(async () => { jest.advanceTimersByTime(GRACE_MS + 100) })
      await waitFor(() => expect(screen.queryByText('Water the plants')).toBeNull())
      expect(screen.queryByTestId('toast')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })
})
