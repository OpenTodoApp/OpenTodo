// Run with: node --test extension/share-url.test.js  (or `make extension`)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MAX_TEXT, MAX_TITLE, buildShareUrl, decodePending, encodePending, filesMessage, isWebUrl, normalizeServer, originPattern, screenshotName } from './share-url.js'

test('normalizeServer keeps only http(s) origins', () => {
  assert.equal(normalizeServer('https://todo.example.com'), 'https://todo.example.com')
  assert.equal(normalizeServer(' https://todo.example.com/some/path?x=1#y '), 'https://todo.example.com')
  assert.equal(normalizeServer('http://192.168.1.10:8080/'), 'http://192.168.1.10:8080')
  assert.equal(normalizeServer('todo.example.com'), 'https://todo.example.com')
  assert.equal(normalizeServer('javascript:alert(1)'), null)
  assert.equal(normalizeServer('ftp://todo.example.com'), null)
  assert.equal(normalizeServer('file:///etc/passwd'), null)
  assert.equal(normalizeServer('https://user:pw@todo.example.com'), null)
  assert.equal(normalizeServer(''), null)
  assert.equal(normalizeServer(undefined), null)
  assert.equal(normalizeServer('http://'), null)
})

test('buildShareUrl puts title, selection and URL on /share', () => {
  const u = new URL(buildShareUrl('https://todo.example.com/', { title: 'A & B', text: 'the quoted paragraph', url: 'https://example.org/post?a=1&b=2' }))
  assert.equal(u.origin, 'https://todo.example.com')
  assert.equal(u.pathname, '/share')
  assert.equal(u.searchParams.get('title'), 'A & B')
  assert.equal(u.searchParams.get('text'), 'the quoted paragraph')
  assert.equal(u.searchParams.get('url'), 'https://example.org/post?a=1&b=2')
})

test('buildShareUrl drops non-web page URLs and empty fields', () => {
  assert.equal(buildShareUrl('https://t.example', { title: '', text: '', url: 'chrome://newtab/' }), 'https://t.example/share')
  const u = new URL(buildShareUrl('https://t.example', { title: 'x', url: 'javascript:alert(1)' }))
  assert.equal(u.searchParams.has('url'), false)
  assert.equal(isWebUrl('about:blank'), false)
  assert.equal(isWebUrl('http://a.example'), true)
})

test('buildShareUrl caps title and selection length', () => {
  const u = new URL(buildShareUrl('https://t.example', { title: 't'.repeat(MAX_TITLE + 50), text: 's'.repeat(MAX_TEXT * 3) }))
  assert.equal(u.searchParams.get('title').length, MAX_TITLE)
  assert.equal(u.searchParams.get('text').length, MAX_TEXT)
})

test('buildShareUrl refuses an invalid server', () => {
  assert.throws(() => buildShareUrl('javascript:alert(1)', { title: 'x' }))
  assert.throws(() => buildShareUrl('', { title: 'x' }))
})

test('first run: a pending capture round-trips through the options page URL', () => {
  const page = { title: 'Fix', text: 'sel', url: 'https://example.org' }
  assert.deepEqual(decodePending(encodePending(page)), page)
  assert.equal(decodePending(''), null)
  assert.equal(encodePending({}), '')
})

test('manifest: MV3, minimal permissions, no host access by default', () => {
  const m = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
  assert.equal(m.manifest_version, 3)
  assert.deepEqual([...m.permissions].sort(), ['activeTab', 'contextMenus', 'scripting', 'storage'])
  assert.equal(m.host_permissions, undefined)
  // Only optional, for the screenshot hand-over, requested for the server origin alone.
  assert.deepEqual(m.optional_host_permissions, ['https://*/*', 'http://*/*'])
  assert.equal(m.optional_permissions, undefined)
  assert.equal(m.content_scripts, undefined)
  assert.equal(m.externally_connectable, undefined)
  assert.ok(m.browser_specific_settings.gecko.id)
})

test('sources make no network requests of their own', () => {
  for (const f of ['background.js', 'options.js', 'share-url.js', 'options.html']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|<script[^>]+src=["']https?:/i, f)
  }
})

test('a screenshot capture opens /share with files=1, or files=denied without access', () => {
  const u = new URL(buildShareUrl('https://t.example', { title: 'Docs', url: 'https://example.org/' }, '1'))
  assert.equal(u.searchParams.get('files'), '1')
  assert.equal(new URL(buildShareUrl('https://t.example', { title: 'Docs' }, 'denied')).searchParams.get('files'), 'denied')
  assert.equal(new URL(buildShareUrl('https://t.example', { title: 'Docs' }, 'other')).searchParams.has('files'), false)
  assert.equal(new URL(buildShareUrl('https://t.example', { title: 'Docs' })).searchParams.has('files'), false)
})

test('the hand-over message has the shape the capture screen accepts', () => {
  const m = filesMessage('data:image/png;base64,AAAA', 'Screenshot.png')
  assert.deepEqual(m, { type: 'opentodo-files', files: [{ name: 'Screenshot.png', type: 'image/png', data: 'data:image/png;base64,AAAA' }] })
  assert.equal(screenshotName(new Date(2026, 9, 15, 9, 5, 3)), 'Screenshot 2026-10-15 09.05.03.png')
})

test('the optional host permission covers only the server origin', () => {
  assert.equal(originPattern('https://todo.example.com/path'), 'https://todo.example.com/*')
  assert.throws(() => originPattern('javascript:alert(1)'))
})

