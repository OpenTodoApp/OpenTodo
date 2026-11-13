// The built-in note templates for the routine editor's pickers (note-templates
// D5): read once from the compiled library; empty until it has loaded, and a
// later render lists them.
import { resettable } from '../../lib/moduleState'
import { builtinNoteTemplates, type BuiltinNoteTemplate } from '../../lib/noteTemplates'

let cache: BuiltinNoteTemplate[] | null = null
let loading = false
resettable('routines/noteTemplatesNow', () => { cache = null; loading = false })

export function builtinNoteTemplatesNow(): BuiltinNoteTemplate[] {
  if (!cache && !loading) {
    loading = true
    void builtinNoteTemplates().then((list) => { cache = list })
  }
  return cache ?? []
}
