// The Daily digest plugin (OpenSpec change plugin-section, design D6): the
// example plugin that exercises the whole contract — manifest, registration and
// one palette command. It copies today's open tasks as a Markdown checklist to
// the clipboard; it reads nothing else and writes nothing.
import { logicalToday } from '../../lib/dates'
import { db } from '../../lib/db'
import { msg, t } from '../../lib/i18n'
import type { Plugin } from '../types'

/** Today's open tasks as a Markdown checklist, in list order; an empty day is one line saying so. */
export async function todayMarkdown(): Promise<string> {
  const day = logicalToday()
  const rows = await db.tasks
    .filter((task) => !task.deleted_at && !task.completed_at && task.due?.date === day)
    .toArray()
  rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return rows.length ? rows.map((task) => `- [ ] ${task.title}`).join('\n') : t('Nothing is due today.')
}

/** Copies the day's list to the clipboard (the command's whole behaviour). */
export async function copyTodayMarkdown(): Promise<void> {
  await navigator.clipboard.writeText(await todayMarkdown())
}

export const dailyDigest: Plugin = {
  id: 'daily-digest',
  name: msg('Daily digest'),
  description: msg("Copy today's open tasks as a Markdown checklist."),
  icon: 'clipboard-check',
  commands: [
    { id: 'copy-markdown', label: msg("Copy today's tasks as Markdown"), icon: 'clipboard-check', keywords: 'clipboard export markdown today digest', run: copyTodayMarkdown },
  ],
}
