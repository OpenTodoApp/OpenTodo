// Routines as sentences (OpenSpec change routines-editor, design D2 and D14):
// each step kind's name, short description, search synonyms and sentence
// template in the user's language, the template's slots (the inputs shown as
// word buttons), and the names of step outputs ("the lines", "the lines (2)").
// Templates are whole sentences with named slots, so word order follows the
// language. Pure: no reads, no writes.
import { msg, t } from '../i18n'
import type { RoutineStep, RoutineStepType } from '../types'
import { stepKind, STEPS, type StepKind } from './steps'

interface KindText {
  name: string
  description: string
  /** Comma-separated search words, translated like any message. */
  synonyms: string
  /** The sentence; `{input}` marks a word button. */
  sentence: string
  /** The name of the step's output ("the lines"); '' without one. */
  output: string
}

// Each entry is English source text marked for the catalogs; t() translates it where shown.
const TEXT: Record<string, KindText> = {
  find_tasks: { name: msg('Find tasks'), description: msg('Tasks that match a filter, a saved view or a condition'), synonyms: msg('search, query, filter, view, look up, select'), sentence: msg('Find tasks where {condition}'), output: msg('the tasks') },
  create_tasks: { name: msg('Create tasks'), description: msg('One task, or one task per line'), synonyms: msg('add, new, make, todo'), sentence: msg('Create tasks from {text} in {project}'), output: msg('the new tasks') },
  change_tasks: { name: msg('Change tasks'), description: msg('Labels, dates, priority, section, completion'), synonyms: msg('update, edit, set, move, complete, label'), sentence: msg('Change {tasks}: {set}'), output: msg('the changed tasks') },
  add_comment: { name: msg('Add a comment'), description: msg('A comment on a task'), synonyms: msg('comment, reply, note'), sentence: msg('Comment on {task}: {text}'), output: '' },
  get_task: { name: msg('Get a task'), description: msg('One task to use in later steps'), synonyms: msg('task, pick, choose'), sentence: msg('Get the task {task}'), output: msg('the task') },
  find_project: { name: msg('Find a project'), description: msg('A project by its name'), synonyms: msg('project, search, look up'), sentence: msg('Find the project named {name}'), output: msg('the project') },
  project_of: { name: msg('Get the project of a task'), description: msg('The project a task is in'), synonyms: msg('project, where, belongs, container'), sentence: msg('Get the project of {task}'), output: msg('the task’s project') },
  create_project: { name: msg('Create a project'), description: msg('A new project'), synonyms: msg('add, new, project'), sentence: msg('Create the project {name}'), output: msg('the new project') },
  update_project: { name: msg('Update a project'), description: msg('Rename, colour, icon or archive a project'), synonyms: msg('rename, archive, edit, colour, icon'), sentence: msg('Update the project {project}'), output: msg('the project') },
  create_sections: { name: msg('Create sections'), description: msg('Sections in a project, one per line'), synonyms: msg('section, add, columns'), sentence: msg('Create sections {names} in {project}'), output: '' },
  create_labels: { name: msg('Create labels'), description: msg('Labels, one per line'), synonyms: msg('label, tag, add'), sentence: msg('Create labels {names}'), output: '' },
  favourite: { name: msg('Favourite a project'), description: msg('Add a project to Favourites or remove it'), synonyms: msg('favorite, star, pin, sidebar'), sentence: msg('Favourite {project}: {on}'), output: '' },
  project_from_template: { name: msg('Project from a template'), description: msg('A new project from a template, with dates from a start'), synonyms: msg('template, checklist, copy'), sentence: msg('Create a project from the template {template} starting {start}'), output: msg('the new project') },
  note_text: { name: msg('Get note text'), description: msg('The note of a task or a project'), synonyms: msg('note, read, notes, description'), sentence: msg('Get the note text of {of}'), output: msg('the note text') },
  append_to_note: { name: msg('Add to a note'), description: msg('Text at the end of a note'), synonyms: msg('append, note, write'), sentence: msg('Add {text} to the note of {of}'), output: '' },
  clear_note: { name: msg('Clear a note'), description: msg('Empty the note of a task or a project'), synonyms: msg('empty, erase, note, reset'), sentence: msg('Clear the note of {of}'), output: '' },
  split_lines: { name: msg('Split into lines'), description: msg('A text as a list of its lines'), synonyms: msg('lines, list, split, break'), sentence: msg('Split {text} into lines'), output: msg('the lines') },
  join: { name: msg('Join'), description: msg('A list as one text'), synonyms: msg('combine, merge, concatenate, text'), sentence: msg('Join {lines} into one text'), output: msg('the joined text') },
  format: { name: msg('Format text'), description: msg('A text with values of earlier steps'), synonyms: msg('text, template, write, message'), sentence: msg('Write the text {template}'), output: msg('the text') },
  replace: { name: msg('Replace text'), description: msg('Find and replace in a text'), synonyms: msg('find, substitute, swap'), sentence: msg('In {text}, replace {find} with {with}'), output: msg('the new text') },
  filter: { name: msg('Filter'), description: msg('Keep the items that match'), synonyms: msg('keep, where, only, select'), sentence: msg('Keep the items of {list} that match {where}'), output: msg('the filtered items') },
  sort: { name: msg('Sort'), description: msg('Order a list'), synonyms: msg('order, arrange, rank'), sentence: msg('Sort {list} by {by}'), output: msg('the sorted items') },
  take: { name: msg('Take first'), description: msg('The first or last items of a list'), synonyms: msg('limit, first, last, top'), sentence: msg('Take the first {n} of {list}'), output: msg('the first items') },
  count: { name: msg('Count'), description: msg('How many items a list has'), synonyms: msg('number, how many, total'), sentence: msg('Count {list}'), output: msg('the count') },
  if: { name: msg('If / Otherwise'), description: msg('Run steps only when a value passes a test'), synonyms: msg('condition, when, else, otherwise, branch'), sentence: msg('If {value} {is}'), output: '' },
  repeat: { name: msg('Repeat for each'), description: msg('Run steps once for every item of a list'), synonyms: msg('loop, each, every, for each, iterate'), sentence: msg('Repeat for each item of {list}'), output: msg('the results') },
  stop: { name: msg('Stop'), description: msg('End the run here'), synonyms: msg('end, exit, quit, halt'), sentence: msg('Stop the routine'), output: '' },
  date: { name: msg('Get the date'), description: msg('Today, tomorrow or a day a few days away'), synonyms: msg('today, date, day, now, tomorrow, current'), sentence: msg('Get the date {date}'), output: msg('the date') },
  start_timer: { name: msg('Start a timer'), description: msg('Track time on a task'), synonyms: msg('timer, track, time'), sentence: msg('Start the timer on {task}'), output: '' },
  stop_timer: { name: msg('Stop the timer'), description: msg('Stop the running timer'), synonyms: msg('timer, track, time, stop'), sentence: msg('Stop the running timer'), output: '' },
  tracked_time: { name: msg('Tracked time'), description: msg('Minutes tracked in a period'), synonyms: msg('time, minutes, hours, report'), sentence: msg('Get the time tracked {period}'), output: msg('the tracked minutes') },
  set_focus: { name: msg('Set today’s focus'), description: msg('Tasks for today’s focus'), synonyms: msg('focus, today, plan'), sentence: msg('Set today’s focus to {tasks}'), output: '' },
  notify: { name: msg('Notify me'), description: msg('A notification in the app and your channels'), synonyms: msg('notification, alert, ping, message, remind'), sentence: msg('Notify me: {text}'), output: '' },
  webhook: { name: msg('Send a webhook'), description: msg('A signed request to one of your webhooks'), synonyms: msg('http, post, integration, request'), sentence: msg('Send the webhook {webhook_id}'), output: '' },
  email_me: { name: msg('Email me'), description: msg('An email to your own address'), synonyms: msg('mail, email, message, send'), sentence: msg('Email me {subject}: {text}'), output: '' },
  ask_ai: { name: msg('Ask AI'), description: msg('An answer written by AI from your instruction'), synonyms: msg('ai, assistant, prompt, ask, sort, classify, extract'), sentence: msg('Ask AI {instruction} using {context}'), output: msg('the AI answer') },
  summarise: { name: msg('Summarise'), description: msg('A short summary written by AI'), synonyms: msg('summary, summarize, digest, recap, ai'), sentence: msg('Summarise {text}'), output: msg('the summary') },
  email_members: { name: msg('Email project members'), description: msg('An email to the members of the routine’s project'), synonyms: msg('mail, email, team, members, send'), sentence: msg('Email the project’s members {subject}: {text}'), output: '' },
}

