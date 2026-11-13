// The app's navigation (native-app-everyday 1.1, "Tab navigation"): five tabs, each
// with its own stack, the Inbox count on its tab, and the add button opening capture.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { logicalToday } from '@shared/dates'
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { createTask, getDeviceId } from '@shared/ops'
import { installPlatform } from '@shared/platform'
import type { SignedIn } from '../src/auth/account'
import RootNavigation from '../src/navigation/Root'
import { createPlatform } from '../src/platform'
import { nodeSqlite } from './storage/nodeSqlite'

const signed = {
  account: { server: 'https://todo.example.com', user: { id: 'u1', name: 'Ada', email: 'ada@example.com' }, tokens: { access: 'a', refresh: 'r', expiresAt: 0 } },
  session: { server: 'https://todo.example.com', fetch: async () => new Response('{}'), access: async () => 'a', tokens: () => ({ access: 'a', refresh: 'r', expiresAt: 0 }) },
} satisfies SignedIn

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
  openDatabaseNamed(`navigation-${n++}`)
  await getDeviceId()
})

type Json = { props?: Record<string, unknown>; children?: (Json | string)[] | null }
type Item = { title: string; badge?: string; role?: string }

/** The native tab bar's items, as the app hands them to the platform. */
function tabItems(node: Json | Json[] | string | null = screen.toJSON() as Json | Json[] | null): Item[] | null {
  if (!node || typeof node === 'string') return null
  if (Array.isArray(node)) return node.map((n) => tabItems(n)).find(Boolean) ?? null
  if (Array.isArray(node.props?.items)) return node.props.items as Item[]
  return (node.children ?? []).map((n) => tabItems(n)).find(Boolean) ?? null
}
const badgeOf = (tab: string) => tabItems()?.find((i) => i.title === tab)?.badge

describe('the tabs', () => {
  it('shows five destinations, Today first', async () => {
    await render(<RootNavigation onSignOut={() => undefined} signed={signed} />)
    const items = tabItems()!
    expect(items.map((i) => i.title)).toEqual(['Today', 'Inbox', 'Upcoming', 'Browse', 'Search'])
    expect(items[4]!.role).toBe('search')
    await waitFor(() => expect(screen.getByTestId('today-list')).toBeTruthy())
  })

  it('lists today\'s tasks in Today and counts the Inbox on its tab, live', async () => {
    await createTask({ title: 'Water the plants', due: { date: logicalToday() } })
    await createTask({ title: 'Unsorted idea' })
    await render(<RootNavigation onSignOut={() => undefined} signed={signed} />)
    await waitFor(() => expect(screen.getByText('Water the plants')).toBeTruthy())
    await waitFor(() => expect(badgeOf('Inbox')).toBe('1'))
    await act(async () => { await createTask({ title: 'Another idea' }) })
    await waitFor(() => expect(badgeOf('Inbox')).toBe('2'))
    expect(screen.queryByText('Unsorted idea')).toBeNull()
  })

  it('opens capture from the add button; a task added from Today is due today', async () => {
    await render(<RootNavigation onSignOut={() => undefined} signed={signed} />)
    await waitFor(() => expect(screen.getAllByTestId('add').length).toBeGreaterThan(0))
    await fireEvent.press(screen.getAllByTestId('add')[0]!)
    const field = await screen.findByTestId('capture-title')
    await fireEvent.changeText(field, 'Call the dentist')
    await fireEvent(field, 'submitEditing')
    await waitFor(async () => expect((await db.tasks.toArray()).map((task) => [task.title, task.due?.date])).toEqual([['Call the dentist', logicalToday()]]))
    // The sheet stays open for the next task, with the field empty.
    expect(screen.getByTestId('capture-title').props.value).toBe('')
  })
})
