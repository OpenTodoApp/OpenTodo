import { QUICK_ADD_SYNTAX, SHORTCUTS } from '../lib/shortcuts'
import { Dialog } from './overlay'
import { navigate } from './router'

/** An extra block of the `?` overlay (the Vim layer supplies one while it is on). */
export interface HelpSection {
  title: string
  note?: string
  rows: [string, string][]
}

export function ShortcutHelp({ onClose, extraSections = [] }: { onClose: () => void; extraSections?: HelpSection[] }) {
  const rows: [string, string][] = SHORTCUTS.map((r) => [r.keys, r.description])
  const quickAdd = QUICK_ADD_SYNTAX
  return (
    // The shared Dialog: full screen on phones, a card from 640 px up; the overlay
    // scrolls and the header with its close button stays pinned (iOS Safari).
    <Dialog title="Keyboard shortcuts" onClose={onClose} size="md" className="!pt-2">
          <table className="w-full table-fixed text-sm">
            <tbody>
              {rows.map(([k, d]) => (
                <tr key={k} className="border-t border-default">
                  <td className="w-2/5 py-1.5 pr-3 align-top"><span className="kbd inline-block break-words">{k}</span></td>
                  <td className="py-1.5 text-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {extraSections.map((sec) => (
            <section key={sec.title} data-help-section={sec.title}>
              <h3 className="mb-1 mt-4 text-sm font-semibold">{sec.title}</h3>
              {sec.note && <p className="mb-2 text-xs text-muted">{sec.note}</p>}
              <table className="w-full table-fixed text-sm">
                <tbody>
                  {sec.rows.map(([k, d]) => (
                    <tr key={k} className="border-t border-default">
                      <td className="w-2/5 py-1.5 pr-3 align-top"><span className="kbd inline-block break-words">{k}</span></td>
                      <td className="py-1.5 text-muted">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {extraSections.length === 0 && (
            <p className="mt-3 text-xs text-muted" data-vim-hint>Prefer modal editing? Vim keybindings can be enabled in Settings → Preferences → Keyboard.</p>
          )}
          <h3 className="mb-2 mt-4 text-sm font-semibold">Quick add syntax</h3>
          <table className="w-full table-fixed text-sm">
            <tbody>
              {quickAdd.map(([k, d]) => (
                <tr key={k} className="border-t border-default">
                  <td className="w-2/5 py-1.5 pr-3 align-top"><code className="break-words text-xs">{k}</code></td>
                  <td className="py-1.5 text-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a className="touch-target inline-flex items-center text-muted underline" href="/help/quick-add"
              onClick={(e) => { e.preventDefault(); onClose(); navigate({ view: 'help', page: 'quick-add' }) }}>Full quick add syntax</a>
            <a className="touch-target inline-flex items-center text-muted underline" href="/help"
              onClick={(e) => { e.preventDefault(); onClose(); navigate({ view: 'help' }) }}>Open Help (<span className="kbd mx-0.5">g</span> <span className="kbd mx-0.5">?</span>)</a>
          </p>
          <button className="btn-ghost mt-4 w-full" onClick={onClose}>Close</button>
    </Dialog>
  )
}