// Sentences for kinds whose main input depends on which one is set.
const FIND_BY = { query: msg('Find tasks matching {query}'), view: msg('Find the tasks of the view {view}'), condition: msg('Find tasks where {condition}') }
const CREATE_ONE = msg('Create the task {title} in {project}')

export const GROUP_NAME: Record<StepKind['group'], string> = {
  tasks: msg('Tasks'), projects: msg('Projects'), text: msg('Notes and text'), logic: msg('Lists and logic'), time: msg('Time and focus'), communication: msg('Communication'),
  ai: msg('AI'),
}
export const GROUPS = Object.keys(GROUP_NAME) as StepKind['group'][]

/** The input labels a word button names ("Project: Errands, change"). */
const INPUT_LABEL: Record<string, string> = {
  query: msg('Filter'), view: msg('View'), condition: msg('Condition'), limit: msg('At most'), text: msg('Text'), title: msg('Title'), project: msg('Project'),
  section: msg('Section'), due: msg('Due date'), priority: msg('Priority'), labels: msg('Labels'), energy: msg('Energy'), tasks: msg('Tasks'), set: msg('Changes'),
  task: msg('Task'), name: msg('Name'), parent: msg('Parent project'), color: msg('Colour'), icon: msg('Icon'), archived: msg('Archived'), names: msg('Names'),
  on: msg('Favourite'), template: msg('Template'), start: msg('Start'), of: msg('Of'), lines: msg('Lines'), separator: msg('Separator'), find: msg('Find'),
  with: msg('Replace with'), case: msg('Match case'), list: msg('List'), where: msg('Test'), by: msg('Order'), direction: msg('Direction'), n: msg('How many'),
  from: msg('From'), value: msg('Value'), is: msg('Test'), reason: msg('Reason'), period: msg('Period'), webhook_id: msg('Webhook'), subject: msg('Subject'),
  date: msg('Date'), only: msg('Only'),
  instruction: msg('Instruction'), context: msg('Using'), context2: msg('Also using'), context3: msg('And using'), answer: msg('Answer as'), length: msg('Length'),
}

