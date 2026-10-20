// "Export time entries" in Statistics (OpenSpec change time-tracking, statistics
// "Time entries export", design D8): the CSV of the chosen period, built on this
// device from local rows with lib/time.ts toCSV, so it works offline, sends
// nothing, and holds what the server's CSV holds for the same entries.
import { useCallback } from 'react'
import { useAllLabels } from '../../lib/localData'
import { periodFor, type PeriodKind } from '../../lib/stats'
import { toCSV } from '../../lib/time'
import type { Project, Task, TimeEntry } from '../../lib/types'
import { useFieldDefs } from '../useFields'

/** `time-entries-2026-10-12-2026-10-18.csv` */
export const timeExportName = (start: string, end: string) => `time-entries-${start}-${end}.csv`

/** Offer a text file as a download from a Blob URL. */
export function downloadText(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** The export action for the shown period. */
export function useTimeExport(entries: readonly TimeEntry[], tasks: readonly Task[], projects: readonly Project[], period: PeriodKind, today: string, weekStart: number): () => void {
  const labels = useAllLabels()
  const fields = useFieldDefs()
  return useCallback(() => {
    const range = periodFor(period, today, weekStart)
    const csv = toCSV({ entries, tasks, projects, labels, fields, now: Date.now(), from: range.start, to: range.end })
    downloadText(csv, timeExportName(range.start, range.end), 'text/csv;charset=utf-8')
  }, [entries, tasks, projects, labels, fields, period, today, weekStart])
}
