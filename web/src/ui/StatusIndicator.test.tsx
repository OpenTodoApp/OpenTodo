import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusIndicator, toneForHue } from './StatusIndicator'

describe('StatusIndicator (precision-settings D4)', () => {
  it('reads the word and hides the dot', () => {
    const html = renderToStaticMarkup(<StatusIndicator tone="danger">Failing</StatusIndicator>)
    expect(html).toContain('data-status="danger"')
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*bg-danger[^"]*"><\/span><span class="truncate">Failing<\/span>/)
  })

  it('pulses only when motion is allowed', () => {
    const html = renderToStaticMarkup(<StatusIndicator tone="busy">Running</StatusIndicator>)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('motion-reduce:animate-none')
    expect(renderToStaticMarkup(<StatusIndicator tone="ok">On</StatusIndicator>)).not.toContain('animate-pulse')
  })

  it('maps the earlier badge hues', () => {
    expect([toneForHue('green'), toneForHue('orange'), toneForHue('red'), toneForHue('blue'), toneForHue('slate')]).toEqual(['ok', 'warn', 'danger', 'busy', 'off'])
  })
})
