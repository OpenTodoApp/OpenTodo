import type { Meta, StoryObj } from '@storybook/react-vite'
import type { PublicList } from '../lib/types'
import { PublicListScreen } from './PublicListScreen'
import { answerRequests, FROZEN_ISO, HEX, TODAY, TOMORROW, withClock } from './stories/fixtures'

// Rare screens (OpenSpec change screen-stories-rare, design D2, D4): a project's
// public link as a visitor without an account sees it, and its e-ink display.
const meta: Meta = { title: 'Screens/Public list', decorators: [withClock], parameters: { layout: 'fullscreen' } }
export default meta

const task = (id: string, title: string, over: Partial<PublicList['tasks'][number]> = {}): PublicList['tasks'][number] =>
  ({ id, title, due: null, priority: 4, section_id: null, parent_id: null, position: 0, completed_at: null, ...over })
const list: PublicList = {
  projectName: 'Allotment', projectColor: HEX.green, rights: 'tick', serverTime: Date.parse(FROZEN_ISO),
  sections: [{ id: 's1', name: 'This week', position: 1 }, { id: 's2', name: 'Before winter', position: 2 }],
  tasks: [
    task('t1', 'Water the tomatoes', { due: { date: TODAY }, section_id: 's1', position: 1 }),
    task('t2', 'Pick the last beans', { due: { date: TOMORROW }, section_id: 's1', position: 2 }),
    task('t3', 'Turn the compost', { section_id: 's1', position: 3, completed_at: Date.parse('2026-10-13T17:00:00') }),
    task('t4', 'Cover the raised beds', { section_id: 's2', position: 1, priority: 2 }),
    task('t5', 'Plant garlic', { section_id: 's2', position: 2 }),
    task('t6', 'Buy straw', { section_id: 's2', position: 3, parent_id: 't4' }),
  ],
}
const answer = () => answerRequests({ '/api/v1/public/': { body: list } })

/** The list with its sections; anyone with the link may tick items. */
export const List: StoryObj = { beforeEach: answer, render: () => <PublicListScreen token="otl_story" /> }

/** The same link as an e-ink display (`?display=1&eink=1`): the address carries the options. */
export const EinkDisplay: StoryObj = {
  beforeEach: () => {
    answer()
    const before = location.href
    const url = new URL(before)
    url.searchParams.set('display', '1')
    url.searchParams.set('eink', '1')
    history.replaceState(history.state, '', url)
    return () => history.replaceState(history.state, '', before)
  },
  render: () => <PublicListScreen token="otl_story" />,
}
