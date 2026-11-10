// The graph page's device-only choices (OpenSpec change notes-graph-page, design
// D2, D4): which nodes are drawn and the depth around a centre. Never synced. Kept
// apart from the graph's code so the Notes page's menu reads them without loading it.
import { createStoredValue } from './deviceStorage'
import { resettable } from './moduleState'

export interface GraphShow {
  /** Notes with no link either way. */
  orphans: boolean
  /** Tasks and projects that a note links to but that have no note. */
  secondary: boolean
}

/** By default the linked picture: most task notes link nowhere, and thousands of loose dots would hide it. */
export const SHOW_DEFAULT: GraphShow = { orphans: false, secondary: true }

export const graphShow = createStoredValue<GraphShow>('opentodo.notes.graph.show', {
  parse: (raw) => {
    try {
      const v = JSON.parse(raw ?? 'null') as Partial<GraphShow> | null
      return v && typeof v === 'object' ? { orphans: v.orphans === true, secondary: v.secondary !== false } : SHOW_DEFAULT
    } catch {
      return SHOW_DEFAULT
    }
  },
  serialize: (v) => (!v.orphans && v.secondary ? null : JSON.stringify(v)),
})

/** An item the graph centres on when it next opens (Connections' Open in graph, D10). */
let centreRequest: string | null = null

export function requestGraphCentre(key: string): void {
  centreRequest = key
}

/** The requested centre, once. */
export function takeGraphCentre(): string | null {
  const key = centreRequest
  centreRequest = null
  return key
}
resettable('notesGraphCentre', () => { centreRequest = null })

export type GraphDepth = 1 | 2 | 3

export const graphDepth = createStoredValue<GraphDepth>('opentodo.notes.graph.depth', {
  parse: (raw) => (raw === '1' ? 1 : raw === '3' ? 3 : 2),
  serialize: (v) => (v === 2 ? null : String(v)),
})
