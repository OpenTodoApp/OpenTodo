// Run with: node --test extension/background.test.js  (or `make extension`)
// What a click captures (OpenSpec change extension-v2, share-capture "Context menu
// on links, images and selections"): the pending capture the background script
// hands to the popup. Nothing is fetched, not even an image.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { captureFromMenu, captureFromTab, descriptionOf, fileNameOf } from './capture.js'
import { MAX_TEXT, MAX_TITLE } from './share-url.js'

const tab = { id: 1, title: 'How to bleed a radiator', url: 'https://blog.example/radiator' }

test('Context menu capture: a selection keeps the tab title and address', () => {
  assert.deepEqual(captureFromMenu({ selectionText: 'Turn the valve a quarter turn' }, tab), {
    title: 'How to bleed a radiator', text: 'Turn the valve a quarter turn', url: 'https://blog.example/radiator', imageUrl: '',
  })
})

test('Link: the link text is the line and the link is the origin', () => {
  const c = captureFromMenu({ linkUrl: 'https://shop.example/kit', linkText: 'Radiator bleeding kit' }, tab)
  assert.deepEqual(c, { title: 'Radiator bleeding kit', text: '', url: 'https://shop.example/kit', imageUrl: '' })
  // Chromium reports no link text: the selection, else the address.
  assert.equal(captureFromMenu({ linkUrl: 'https://shop.example/kit', selectionText: 'kit' }, tab).title, 'kit')
  assert.equal(captureFromMenu({ linkUrl: 'https://shop.example/kit' }, tab).title, 'https://shop.example/kit')
  // A link that is not a web address keeps the tab as the origin.
  assert.equal(captureFromMenu({ linkUrl: 'mailto:a@b.example', linkText: 'Mail us' }, tab).url, tab.url)
})

test('Image: the file name is the line and the address leads the description', () => {
  const c = captureFromMenu({ mediaType: 'image', srcUrl: 'https://cdn.example/docs/boiler-manual.png?v=2' }, tab)
  assert.deepEqual(c, { title: 'boiler-manual.png', text: '', url: tab.url, imageUrl: 'https://cdn.example/docs/boiler-manual.png?v=2' })
  assert.equal(descriptionOf({ ...c }), 'https://cdn.example/docs/boiler-manual.png?v=2\n\nhttps://blog.example/radiator')
  assert.equal(fileNameOf('https://cdn.example/'), 'cdn.example')
  assert.equal(fileNameOf('https://cdn.example/a%20b.jpg'), 'a b.jpg')
  assert.deepEqual(captureFromMenu({ mediaType: 'image', srcUrl: 'data:image/png;base64,xx' }, tab), { title: tab.title, text: '', url: tab.url, imageUrl: '' })
})

test('Protected page: the tab title, no address, no selection', () => {
  assert.deepEqual(captureFromTab({ title: 'Extensions', url: 'chrome://extensions/' }), { title: 'Extensions', text: '', url: '', imageUrl: '' })
})

test('long titles and texts are cut', () => {
  const c = captureFromTab({ title: 't'.repeat(MAX_TITLE + 5), url: tab.url }, 's'.repeat(MAX_TEXT + 5))
  assert.equal(c.title.length, MAX_TITLE)
  assert.equal(c.text.length, MAX_TEXT)
})

test('descriptionOf joins the parts with blank lines', () => {
  assert.equal(descriptionOf({ text: ' sel ', url: 'https://a.example' }), 'sel\n\nhttps://a.example')
  assert.equal(descriptionOf({ url: 'https://a.example' }), 'https://a.example')
  assert.equal(descriptionOf({ text: 'sel', url: 'https://a.example', keepUrl: false }), 'sel')
  assert.equal(descriptionOf(), '')
})

test('the background script registers the four contexts and fetches nothing', () => {
  const src = readFileSync(new URL('./background.js', import.meta.url), 'utf8')
  assert.match(src, /contexts: \['page', 'selection', 'link', 'image'\]/)
  assert.doesNotMatch(src, /\bfetch\(/)
  // The popup opens in the same tick as the click (Firefox needs the gesture).
  assert.match(src, /const stored = ext\.storage\.session\.set\([\s\S]*?const opened = ext\.action\.openPopup\(\)/)
})
