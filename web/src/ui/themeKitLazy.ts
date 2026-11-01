// The theme editor's primitives, loaded on first use (OpenSpec change theme-editor,
// design D3 "Bundle"): the colour field, the token row and the contrast badge stay
// out of the first load, as the accent picker does (accentPickerLazy.ts). Screens
// render them inside Suspense.
import { lazy } from 'react'

export type { ColourFieldProps } from './ColourField'
export type { TokenRowProps } from './TokenRow'
export type { ContrastBadgeProps } from './ContrastBadge'
export const LazyColourField = lazy(() => import('./themeKit').then((m) => ({ default: m.ColourField })))
export const LazyTokenRow = lazy(() => import('./themeKit').then((m) => ({ default: m.TokenRow })))
export const LazyContrastBadge = lazy(() => import('./themeKit').then((m) => ({ default: m.ContrastBadge })))
