import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ICONS } from './icons/lucide'

describe('Icon', () => {
  it('is decorative by default: hidden from assistive technology, current colour', () => {
    const html = renderToStaticMarkup(<Icon name="bell" />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).not.toContain('role="img"')
    expect(html).toContain('width="16"')
  })

  it('with a label it is an image with that name', () => {
    const html = renderToStaticMarkup(<Icon name="lock" label="Encrypted" size="lg" />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Encrypted"')
    expect(html).not.toContain('aria-hidden')
    expect(html).toMatch(/stroke-width="1.75"/)
  })

  it('renders the vendored path data', () => {
    expect(renderToStaticMarkup(<Icon name="check" />)).toContain(ICONS.check)
  })
})
