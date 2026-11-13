// @vitest-environment happy-dom
// public/browser-check.js (GitHub issue 1259): an engine without the app's CSS gets a
// plain note in its language instead of a broken page; a current one gets nothing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const script = readFileSync(join(__dirname, '../../public/browser-check.js'), 'utf8')

function run(supports: boolean, lang: string, ua: string) {
  document.body.innerHTML = '<div id="root"><p>app</p></div>'
  vi.stubGlobal('CSS', { supports: () => supports })
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(lang)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  new Function(script)()
  return document.querySelector('[data-browser-too-old]')
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('browser-check.js', () => {
  it('leaves a current engine alone', () => {
    expect(run(true, 'en-GB', 'Mozilla/5.0 Chrome/131.0.0.0')).toBeNull()
    expect(document.getElementById('root')!.textContent).toBe('app')
  })

  it('names the minimum and the engine it found, in the browser\'s language', () => {
    const note = run(false, 'zh-CN', 'Mozilla/5.0 (Linux; Android 10; wv) AppleWebKit/537.36 Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36')
    expect(note?.getAttribute('role')).toBe('alert')
    expect(note?.textContent).toContain('111')
    expect(note?.textContent).toContain('Chrome 83.0.4103.106')
    expect(note?.querySelector('h1')?.textContent).toBe('此浏览器版本过旧，无法运行 OpenTodo')
  })

  it('falls back to English and is not added twice', () => {
    run(false, 'sv-SE', 'Mozilla/5.0 Firefox/91.0')
    new Function(script)()
    expect(document.querySelectorAll('[data-browser-too-old]')).toHaveLength(1)
    expect(document.querySelector('h1')?.textContent).toBe('This browser is too old for OpenTodo')
  })
})
