// @vitest-environment happy-dom
// Full task titles (OpenSpec change full-task-titles, GitHub issue 998): a synced
// additive preference applied as an attribute on the root, which the stylesheet turns
// into titles wrapped onto as many lines as they take in list rows, on board cards and
// in Today, at every width.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { fullTitlesOn, setFullTitles } from '../lib/fullTitles'
import { applyOps, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection } from './AppearanceSection'
import { searchSettings } from './settingsIndex'
import css from '../index.css?raw'
import row from './TaskRow.tsx?raw'
import noteRow from './notes/NoteRow.tsx?raw'
import monthRow from './calendar/MonthRow.tsx?raw'
import weekAgenda from './calendar/WeekAgenda.tsx?raw'
import closeDay from './review/CloseDay.tsx?raw'
import carryOver from './review/CarryOver.tsx?raw'
import combobox from '../ui/Combobox/Combobox.tsx?raw'

const root = () => document.documentElement

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  root().removeAttribute('data-titles')
})
afterEach(() => { root().removeAttribute('data-titles') })

describe('preference', () => {
  it('reads "on" as on, anything else as off, and leaves an unknown stored value alone', async () => {
    expect(fullTitlesOn({ full_titles: 'on' })).toBe(true)
    expect(fullTitlesOn({ full_titles: 'wrap' })).toBe(false)
    expect(fullTitlesOn({ full_titles: '' })).toBe(false)
    expect(fullTitlesOn(null)).toBe(false)
    await applyOps([{ id: 't1', entity: 'user_prefs', entityId: 'me', field: 'full_titles', value: 'wrap', ts: Date.now(), device: 'phone' }] as never)
    expect((await db.userPrefs.get('me'))?.full_titles).toBe('wrap')
    expect(await db.outbox.count()).toBe(0)
  })

  it('is written as one op, off as ""', async () => {
    await setFullTitles(true)
    await setFullTitles(false)
    expect((await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)).toEqual(['full_titles=on', 'full_titles='])
  })

  it('the stylesheet lifts the title clamp of rows, cards and the phone row', () => {
    // Every list row, card and Today title is RowTitle's element, clamped to two lines.
    expect(row).toMatch(/line-clamp-2 break-words \$\{tone\}`\} data-row-title/)
    expect(css).toContain(':root[data-titles="full"] [data-row-title] { -webkit-line-clamp: none; line-clamp: none; }')
  })

  it('the phone row keeps the two lines, with its end cell and controls on the first (phone-row-titles)', () => {
    const at = css.indexOf('@media screen and (width < 48rem) {\n  .row-pad')
    expect(at).toBeGreaterThan(0)
    const phone = css.slice(at, css.indexOf('\n}\n', at))
    // No clamp of its own: RowTitle's two lines (above) are the only one.
    expect(phone).toContain('[data-row-title] { font-size: 0.90625rem; }')
    expect(phone).not.toContain('line-clamp')
    expect(phone).toMatch(/\[data-row-props\] \{ grid-area: 1 \/ 2; [^}]*align-self: start; min-height: 1\.25rem;/)
    // The row keeps its 44 px and the controls before the title stay on its first line.
    expect(phone).toContain('.row-pad > [data-row-open] { min-height: 2.75rem; padding-block: 0.75rem; }')
    expect(phone).toContain('.row-pad > :is([data-leading-slot], [data-row-controls], [data-row-time], [data-row-expand]) { margin-top: 0.75rem; }')
  })

  it('the lists outside the task row follow it on a phone (phone-titles-everywhere)', () => {
    // One rule: one line from 768 px, two lines below it, every line with the preference.
    expect(css).toContain('.title-phone { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }')
    const at = css.indexOf('@media screen and (width < 48rem) {\n  .title-phone ')
    expect(at).toBeGreaterThan(0)
    const phone = css.slice(at, css.indexOf('\n}\n', at))
    expect(phone).toContain('.title-phone { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; white-space: normal; overflow-wrap: anywhere; }')
    expect(phone).toContain(':root[data-titles="full"] .title-phone { -webkit-line-clamp: none; line-clamp: none; }')
    // The row around it: its parts on the title's first line, 44 px with one line.
    expect(phone).toContain('.title-phone-row { align-items: baseline; padding-block: calc((var(--title-phone-row, 2.75rem) - 1lh) / 2); }')
    // The lists that use it; a Month cell's row, a Plan column's row and a windowed option keep one line.
    expect(noteRow).toMatch(/user-text title-phone min-w-0 text-body/)
    expect(row).toContain("${large ? 'title-phone' : 'order-first basis-full truncate'}")
    expect(monthRow).toContain("${list ? 'title-phone' : 'truncate'}")
    expect(weekAgenda.match(/title-phone(?!-row)/g)).toHaveLength(2)
    expect(closeDay).toContain('wrap="phone"')
    expect(closeDay).toMatch(/user-text title-phone min-w-0 flex-1 text-body/)
    expect(carryOver).toContain('wrap="phone"')
    expect(combobox).toContain("palette && !windowed ? 'title-phone' : 'block truncate'")
  })

  it('is found by the settings search', () => {
    const user = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'member' as const, createdAt: 1 }
    for (const q of ['full task titles', 'truncate', 'wrap']) {
      const hits = searchSettings(q, user as never).flatMap((h) => h.entries)
      expect(hits.some((e) => e.anchor === 'appearance-titles' && e.page === 'theme')).toBe(true)
    }
  })
})

describe('Appearance → Show full task titles', () => {
  it('applies at once on this device and arrives on another device through sync', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    const toggle = () => document.querySelector<HTMLButtonElement>('#appearance-titles-switch')
    await waitFor(() => !!toggle(), 'the switch')
    expect(toggle()!.getAttribute('aria-checked')).toBe('false')
    expect(root().hasAttribute('data-titles')).toBe(false)
    await click(toggle()!)
    await waitFor(() => root().getAttribute('data-titles') === 'full', 'full titles applied')
    expect(toggle()!.getAttribute('aria-checked')).toBe('true')
    expect((await db.userPrefs.get('me'))?.full_titles).toBe('on')
    // The other device: the op arrives by sync and the root follows without any local write.
    await applyOps([{ id: 't2', entity: 'user_prefs', entityId: 'me', field: 'full_titles', value: '', ts: Date.now() + 1000, device: 'tablet' }] as never)
    await waitFor(() => !root().hasAttribute('data-titles'), 'the synced choice applied')
    expect(toggle()!.getAttribute('aria-checked')).toBe('false')
    await r.unmount()
  })
})
