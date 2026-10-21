// Settings → About in a native shell (OpenSpec change native-shells, "Older shell").
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShellAppRow } from './AboutSection'

describe('the shell app in Settings → About', () => {
  it('shows nothing in a browser', () => {
    expect(renderToStaticMarkup(<ShellAppRow app={null} />)).toBe('')
  })

  it('names the Android app and its version', () => {
    const html = renderToStaticMarkup(<ShellAppRow app={{ platform: 'android', version: '0.10.0', outdated: false }} />)
    expect(html).toContain('OpenTodo for Android')
    expect(html).toContain('0.10.0')
    expect(html).not.toContain('older than this server expects')
  })

  it('says when the app is older than this server expects', () => {
    const html = renderToStaticMarkup(<ShellAppRow app={{ platform: 'android', version: '0.9.2', outdated: true }} />)
    expect(html).toContain('This app is older than this server expects.')
  })
})