export const kindText = (kind: string): KindText | undefined => TEXT[kind]
export const stepName = (kind: string): string => (TEXT[kind] ? t(TEXT[kind].name) : kind)
export const stepDescription = (kind: string): string => (TEXT[kind] ? t(TEXT[kind].description) : '')
export const inputLabel = (name: string): string => (INPUT_LABEL[name] ? t(INPUT_LABEL[name]) : name)

/** The English source and the translated template of a step's sentence. */
function sentenceOf(step: Pick<RoutineStep, 'kind' | 'in'>): string {
  const has = (n: string) => !!step.in && n in step.in
  if (step.kind === 'find_tasks') return has('query') ? FIND_BY.query : has('view') ? FIND_BY.view : FIND_BY.condition
  if (step.kind === 'create_tasks' && has('title')) return CREATE_ONE
  return TEXT[step.kind]?.sentence ?? step.kind
}

export type SentencePart = { text: string } | { slot: string }

const MARK = '\u0001'

/** The sentence of a step as text runs and slots, in the user's language. */
export function sentenceParts(step: Pick<RoutineStep, 'kind' | 'in'>): SentencePart[] {
  const source = sentenceOf(step)
  const slots = [...source.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1])
  const values: Record<string, string> = {}
  for (const s of slots) values[s] = `${MARK}${s}${MARK}`
  const text = t(source, values)
  const out: SentencePart[] = []
  text.split(MARK).forEach((chunk, i) => {
    if (i % 2 === 1 && slots.includes(chunk)) out.push({ slot: chunk })
    else if (chunk) out.push({ text: chunk })
  })
  return out
}

