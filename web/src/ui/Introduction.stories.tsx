import type { Meta, StoryObj } from '@storybook/react-vite'

function Introduction() {
  return (
    <div className="max-w-2xl space-y-3 text-body text-default">
      <h1 className="text-h1 font-semibold">OpenTodo design system</h1>
      <p className="text-muted">
        Tokens, foundations and the shared building blocks in <code>web/src/ui</code>: icons, buttons, form controls, menus,
        the smart picker, surfaces and patterns. Every story is checked for accessibility and visual changes in light and dark.
      </p>
      <p>
        How to use them, add an icon or update baselines: <a className="text-accent underline" href="https://github.com/pixari/opentodo/blob/main/docs/design-system.md">docs/design-system.md</a>.
      </p>
    </div>
  )
}

const meta: Meta = { title: 'Introduction' }
export default meta
export const Overview: StoryObj = { render: () => <Introduction /> }
