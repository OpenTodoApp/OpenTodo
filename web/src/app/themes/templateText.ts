// The notes of a theme template in the user's language (OpenSpec change
// themes-layout-template): the file's header, a note per key and seed, and the
// names of the tokens and groups the editor uses. The keys and values of the file
// stay as the format writes them.
import { t } from '../../lib/i18n'
import { THEME_DOCS_URL, type TemplateText } from '../../lib/theme/template'
import { GROUP_NAME, tokenName } from './tokenNames'

export function templateText(from: string): TemplateText {
  const seed: Record<string, () => string> = {
    canvas: () => t('The page behind the cards.'),
    surface: () => t('Cards, rows and dialogs.'),
    text: () => t('Body text.'),
    accent: () => t('Buttons, links, focus and selection.'),
    success: () => t('Done and success messages.'),
    warning: () => t('Warnings and due soon.'),
    danger: () => t('Errors, late tasks and delete.'),
    info: () => t('Information and tips.'),
  }
  return {
    header: [
      t('OpenTodo theme template, made from {name}.', { name: from }),
      t('1. Change the colours: #rrggbb, or oklch(L C H) with L from 0 to 1.'),
      t('2. Import the file: Settings → Appearance → Your themes → Import → Theme file.'),
      t('Lines that start with // are notes: the app ignores them, and trailing commas too.'),
      t('Every colour you leave out is derived from the base colours.'),
      t('The format: {url}', { url: THEME_DOCS_URL }),
    ],
    key: {
      opentodoTheme: t('The format version. Keep 1.'),
      id: t('Letters a-z, digits and hyphens. Importing gives the theme a new id.'),
      name: t('Shown on the theme card, up to 60 characters.'),
      author: t('Credited on the theme card.'),
      licence: t('An SPDX identifier where one applies, such as CC0-1.0 or MIT.'),
      source: t('Where the palette comes from, as text; never opened.'),
      kind: t('light or dark: a theme is one side.'),
      bar: t('The browser and phone bar colour.'),
      notes: t('Shown in the theme\'s details.'),
      shape: t('Corner radii in pixels, 0 to 20.'),
      type: t('family: inter, system, serif or mono, or an installed font by name; list: the list text size, 13, 14 or 15.'),
    },
    seeds: t('Base colours: every other colour follows from these.'),
    statusSeeds: t('Status colours: optional. A line that starts with // is derived.'),
    seed: (name) => seed[name]?.() ?? '',
    tokens: [
      t('Every other colour. A line that starts with // shows the colour derived now;'),
      t('remove the // to set that colour yourself.'),
    ],
    group: (g) => GROUP_NAME[g],
    token: tokenName,
  }
}
