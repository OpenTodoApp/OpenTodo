import { type ComponentProps, Suspense } from 'react'
import { lazy } from '../lib/lazy'

const Appearance = lazy(() => import('./SidebarAppearance').then((m) => ({ default: m.SidebarAppearance })))

// The form's name field can take focus while the appearance control loads.
export function SidebarAppearance(props: ComponentProps<typeof Appearance>) {
  return <Suspense fallback={null}><Appearance {...props} /></Suspense>
}
