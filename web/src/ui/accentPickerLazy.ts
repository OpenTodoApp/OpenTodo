// The custom accent picker, loaded on first use (OpenSpec change accent-colour,
// design D5): the picker and its derivation stay out of the first load. Screens
// render it inside Suspense.
import { lazy } from 'react'

export type { AccentPickerProps } from './AccentPicker'
export const LazyAccentPicker = lazy(() => import('./AccentPicker').then((m) => ({ default: m.AccentPicker })))