/** The slots a step's sentence shows; its other set inputs follow as extra words. */
export function sentenceSlots(step: Pick<RoutineStep, 'kind' | 'in'>): string[] {
  return [...sentenceOf(step).matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1])
}

/** The inputs a card shows after its sentence: set, optional and not in the sentence. */
export function extraInputs(step: RoutineStep): string[] {
  const shown = new Set(sentenceSlots(step))
  return (stepKind(step.kind)?.inputs ?? []).map((d) => d.name).filter((n) => !shown.has(n) && !!step.in && n in step.in)
}

/** Optional inputs a card's menu offers to add. */
export function addableInputs(step: RoutineStep): string[] {
  const k = stepKind(step.kind)
  if (!k) return []
  const shown = new Set(sentenceSlots(step))
  const exclusive = new Set((k.oneOf ?? []).flat())
  return k.inputs.map((d) => d.name).filter((n) => !shown.has(n) && !exclusive.has(n) && !(step.in && n in step.in))
}

/** Lower-case words a search matches for a kind, in the user's language and in English. */
export function searchWords(kind: string): string {
  const x = TEXT[kind]
  if (!x) return kind
  const local = [t(x.name), t(x.description), t(x.synonyms)]
  return [...local, x.name, x.description, x.synonyms].join(' ').toLocaleLowerCase()
}

/** Kinds matching a query: every word of the query in the kind's words. */
export function searchKinds(query: string, kinds: readonly string[] = STEPS.map((k) => k.kind)): string[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...kinds]
  return kinds.filter((k) => {
    const hay = searchWords(k)
    return words.every((w) => hay.includes(w))
  })
}

const TRIGGER_OUTPUT: Partial<Record<RoutineStepType, string>> = { task: msg('the trigger’s task'), tasks: msg('the matching tasks'), date: msg('the date') }

/** The name of the trigger's output. */
export const triggerOutputName = (type: RoutineStepType): string => (TRIGGER_OUTPUT[type] ? t(TRIGGER_OUTPUT[type]!) : t('the trigger'))

/** The current item of a Repeat ("each task", "each line"). */
export const itemName = (type: RoutineStepType | ''): string => (type === 'task' ? t('each task') : type === 'text' ? t('each line') : t('each item'))

/**
 * The names of every step's output (D2): the kind's output name, numbered when
 * the same name is used again ("the lines (2)"); nothing is stored. `named`
 * may name an output by its value instead (Get a task: the task's title).
 */
export function outputNames(steps: readonly RoutineStep[], named?: (s: RoutineStep) => string | undefined): Map<string, string> {
  const out = new Map<string, string>()
  const seen = new Map<string, number>()
  const visit = (list: readonly RoutineStep[]) => {
    for (const s of list) {
      const base = TEXT[s.kind]?.output
      const own = named?.(s)
      if (own) out.set(s.id, own)
      else if (base) {
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        out.set(s.id, n === 1 ? t(base) : t('{name} ({n})', { name: t(base), n }))
      }
      visit(s.then ?? [])
      visit(s.otherwise ?? [])
      visit(s.do ?? [])
    }
  }
  visit(steps)
  return out
}

/** A step's output with its count ("3 lines", "1 task", "12"). */
export function countText(type: RoutineStepType, n: number): string {
  switch (type) {
    case 'tasks': return t('{n, plural, one {# task} other {# tasks}}', { n })
    case 'lines': return t('{n, plural, one {# line} other {# lines}}', { n })
    case 'task': return n ? t('1 task') : t('no task')
    case 'project': return n ? t('1 project') : t('no project')
    default: return String(n)
  }
}

/** A type's name in a sentence ("Text", "Tasks"). */
const TYPE_NAME: Record<RoutineStepType, string> = {
  text: msg('Text'), task: msg('Task'), tasks: msg('Tasks'), project: msg('Project'), date: msg('Date'), number: msg('Number'), lines: msg('Lines'), none: msg('no output'),
}
export const typeLabel = (type: RoutineStepType): string => t(TYPE_NAME[type])
