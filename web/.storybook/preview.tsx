import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/index.css'

// Theme: light and dark set data-theme on the story root; side-by-side renders the
// story twice, one per theme (tokens also apply to [data-theme] subtrees).
// Width: 375 (phone) or 1280 (desktop), matching the visual-regression captures.
const withTheme: Decorator = (Story, ctx) => {
  const theme = (ctx.globals.theme as string) ?? 'light'
  const width = Number(ctx.globals.width ?? 1280)
  const frame = (t: 'light' | 'dark') => (
    <div data-theme={t} className="bg-canvas text-default p-4" style={{ maxWidth: width }}>
      <Story />
    </div>
  )
  if (theme === 'side-by-side') {
    return (
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {frame('light')}
        {frame('dark')}
      </div>
    )
  }
  document.documentElement.setAttribute('data-theme', theme)
  return frame(theme as 'light' | 'dark')
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'side-by-side', title: 'Side by side' },
        ],
        dynamicTitle: true,
      },
    },
    width: {
      description: 'Frame width',
      toolbar: {
        title: 'Width',
        icon: 'mobile',
        items: [
          { value: '375', title: 'Phone 375' },
          { value: '1280', title: 'Desktop 1280' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light', width: '1280' },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
}

export default preview
