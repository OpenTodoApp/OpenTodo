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

  it('draws the mono mark in the text colour with the closing stroke in the accent', () => {
    const { body } = brandSymbol(source, 'mono')
    expect(body).toContain('stroke="currentColor"')
    expect(body).toContain('var(--ot-accent-text')
    expect(body).toContain('stroke-width="2"')
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
