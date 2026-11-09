// Print… in a list's menu (OpenSpec change print-lists): the browser's own print, also
// for the installed app, which has no browser menu. The print stylesheet in index.css
// lays the list out; this only starts it. The native shells' web views do not print,
// so there the item is left out.
import { t } from '../../lib/i18n'
import { shell } from '../../lib/shell'
import { MenuItem } from '../../ui'
import type { ActionItem } from './ActionMenu'

/** Whether this window can print (a browser or the installed app, not a native shell). */
export function canPrint(): boolean {
  return !shell()
}

/** Prints the page once the menu has closed, so the printout never shows it. */
export function printList(): void {
  requestAnimationFrame(() => window.print())
}

/** The item for menus described as data (the project, label and saved view menus), or none. */
export function printItems(): ActionItem[] {
  return canPrint() ? [{ kind: 'action', id: 'print', label: t('Print…'), icon: 'printer', onSelect: printList }] : []
}

/** The same item in a page header's overflow menu (Today, Upcoming, the Inbox …), or nothing. */
export function PrintMenuItem() {
  return canPrint() ? <MenuItem icon="printer" label={t('Print…')} data-print onSelect={printList} /> : null
}
