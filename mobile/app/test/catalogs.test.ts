// The shared i18n layer loads web/src/locales through import.meta.glob, which
// babel/vite-import-meta.js compiles for the app: every shipped catalog loads, and
// messages.json (the translators' source list) is left out as in Vite.
import { fetchCatalog } from '@shared/i18n/catalog'
import { SHIPPED } from '../../../web/src/locales'

describe('the shared catalogs', () => {
  it.each(SHIPPED.filter((l) => l.code !== 'en').map((l) => l.code))('loads %s', async (code) => {
    const catalog = await fetchCatalog(code)
    expect(Object.keys(catalog).length).toBeGreaterThan(100)
  })

  it('has no catalog for the source list', async () => {
    await expect(fetchCatalog('messages' as never)).rejects.toThrow('no catalog for messages')
  })
})
