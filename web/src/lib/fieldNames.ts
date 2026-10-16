// Names of custom field definitions for labels in history and activity (OpenSpec
// change custom-fields, task 5.6): the shell keeps this map current from the local
// definitions, so pure formatting code can show "Cost" instead of a field id.
const names = new Map<string, string>()

export function setFieldNames(entries: Iterable<[string, string]>): void {
  names.clear()
  for (const [id, name] of entries) names.set(id, name)
}

export function fieldNameOf(id: string): string | undefined {
  return names.get(id)
}
