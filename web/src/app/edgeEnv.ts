// Where the app runs, for the edge swipe (edge-swipe-back): in the native shell, in
// a standalone (installed) web app, and on an iPhone or iPad. Read from the platform
// port and the browser at the moment the shell mounts.
import { shell } from '../lib/shell'

export function edgeEnv(): { shell: boolean; standalone: boolean; ios: boolean } {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  // iPadOS reports a Mac; a touch screen tells them apart.
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  return { shell: shell() !== null, standalone, ios }
}
