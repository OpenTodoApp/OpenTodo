// @vitest-environment happy-dom
// The brand source and its components (OpenSpec change sidebar-v2, design D2, D3).
import { describe, expect, it } from 'vitest'
import source from './brand.svg?raw'
import { BrandMark, BrandWordmark, brandSymbol } from './Brand'
import { render } from '../test-utils'

describe('brand.svg', () => {
  it('stays under 2 KB with the licence note', () => {
    expect(new TextEncoder().encode(source).length).toBeLessThan(2048)
    expect(source).toContain('AGPL-3.0')
  })

  it('holds the mono and colour symbols and no text', () => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
    expect([...doc.querySelectorAll('symbol')].map((s) => s.id)).toEqual(['mono', 'colour'])
    expect(doc.querySelector('text')).toBeNull()
    expect(brandSymbol(source, 'mono').viewBox).toBe('0 0 24 24')
    expect(brandSymbol(source, 'colour').viewBox).toBe('0 0 64 64')
  })

  // The tray mark (OpenSpec change brand-mark-tray, design D1 and D2).
  const TRAY = 'M6 11.5 4.5 13v4.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13L18 11.5'
  const TICK = 'm8 8 4 4 7.5-7.5'
  const paths = (id: 'mono' | 'colour') => {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${brandSymbol(source, id).body}</svg>`, 'image/svg+xml')
    return [...doc.querySelectorAll('path')]
  }

  it('draws the mono tray in the text colour and the tick in the accent', () => {
    const { body } = brandSymbol(source, 'mono')
    expect(body).toContain('stroke-width="2"')
    const [tray, tick] = paths('mono')
    expect(tray.getAttribute('d')).toBe(TRAY)
    expect(tray.getAttribute('stroke')).toBe('currentColor')
    expect(tick.getAttribute('d')).toBe(TICK)
    expect(tick.getAttribute('style')).toContain('var(--ot-accent-text')
  })

  it('draws the colour mark as a white tray and an emerald tick, centred on the slate square', () => {
    const { body } = brandSymbol(source, 'colour')
    expect(body).toContain('fill="#0f172a"')
    expect(body).toContain('transform="translate(8 8) scale(2)"')
    const [tray, tick] = paths('colour')
    expect([tray.getAttribute('d'), tray.getAttribute('stroke')]).toEqual([TRAY, '#ffffff'])
    expect([tick.getAttribute('d'), tick.getAttribute('stroke')]).toEqual([TICK, '#34d399'])
  })
})

describe('BrandMark', () => {
  it('inherits the parent colour and is hidden when decorative', async () => {
    const { container } = await render(<span className="text-muted"><BrandMark size={16} /></span>)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.querySelector('[stroke="currentColor"]')).not.toBeNull()
  })

  it('is named by its title', async () => {
    const { container } = await render(<BrandMark title="OpenTodo" variant="colour" size={32} />)
    const svg = container.querySelector('svg[role="img"]')!
    expect(svg.getAttribute('aria-label')).toBe('OpenTodo')
    expect(svg.getAttribute('data-brand-mark')).toBe('colour')
  })
})

describe('BrandWordmark', () => {
  it('is the text OpenTodo in the strong tone', async () => {
    const { container } = await render(<BrandWordmark />)
    expect(container.textContent).toBe('OpenTodo')
    expect(container.firstElementChild!.className).toContain('text-strong')
  })
})
