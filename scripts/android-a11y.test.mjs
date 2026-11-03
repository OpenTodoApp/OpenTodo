// The Android shell's touch targets (OpenSpec accessibility "Native shell accessibility
// checks", change accessibility-aa D6): Android lint has no check for a target's size, so
// this one reads the layouts. A Button, ImageButton or clickable view whose width or
// height is set below 48 dp needs a minWidth / minHeight of at least 48 dp. Lint's own
// accessibility checks (ContentDescription, ClickableViewAccessibility, LabelFor,
// KeyboardInaccessibleWidget) are errors in mobile/android/app/build.gradle.kts.
// Run: node --test scripts/android-a11y.test.mjs (make repo-check)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url).pathname
const layouts = join(root, 'mobile/android/app/src/main/res/layout')
const MIN = 48

/** Every element of a layout: [tag, attributes]. */
export function elements(xml) {
  return [...xml.matchAll(/<([A-Za-z.]+)\s([^>]*?)\/?>/g)].map((m) => [m[1], Object.fromEntries([...m[2].matchAll(/([a-zA-Z:_]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))])
}

const dp = (v) => (/^\d+dp$/.test(v ?? '') ? Number.parseInt(v, 10) : null)

/** Problems of one layout: a clickable control set smaller than 48 dp without a 48 dp minimum. */
export function targetProblems(name, xml) {
  const out = []
  for (const [tag, a] of elements(xml)) {
    const control = /(^|\.)(Image)?Button$/.test(tag) || a['android:clickable'] === 'true'
    if (!control) continue
    for (const [side, min] of [['width', 'minWidth'], ['height', 'minHeight']]) {
      const size = dp(a[`android:layout_${side}`])
      if (size !== null && size > 0 && size < MIN && (dp(a[`android:${min}`]) ?? 0) < MIN) out.push(`${name}: <${tag}${a['android:id'] ? ` ${a['android:id']}` : ''}> is ${size} dp ${side === 'width' ? 'wide' : 'tall'} (at least ${MIN} dp, or android:${min}="${MIN}dp")`)
    }
  }
  return out
}

test('every clickable control of the Android shell is at least 48 dp', () => {
  const problems = readdirSync(layouts).filter((f) => f.endsWith('.xml')).flatMap((f) => targetProblems(f, readFileSync(join(layouts, f), 'utf8')))
  assert.deepEqual(problems, [])
})

test('the size check finds a small button and accepts a 48 dp minimum', () => {
  assert.equal(targetProblems('x.xml', '<ImageButton android:id="@+id/close" android:layout_width="32dp" android:layout_height="32dp" />').length, 2)
  assert.deepEqual(targetProblems('x.xml', '<ImageButton android:layout_width="32dp" android:layout_height="32dp" android:minWidth="48dp" android:minHeight="48dp" />'), [])
  assert.deepEqual(targetProblems('x.xml', '<ImageView android:layout_width="24dp" android:layout_height="24dp" />'), [])
})

test('lint treats the accessibility checks as errors', () => {
  const gradle = readFileSync(join(root, 'mobile/android/app/build.gradle.kts'), 'utf8')
  for (const id of ['ContentDescription', 'ClickableViewAccessibility', 'LabelFor', 'KeyboardInaccessibleWidget']) assert.match(gradle, new RegExp(`"${id}"`), `${id} is not an error`)
})
