// @vitest-environment happy-dom
// Settings → General → Language (OpenSpec change app-localization, design D3):
// choosing a language writes the synced preference, the provider loads its
// catalog and the interface re-renders in it; a change synced from another device
// does the same; a catalog that cannot load leaves the current language and says so.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { applyLanguagePreference, currentLanguage, useLanguageVersion } from '../lib/i18n'
import { applyOps, resetDeviceId } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { render } from '../ui/test-utils'
import { LanguageProvider } from './LanguageProvider'
import { LanguageSection, LanguageView } from './PreferencesPanels'
import { t } from '../lib/i18n'

function Tree() {
  useLanguageVersion()
  return <><h1>{t('Inbox')}</h1><LanguageSection /></>
}

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 20)) })
/** Waits (inside act) until a catalog chunk has loaded and the tree re-rendered. */
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

let n = 0
beforeEach(() => {
  useDatabase(`lang-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(async () => { await applyLanguagePreference('en', ['en-US']) })

describe('Language panel', () => {
  it('picking Deutsch writes the synced preference and the app re-renders in German', async () => {
    const view = await render(<LanguageProvider><Tree /></LanguageProvider>)
    await settle()
    expect(view.container.querySelector('h1')?.textContent).toBe('Inbox')
    await choose(view.container.querySelector('#language-select') as HTMLSelectElement, 'de')
    await settle()
    expect((await db.userPrefs.get(USER_PREFS_ID))?.language).toBe('de')
    await until(() => view.container.querySelector('h1')?.textContent !== 'Inbox')
    expect(currentLanguage()).toBe('de')
    expect(view.container.querySelector('h1')?.textContent).toBe('Eingang')
    expect(view.container.querySelector('#language-heading')?.textContent).toBe('Sprache')
    await view.unmount()
  })

  it('a language chosen on another device arrives by sync and applies', async () => {
    const view = await render(<LanguageProvider><Tree /></LanguageProvider>)
    await settle()
    await act(async () => {
      await applyOps([{ id: 'l1', entity: 'user_prefs', entityId: 'me', field: 'language', value: 'fr', ts: Date.now() + 10_000, device: 'phone' }])
    })
    await until(() => view.container.querySelector('h1')?.textContent !== 'Inbox')
    expect(view.container.querySelector('h1')?.textContent).toBe('Boîte de réception')
    await view.unmount()
  })

  it('without a synced row the language applied at first paint stays', async () => {
    await applyLanguagePreference('it', ['en-US'])
    const view = await render(<LanguageProvider><Tree /></LanguageProvider>)
    await settle()
    expect(currentLanguage()).toBe('it')
    expect(view.container.querySelector('h1')?.textContent).toBe('In arrivo')
    await view.unmount()
  })

  it('System names the language it resolves to, and every language in its own name', async () => {
    const view = await render(<LanguageView value="system" system="English" onChange={vi.fn()} />)
    const options = [...view.container.querySelectorAll('#language-select option')].map((o) => o.textContent)
    expect(options).toEqual(['System (English)', 'English', 'Deutsch', 'Français', 'Español', 'Italiano', 'Português'])
    await view.unmount()
  })

  it('a catalog that could not be loaded is reported, and loading is announced', async () => {
    const failed = await render(<LanguageView value="de" system="English" status="failed" onChange={vi.fn()} />)
    expect(failed.container.querySelector('[data-language-status="failed"]')?.textContent).toContain('could not be loaded')
    await failed.unmount()
    const loading = await render(<LanguageView value="de" system="English" status="loading" onChange={vi.fn()} />)
    expect(loading.container.querySelector('[role="status"]')?.textContent).toBe('Loading the language…')
    await loading.unmount()
  })
})
