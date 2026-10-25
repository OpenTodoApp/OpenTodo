// In-app links inside Settings (settings-navigation): a plain click follows the
// link without a reload; modified clicks (new tab, new window) keep the browser's.
import type { MouseEvent } from 'react'
import { navigate, type Route } from './router'

/** Follows an in-app link without a reload; modified clicks (new tab, new window) keep the browser's behaviour. */
export function followLink(e: Pick<MouseEvent<HTMLAnchorElement>, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'preventDefault'>, r: Route) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  navigate(r)
}
