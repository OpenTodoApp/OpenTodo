import { nameKey } from './fieldNames'
import { fieldSortBy, fieldSortName, type FieldDef, type SortBy } from './types'

export function fieldSortOptions(fields: readonly FieldDef[], selected: SortBy): { value: SortBy; label: string }[] {
  const names = new Map<string, string>()
  for (const field of fields) {
    if (!field.deleted_at && (field.type === 'number' || field.type === 'date')) {
      const key = nameKey(field.name)
      if (!names.has(key)) names.set(key, field.name)
    }
  }
  const selectedName = fieldSortName(selected)
  if (selectedName && !names.has(selectedName)) names.set(selectedName, selectedName)
  return [...names].map(([key, label]) => ({ value: key === selectedName ? selected : fieldSortBy(label), label }))
}
