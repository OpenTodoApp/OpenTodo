// @vitest-environment happy-dom
// The story seed (fixtures withSeed): a re-render of the mounted story never seeds it again,
// even when a global (the theme) changes the shape of the tree around it.
import 'fake-indexeddb/auto'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '../../ui/test-utils'
import { withSeed } from './fixtures'

type Ctx = { id: string; loaded?: Record<string, unknown> }

describe('withSeed', () => {
  it('seeds once while the story stays mounted, through a light → side by side → dark switch', async () => {
    const seed = vi.fn(async () => {})
    const { loaders, decorators } = withSeed(seed) as unknown as {
      loaders: ((ctx: Ctx) => Promise<Record<string, unknown>>)[]
      decorators: ((Story: () => ReactElement, ctx: Ctx) => ReactElement)[]
    }
    const Story = () => <p>story</p>
    // One render pass as Storybook makes it: the loaders, then the decorated story in the theme frame(s).
    const pass = async (copies: 1 | 2) => {
      const ctx: Ctx = { id: 'tasks--today' }
      ctx.loaded = await loaders[0](ctx)
      const one = () => decorators[0](Story, ctx)
      return copies === 1 ? <div data-theme="light">{one()}</div> : <section><div data-theme="light">{one()}</div><div data-theme="dark">{one()}</div></section>
    }
    const r = await render(await pass(1))
    expect(seed).toHaveBeenCalledTimes(1)
    await r.rerender(await pass(2))
    await r.rerender(await pass(1))
    await r.rerender(await pass(1))
    expect(seed).toHaveBeenCalledTimes(1)
    await r.unmount()
    // A story that mounts afresh (another story, a remount) seeds again.
    await render(await pass(1))
    expect(seed).toHaveBeenCalledTimes(2)
  })
})
