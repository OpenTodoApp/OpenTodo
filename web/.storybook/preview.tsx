import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/index.css'
import { applyLanguagePreference, currentLanguage } from '../src/lib/i18n'
import { SHIPPED } from '../src/locales'

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

// Language (app-localization D11): loads the catalog through the app's own loader
// before the story renders and sets lang on the document. English is the default,
// so the a11y gate and the visual baselines are unchanged.
const withLanguage = async ({ globals }: { globals: Record<string, unknown> }) => {
  const code = String(globals.locale ?? 'en')
  if (code === currentLanguage()) return
  await applyLanguagePreference(code === 'en' ? 'system' : code).catch(() => undefined)
}

const preview: Preview = {
  decorators: [withTheme],
  loaders: [withLanguage],
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
    locale: {
      description: 'Interface language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: SHIPPED.map((l) => ({ value: l.code, title: l.name })),
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
  initialGlobals: { theme: 'light', width: '1280', locale: 'en' },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
}

export default preview
