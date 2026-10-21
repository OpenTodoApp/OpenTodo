// The page template (OpenSpec change ux-overhaul, design-system "Page template
// primitives"): a view renders its level-one heading through PageHeader, never on
// its own. Screens outside the shell (sign-in, invitations, the share target, the
// unlock and enrolment gates) have no page template. The rest of today's views are
// list is empty since task 4.3 wrapped every view; it may only shrink.
import { describe, expect, it } from 'vitest'

const app = import.meta.glob<string>(['../../app/**/*.tsx', '!../../app/**/*.test.tsx', '!../../app/**/*.stories.tsx'], { query: '?raw', import: 'default', eager: true })

/** Full-screen screens that are not pages of the shell. */
export const OUTSIDE_SHELL: readonly string[] = [
  'src/app/AuthScreen.tsx',
  'src/app/display/DisplayScreen.tsx',
  'src/app/EmailScreens.tsx',
  'src/app/InviteScreen.tsx',
  'src/app/ProjectInviteScreen.tsx',
  'src/app/PublicListScreen.tsx',
  'src/app/ResetScreen.tsx',
  'src/app/ShareCapture.tsx',
  'src/app/TwoFactorPanel.tsx',
  'src/app/UnlockScreen.tsx',
]

/** Views not yet on the page template (ux-overhaul task 4.3): none since task 4.3; the list may only shrink. */
export const PAGE_HEADER_NOT_YET: readonly string[] = []
const PAGE_HEADER_NOT_YET_MAX = 0

/** Headers rendered by a component that its caller places inside the frame (ProjectHeader: TaskListView's frame). */
const FRAME_BY_CALLER: readonly string[] = ['src/app/ProjectHeader.tsx']

export function ownHeadings(path: string, source: string): string[] {
  return source.split('\n').flatMap((line, i) => (/<h1\b/.test(line) ? [`${path}:${i + 1}`] : []))
}

describe('page template', () => {
  const files = Object.entries(app).map(([p, src]) => [p.replace(/^\.\.\/\.\.\//, 'src/'), src] as const)

  it('no view renders its own h1', () => {
    const skip = new Set([...OUTSIDE_SHELL, ...PAGE_HEADER_NOT_YET])
    const found = files.filter(([p]) => !skip.has(p)).flatMap(([p, src]) => ownHeadings(p, src))
    expect(found).toEqual([])
  })

  it('every view puts its header in the shared page frame (ux-feedback-2 D7): PageBody or PAGE_FRAME', () => {
    const outside = new Set(OUTSIDE_SHELL)
    const missing = files.filter(([p, src]) => !outside.has(p) && !FRAME_BY_CALLER.includes(p) && src.includes('<PageHeader') && !/<PageBody\b|PAGE_FRAME|max-w-\[80rem\]/.test(src)).map(([p]) => p)
    expect(missing).toEqual([])
  })

  it('no view centres its own content column any more: widths come from the frame', () => {
    const centred = files.filter(([p]) => !OUTSIDE_SHELL.includes(p)).flatMap(([p, src]) => src.split('\n').flatMap((line, i) => (/mx-auto max-w-(2xl|3xl|4xl|5xl|6xl)\b/.test(line) ? [`${p}:${i + 1}`] : [])))
    expect(centred).toEqual([])
  })

  it('the not-yet list only shrinks and names files that still need it', () => {
    expect(PAGE_HEADER_NOT_YET.length).toBeLessThanOrEqual(PAGE_HEADER_NOT_YET_MAX)
    const byPath = new Map(files)
    for (const p of [...PAGE_HEADER_NOT_YET, ...OUTSIDE_SHELL]) expect(byPath.has(p), p).toBe(true)
    for (const p of PAGE_HEADER_NOT_YET) expect(ownHeadings(p, byPath.get(p)!).length, `${p} no longer needs to be listed`).toBeGreaterThan(0)
  })
})
