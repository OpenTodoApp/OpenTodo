// The Open Loops vocabulary (OpenSpec change open-loops-method, design D1). The
// terms live in vocabulary.json, which the i18n extractor and the site bundle
// read too, so the app, the in-app Help and the website use the same words.
import { t } from '../i18n'
import vocabulary from './vocabulary.json'

/** The method's name: a product name, never translated (open-loops "One method vocabulary"). */
export const METHOD_NAME = vocabulary.name

export type MoveId = 'catch' | 'clarify' | 'place' | 'do' | 'review'
export type PlaceId = 'inbox' | 'next' | 'waiting' | 'scheduled' | 'later' | 'someday' | 'projects'
export type RhythmId = 'daily' | 'weekly' | 'monthly'
export type HorizonId = 'step' | 'project' | 'area'

export interface Term<Id extends string = string> {
  id: Id
  /** English name and description; translate with termName / termDescription. */
  name: string
  description: string
  route?: string
  keys?: string
}

export const MOVES = vocabulary.moves as Term<MoveId>[]
export const PRINCIPLES = vocabulary.principles as Term[]
export const PLACES = vocabulary.places as Term<PlaceId>[]
export const RHYTHMS = vocabulary.rhythms as Term<RhythmId>[]
export const HORIZONS = vocabulary.horizons as Term<HorizonId>[]

/** The tagline in the interface language. */
export const methodTagline = (): string => t(vocabulary.tagline)
/** A term's name in the interface language (English when a catalog lacks it), in the `method` context the extractor gives it. */
export const termName = (term: Term): string => t(term.name, { context: 'method' })
export const termDescription = (term: Term): string => t(term.description)

/** A move by id. */
export function move(id: MoveId): Term<MoveId> {
  return MOVES.find((m) => m.id === id)!
}

/** The Help screen id of a move's (or the overview's) method page: `method/<id>`. */
export const methodScreen = (id: MoveId | 'overview'): string => `method/${id}`
