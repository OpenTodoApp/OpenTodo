// Starting the theme editor on a new draft (OpenSpec change theme-editor, design D4,
// D11): the draft is kept on the device first, so the editor opens on it and a
// reload keeps it; nothing is written to the op log until Save.
import { writeDraft } from '../../lib/theme/draft'
import type { ThemeDocument } from '../../lib/theme/format'
import { navigate } from '../router'

/** Opens the editor on an unsaved draft. */
export function openDraft(doc: ThemeDocument): void {
  writeDraft(doc.id, { v: 1, doc, base: null })
  navigate({ view: 'theme-editor', id: doc.id })
}

/** Opens the editor on a saved custom theme (its draft, when this device keeps one). */
export function openTheme(id: string): void {
  navigate({ view: 'theme-editor', id })
}

/** Back to Settings › Appearance, at the Themes row. */
export function backToAppearance(): void {
  navigate({ view: 'settings', section: 'appearance', page: 'theme', anchor: 'appearance-your-themes' })
}
