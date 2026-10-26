import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OriginChip } from './OriginChip'
import type { Origin } from '../lib/types'

const render = (origin: Origin) => renderToStaticMarkup(createElement(OriginChip, { origin }))

// attachment-client-hardening D3: a decrypted origin URL never passed the
// server's check, so only http(s) becomes a link.
describe('origin chip link', () => {
  it('links an http(s) source', () => {
    expect(render({ kind: 'url', url: 'https://example.com/page' })).toContain('href="https://example.com/page"')
  })

  it('never links another scheme', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', ' JavaScript:alert(1)']) {
      const html = render({ kind: 'url', url })
      expect(html).not.toContain('href=')
    }
  })
})
