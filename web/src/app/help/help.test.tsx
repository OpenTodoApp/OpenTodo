// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { findTopic, helpSections, loadHelp, searchHelp } from '../../lib/help'
import { SHORTCUTS } from '../../lib/shortcuts'
import { PageHeader } from '../../ui'
import { flush, render } from '../../ui/test-utils'
import { parseRoute, routePath } from '../router'
import { HelpContent } from './HelpContent'
import { HelpHeading, HelpLink } from './HelpLink'
import { HELP_TASKS, HelpView } from './HelpView'
import { closeHelp, openHelp } from './store'
import { applyLanguagePreference } from '../../lib/i18n'

afterEach(() => { document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('Help routes', () => {
  it('parses and builds /help, /help/<guide> and /help?q=', () => {
    expect(parseRoute('/help')).toEqual({ view: 'help' })
    expect(parseRoute('/help/sections-and-boards')).toEqual({ view: 'help', page: 'sections-and-boards' })
    expect(parseRoute('/help?q=board')).toEqual({ view: 'help', q: 'board' })
    expect(routePath({ view: 'help', page: 'views' })).toBe('/help/views')
    expect(routePath({ view: 'help', q: 'repeat weekly' })).toBe('/help?q=repeat%20weekly')
    for (const p of ['/help', '/help/views', '/help?q=x']) expect(routePath(parseRoute(p))).toBe(p)
  })
})

describe('Help bundle', () => {
  it('ships the user guide of this version, without screenshots', async () => {
    const { bundle } = await loadHelp()
    expect(bundle.version).toMatch(/^\d+\.\d+\.\d+$/)
    const slugs = bundle.pages.map((p) => p.slug)
    for (const s of ['getting-started', 'install-app', 'sections-and-boards', 'keyboard', 'troubleshooting']) expect(slugs).toContain(s)
    expect(slugs).not.toContain('api')
    expect(bundle.pages.every((p) => !p.html.includes('<img'))).toBe(true)
    expect(helpSections(bundle)[0].title).toBe('Get started')
  })
  it('finds board sections offline, from local data only', async () => {
    const { entries } = await loadHelp()
    const r = searchHelp(entries, 'board')
    expect(r.length).toBeGreaterThan(0)
    expect(r.some((x) => x.url.startsWith('sections-and-boards'))).toBe(true)
  })
  it('maps every contextual screen to a section and resolves :help topics', async () => {
    const { bundle } = await loadHelp()
    expect(bundle.screens['share-dialog']).toEqual({ page: 'sharing', anchor: 'share-a-project' })
    for (const { page, anchor } of Object.values(bundle.screens)) {
      const p = bundle.pages.find((x) => x.slug === page)
      expect(p).toBeDefined()
      if (anchor) expect(p?.html).toContain(`id="${anchor}"`)
    }
    expect(findTopic(bundle, 'board')?.slug).toBe('sections-and-boards')
    expect(findTopic(bundle, 'keyboard')?.slug).toBe('keyboard')
  })
  it('keeps links between guides inside the app', async () => {
    const { bundle } = await loadHelp()
    const gs = bundle.pages.find((p) => p.slug === 'getting-started')!
    expect(gs.html).toContain('data-doc="install-app"')
    const html = renderToStaticMarkup(<HelpContent page={gs} onOpen={() => {}} />)
    expect(html).toContain('class="help-prose"')
  })
})

describe('Help entry points', () => {
  it('lists g then ? in the shortcut table', () => {
    expect(SHORTCUTS.some((s) => s.keys.includes('g ?'))).toBe(true)
  })
  it('renders Help links with the screen id and an accessible name', () => {
    const html = renderToStaticMarkup(<><HelpLink screen="share-dialog" topic="Sharing" /><HelpHeading screen="settings/password">Password</HelpHeading></>)
    expect(html).toContain('data-help-screen="share-dialog"')
    expect(html).toContain('aria-label="Help: Sharing"')
    expect(html).toContain('<h2 class="font-semibold">Password</h2>')
  })
  it('opens and closes contextual help through the store', () => {
    openHelp('filter')
    closeHelp()
    closeHelp()
  })
})

describe('Help landing (ux-overhaul)', () => {
  it('opens on the search field with eight task entries before the guides', async () => {
    const { bundle } = await loadHelp()
    const slugs = new Set(bundle.pages.map((p) => p.slug))
    expect(HELP_TASKS).toHaveLength(8)
    const r = await render(<HelpView />)
    await waitFor(() => r.container.querySelector('[data-help-tasks]') !== null)
    const search = r.container.querySelector<HTMLInputElement>('input#help-search')!
    expect(document.activeElement).toBe(search)
    const tasks = [...r.container.querySelectorAll<HTMLAnchorElement>('[data-help-task]')]
    expect(tasks).toHaveLength(8)
    for (const a of tasks) {
      const page = a.getAttribute('data-help-task')!
      if (slugs.has(page)) expect(a.getAttribute('target')).toBeNull()
      else expect(a.getAttribute('href')).toMatch(/^https:\/\/open-todo\.app\/docs\//)
    }
    // Task entries come first, then the guide sections.
    const firstGuides = r.container.querySelector('section[aria-labelledby]')!
    expect(r.container.querySelector('[data-help-tasks]')!.compareDocumentPosition(firstGuides) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Each in-app entry lands on a real section.
    for (const t of HELP_TASKS) {
      if (!slugs.has(t.page)) continue
      if (t.anchor) expect(bundle.pages.find((p) => p.slug === t.page)!.html, `${t.page}#${t.anchor}`).toContain(`id="${t.anchor}"`)
    }
    await r.unmount()
  })

  it('page headers offer Help for their screen, and every page and old settings panel has a screen id', async () => {
    const html = renderToStaticMarkup(<PageHeader title="Inbox" help="inbox" />)
    expect(html).toContain('data-help-screen="inbox"')
    expect(html).toContain('aria-label="Help"')
    const { bundle } = await loadHelp()
    for (const id of ['inbox', 'today', 'upcoming', 'anytime', 'someday', 'completed', 'calendar', 'project', 'label', 'labels', 'filters', 'filter', 'saved-filter', 'dashboard', 'trash', 'updates', 'ask', 'task-panel', 'quick-add', 'settings']) {
      expect(bundle.screens[id], id).toBeDefined()
    }
    // Each old settings panel resolves to the Settings page that now holds its section (ux-overhaul 4.8 split the guide).
    const split: Record<string, string> = { 'settings/account': 'settings-you', 'settings/preferences': 'settings-app', 'settings/integrations': 'settings-data', 'settings/admin': 'settings-server', 'settings/session': 'settings-you' }
    for (const [id, page] of Object.entries(split)) {
      expect(bundle.screens[id]?.page, id).toBe(page)
      expect(bundle.screens[id]?.anchor, id).toBeTruthy()
    }
  })
})

describe('Help in another interface language (app-localization)', () => {
  afterEach(async () => { await applyLanguagePreference('en', ['en-US']) })

  it('says the guide is in English in French, and nothing in English', async () => {
    const en = await render(<HelpView />)
    await waitFor(() => en.container.querySelector('[data-help-tasks]') !== null)
    expect(en.container.querySelector('[data-help-english-note]')).toBeNull()
    await en.unmount()
    await applyLanguagePreference('fr', ['en-US'])
    const fr = await render(<HelpView />)
    await waitFor(() => fr.container.querySelector('[data-help-tasks]') !== null)
    expect(fr.container.querySelector('[data-help-english-note]')?.textContent).toBe('Le guide est en anglais.')
    await fr.unmount()
  })
})
