import { describe, expect, it } from 'vitest'

// OpenSpec design-system "Design workbench": the workbench is a development tool
// only, so the production build (embedded in the Go binary) must contain no
// Storybook code. Skipped when the web app has not been built yet.
const built = import.meta.glob<string>('../../../internal/web/dist/**/*.{js,css,html,webmanifest}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('production build', () => {
  it.skipIf(Object.keys(built).length === 0)('contains no workbench code', () => {
    const offenders = Object.entries(built)
      .filter(([, text]) => /storybook/i.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
