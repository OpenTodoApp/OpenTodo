// The one "Pin to sidebar" item (sidebar-favourites D3), shared by the project,
// label and saved-filter menus, so the word, the icon and the check cannot drift.
import { t } from '../../lib/i18n'
import type { ActionItem } from './ActionMenu'

export function pinItem(checked: boolean, onSelect: () => unknown): ActionItem {
  return { kind: 'check', id: 'pin', label: t('Pin to sidebar'), icon: 'pin', checked, onSelect }
}
