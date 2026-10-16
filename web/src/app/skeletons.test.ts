// Skeleton loading (OpenSpec change ux-overhaul, task-list-presentation "Skeleton
// loading"): while a list, the panel or a settings page waits for data it shows
// skeleton shapes, never a "Loading…" sentence or a spinner. A source lint, in the
// style of the listener and token lints.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>

describe('no loading sentences', () => {
  it('no screen under src/app renders a "Loading…" sentence for data it waits for', () => {
    const offenders: string[] = []
    for (const [file, src] of Object.entries(sources)) {
      if (/\.(test|stories)\.tsx$/.test(file)) continue
      src.split('\n').forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return
        if (/>\s*Loading(…|\.\.\.)\s*</.test(line) || /['"`]Loading(…|\.\.\.)['"`]/.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
