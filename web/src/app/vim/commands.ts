// The `:` command line (vim-keybindings, design D4): a static command table,
// prefix completion (plus project names for `:project`) and execution through the
// same functions the interface uses. Writes (`:new`) go through createTask, so they
// are local-first ops like any quick-add entry.
import { createTask } from '../../lib/ops'
import { compareByPosition } from '../../lib/ordering'
import type { Project } from '../../lib/types'
import { taskDefaults } from '../listActions'
import type { Route } from '../router'

export interface CommandSpec {
  name: string
  arg?: string
  desc: string
}

export const COMMANDS: CommandSpec[] = [
  { name: 'inbox', desc: 'Go to the Inbox' },
  { name: 'today', desc: 'Go to Today' },
  { name: 'upcoming', desc: 'Go to Upcoming' },
  { name: 'completed', desc: 'Go to Completed' },
  { name: 'settings', desc: 'Go to Settings' },
  { name: 'project', arg: '<name>', desc: 'Go to the first project whose name starts with <name>' },
  { name: 'new', arg: '<title>', desc: 'Create a task with the current view’s defaults (project, date, label)' },
  { name: 'q', desc: 'Close the task panel, else clear the selection' },
  { name: 'sync', desc: 'Sync now' },
  { name: 'help', desc: 'Show the keyboard shortcuts' },
]

function split(input: string): { name: string; arg: string; spaced: boolean } {
  const s = input.replace(/^:/, '').replace(/^\s+/, '')
  const i = s.search(/\s/)
  if (i < 0) return { name: s.toLowerCase(), arg: '', spaced: false }
  return { name: s.slice(0, i).toLowerCase(), arg: s.slice(i).trim(), spaced: true }
}

/** Exact name, else the first command (table order) the typed name is a prefix of. */
export function resolveCommand(name: string): CommandSpec | undefined {
  if (!name) return undefined
  return COMMANDS.find((c) => c.name === name) ?? COMMANDS.find((c) => c.name.startsWith(name))
}

/** Live projects a `:project` argument may name, in sidebar order. */
function candidates(projects: Project[]): Project[] {
  return projects.filter((p) => !p.deleted_at && !p.archived).sort(compareByPosition)
}

function matchProjects(arg: string, projects: Project[]): Project[] {
  const q = arg.toLowerCase()
  return candidates(projects).filter((p) => p.name.toLowerCase().startsWith(q))
}

/** Completions for the text typed after `:` (without the colon); the first one is what Tab and Enter take. */
export function complete(input: string, projects: Project[]): string[] {
  const { name, arg, spaced } = split(input)
  if (!spaced) return COMMANDS.filter((c) => c.name.startsWith(name)).map((c) => (c.arg ? `${c.name} ` : c.name))
  if (resolveCommand(name)?.name === 'project') return matchProjects(arg, projects).map((p) => `project ${p.name}`)
  return []
}

export interface CommandContext {
  route: Route
  today: string
  userId?: string
  projects: Project[]
  navigate(r: Route): void
  closePanel(): void
  sync(): void | Promise<void>
  help(): void
}

export type CommandResult = { ok: true } | { ok: false; message: string }

export async function runCommand(input: string, ctx: CommandContext): Promise<CommandResult> {
  const { name, arg } = split(input)
  if (!name) return { ok: true }
  const spec = resolveCommand(name)
  if (!spec) return { ok: false, message: `Unknown command: ${name}` }
  switch (spec.name) {
    case 'inbox':
    case 'today':
    case 'upcoming':
    case 'completed':
    case 'settings':
      ctx.navigate({ view: spec.name })
      return { ok: true }
    case 'project': {
      if (!arg) return { ok: false, message: 'Usage: project <name>' }
      const p = matchProjects(arg, ctx.projects)[0]
      if (!p) return { ok: false, message: `No project starts with "${arg}"` }
      ctx.navigate({ view: 'project', id: p.id })
      return { ok: true }
    }
    case 'new': {
      if (!arg) return { ok: false, message: 'Usage: new <title>' }
      await createTask({ ...taskDefaults(ctx.route, ctx.today, ctx.userId), title: arg })
      return { ok: true }
    }
    case 'q':
      ctx.closePanel()
      return { ok: true }
    case 'sync':
      await ctx.sync()
      return { ok: true }
    case 'help':
      ctx.help()
      return { ok: true }
  }
  return { ok: false, message: `Unknown command: ${name}` }
}
