// @vitest-environment happy-dom
// The nearest step up in a narrow header (OpenSpec change tablet-header-room): a back
// arrow with the step's name, whole or not at all; the task's own title is not a crumb.
import { afterEach, describe, expect, it } from 'vitest'
import { click, render } from '../../ui/test-utils'
import { TaskPath } from './TaskPath'

const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
function nameBox(content: number, box: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => box })
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => content })
}
afterEach(() => {
  if (client) Object.defineProperty(HTMLElement.prototype, 'clientWidth', client)
  if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scroll)
})

describe('the back step of a task path', () => {
  it('shows the nearest parent whole, named by its text, and opens it', async () => {
    nameBox(120, 200)
    const opened: string[] = []
    const r = await render(<TaskPath nearestOnly back project={{ label: 'Home', onClick: () => {} }} parents={[{ id: 'a', title: 'Far' }, { id: 'b', title: 'Order the hinges' }]} current="Measure every door" onOpen={(id) => opened.push(id)} />)
    const step = r.container.querySelector<HTMLElement>('[data-crumb-back]')!
    expect(r.container.querySelectorAll('[data-breadcrumb] button').length).toBe(1)
    expect(r.container.querySelector('[data-crumb="task"]')).toBeNull()
    expect(step.textContent).toBe('Order the hinges')
    expect(step.getAttribute('aria-label')).toBeNull()
    expect(step.getAttribute('data-parent-id')).toBe('b')
    await click(step)
    expect(opened).toEqual(['b'])
    await r.unmount()
  })

  it('a name that does not fit is hidden, and the arrow carries it', async () => {
    nameBox(220, 80)
    const r = await render(<TaskPath nearestOnly back origin={{ label: 'Today', onClick: () => {} }} project={{ label: 'Home renovation with a rather long project name', onClick: () => {} }} parents={[]} current="Task" onOpen={() => {}} />)
    const step = r.container.querySelector<HTMLElement>('[data-crumb-back]')!
    expect(step.getAttribute('data-crumb')).toBe('project')
    expect(step.getAttribute('aria-label')).toBe('Home renovation with a rather long project name')
    expect(step.querySelector('span')!.className).toContain('invisible')
    await r.unmount()
  })

  it('without `back` the phone bar keeps its plain nearest step', async () => {
    const r = await render(<TaskPath nearestOnly project={{ label: 'Home', onClick: () => {} }} parents={[]} current="Task" onOpen={() => {}} />)
    expect(r.container.querySelector('[data-crumb-back]')).toBeNull()
    expect(r.container.querySelector('[data-crumb="project"]')!.textContent).toBe('Home')
    await r.unmount()
  })
})
