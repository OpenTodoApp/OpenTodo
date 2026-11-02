// Download a template (OpenSpec change themes-layout-template): the theme resolved
// off the main thread, then written as a template with notes in the user's
// language and offered as a file, all on the device.
import type { ThemeDocument } from '../../lib/theme/format'
import { createResolver } from '../../lib/theme/resolver'
import { downloadTemplate, themeTemplate } from '../../lib/theme/template'
import { templateText } from './templateText'

/** The template text of `doc`, made from the theme named `from`. */
export async function templateOf(doc: ThemeDocument, from: string): Promise<string> {
  const resolver = createResolver()
  try {
    const r = await resolver.resolve(doc)
    return themeTemplate(doc, r?.resolved ?? null, templateText(from))
  } finally {
    resolver.dispose()
  }
}

export async function downloadThemeTemplate(doc: ThemeDocument, from: string): Promise<void> {
  downloadTemplate(await templateOf(doc, from), doc.name)
}
