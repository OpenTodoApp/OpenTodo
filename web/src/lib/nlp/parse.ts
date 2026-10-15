// parse(line, ctx): the quick-add grammar. Pure and deterministic: the result depends
// only on the line, the reference date and time, the languages, the project list and
// the dismissed spans. No network, no clock reads, no randomness.
import type { Due, Priority } from '../types'
import { matchDuration, matchLabel, matchPriority, matchProject, type ProjectRef } from './attributes'
import { matchDateAt, matchDeadlineAt, matchTimeAt, type DateContext, type DateMatch, type TimeMatch } from './dates'
import { stripSpans, tokenize, type Span, type Token } from './tokenize'
import { vocabulariesFor, type DayMonthOrder } from './vocab'

export type AttributeKind = 'due' | 'deadline' | 'project' | 'label' | 'priority' | 'estimate'

/** One recognised attribute; drives a preview chip. `spans` are removed from the title. */
export interface Chip {
  kind: AttributeKind
  /** Stable within one parse: kind plus the first span start. */
  key: string
  spans: Span[]
  /** Resolved value: Due, deadline date, project id, label name, priority or minutes. */
  value: Due | string | number
}

export interface ParseContext {
  /** Reference local date, YYYY-MM-DD (the viewer's `todayISO()`). */
  today: string
  /** Reference local wall-clock time, HH:MM; used by "in N hours". */
  now?: string
  /** Preferred languages (BCP 47 tags); filtered to bundled ones, English appended. */
  languages: readonly string[]
  projects: readonly ProjectRef[]
  /** Spans the user rejected; skipped while the line still has the same text there. */
  dismissed?: readonly Span[]
  /** Numeric date order; defaults to the first active language's order. */
  dayMonthOrder?: DayMonthOrder
  /** First day of the week, 0 = Sunday … 6 = Saturday (date-time-preferences D5); Monday when absent. */
  weekStart?: number
}

export interface ParseResult {
  title: string
  due: Due | null
  /** "YYYY-MM-DD" from a deadline phrase ("deadline friday"), or null. */
  deadline: string | null
  projectId: string | null
  labels: string[]
  priority: Priority | null
  estimateMinutes: number | null
  /** One chip per attribute in line order (one per label). */
  chips: Chip[]
}

function spanOf(line: string, tokens: readonly Token[], from: number, to: number): Span {
  const start = tokens[from].start
  const end = tokens[to - 1].end
  return { start, end, text: line.slice(start, end) }
}

/** A dismissed span still applies while the line has exactly the same text there. */
export function liveDismissals(line: string, dismissed: readonly Span[] = []): Span[] {
  return dismissed.filter((d) => d.end <= line.length && line.slice(d.start, d.end) === d.text)
}

function overlaps(a: Span, list: readonly Span[]): boolean {
  return list.some((b) => a.start < b.end && b.start < a.end)
}

export function parse(line: string, ctx: ParseContext): ParseResult {
  const vocabs = vocabulariesFor(ctx.languages)
  const dctx: DateContext = {
    today: ctx.today,
    now: ctx.now,
    vocabs,
    dayMonthOrder: ctx.dayMonthOrder ?? vocabs[0].dayMonthOrder,
    weekStart: ctx.weekStart,
  }
  const bareHourIsTime = vocabs.some((v) => v.hourSuffixH)
  const dismissed = liveDismissals(line, ctx.dismissed)
  const { tokens, quoteSpans } = tokenize(line)

  let date: { value: string; span: Span } | null = null
  let time: { value: string; date?: string; span: Span } | null = null
  let project: { id: string; span: Span } | null = null
  let priority: { value: Priority; span: Span } | null = null
  let estimate: { value: number; span: Span } | null = null
  let deadline: { value: string; span: Span } | null = null
  const labels: { value: string; span: Span }[] = []

  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok.quoted) {
      i++
      continue
    }
    const one = spanOf(line, tokens, i, i + 1)
    const free = !overlaps(one, dismissed)

    // Attribute tokens are single tokens and language independent.
    if (free) {
      if (!project && tok.text.startsWith('#')) {
        const p = matchProject(tok.text, ctx.projects)
        if (p) {
          project = { id: p.id, span: one }
          i++
          continue
        }
      }
      const label = matchLabel(tok.text)
      if (label !== null) {
        labels.push({ value: label, span: one })
        i++
        continue
      }
      if (!priority) {
        const p = matchPriority(tok.text)
        if (p) {
          priority = { value: p, span: one }
          i++
          continue
        }
      }
      if (!estimate) {
        const m = matchDuration(tok.text, { bareHourIsTime })
        if (m !== null) {
          estimate = { value: m, span: one }
          i++
          continue
        }
      }
    }

    // A deadline word directly before a date phrase: the first one wins (deadlines D7).
    if (!deadline) {
      const dl = matchDeadlineAt(tokens, i, dctx)
      const span = dl ? spanOf(line, tokens, dl.from, dl.to) : null
      if (dl && span && !overlaps(span, dismissed)) {
        deadline = { value: dl.date, span }
        // A deadline has no time: a time right after it stays in the title.
        i = matchTimeAt(tokens, dl.to, dctx)?.to ?? dl.to
        continue
      }
    }

    // Date and time phrases: the longest wins, a date on a tie. First of each wins.
    // A match whose range overlaps a live dismissal is ignored.
    let dm: DateMatch | null = date ? null : matchDateAt(tokens, i, dctx)
    let tm: TimeMatch | null = time ? null : matchTimeAt(tokens, i, dctx)
    const dSpan: Span | null = dm ? spanOf(line, tokens, dm.from, dm.to) : null
    const tSpan: Span | null = tm ? spanOf(line, tokens, tm.from, tm.to) : null
    if (dSpan && overlaps(dSpan, dismissed)) dm = null
    if (tSpan && overlaps(tSpan, dismissed)) tm = null
    if (dm && dSpan && (!tm || dm.to >= tm.to)) {
      date = { value: dm.date, span: dSpan }
      i = dm.to
    } else if (tm && tSpan) {
      time = { value: tm.time, date: tm.date, span: tSpan }
      i = tm.to
    } else {
      i++
    }
  }

  let due: Due | null = null
  if (date || time) {
    due = { date: date?.value ?? time?.date ?? ctx.today }
    if (time) due.time = time.value
  }

  const chips: Chip[] = []
  const chip = (kind: AttributeKind, spans: Span[], value: Chip['value']) =>
    chips.push({ kind, key: `${kind}:${spans[0].start}`, spans, value })
  if (due) chip('due', [date?.span, time?.span].filter((s): s is Span => !!s).sort((a, b) => a.start - b.start), due)
  if (deadline) chip('deadline', [deadline.span], deadline.value)
  if (project) chip('project', [project.span], project.id)
  for (const l of labels) chip('label', [l.span], l.value)
  if (priority) chip('priority', [priority.span], priority.value)
  if (estimate) chip('estimate', [estimate.span], estimate.value)
  chips.sort((a, b) => a.spans[0].start - b.spans[0].start)

  return {
    title: stripSpans(line, chips.flatMap((c) => c.spans), quoteSpans),
    due,
    deadline: deadline?.value ?? null,
    projectId: project?.id ?? null,
    labels: labels.map((l) => l.value),
    priority: priority?.value ?? null,
    estimateMinutes: estimate?.value ?? null,
    chips,
  }
}

/**
 * Keep dismissed spans attached to their text while the line is edited: the edit
 * is the region between the common prefix and the common suffix of the two lines.
 * Spans entirely before it stay, spans entirely after it shift by the length
 * change, and spans the edit touches are dropped (their text changed).
 */
export function rebaseDismissed(prev: string, next: string, dismissed: readonly Span[]): Span[] {
  if (prev === next) return [...dismissed]
  let p = 0
  const max = Math.min(prev.length, next.length)
  while (p < max && prev[p] === next[p]) p++
  let s = 0
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++
  const editStart = p
  const editEndPrev = prev.length - s
  const delta = next.length - prev.length
  const out: Span[] = []
  for (const d of dismissed) {
    if (d.end <= editStart) out.push(d)
    else if (d.start >= editEndPrev) out.push({ start: d.start + delta, end: d.end + delta, text: d.text })
  }
  // The span must still be the same whole words: "may" → "mayo" is a new word.
  const boundary = (ch: string | undefined) => ch === undefined || /[\s"]/.test(ch)
  return out.filter((d) => next.slice(d.start, d.end) === d.text && boundary(next[d.start - 1]) && boundary(next[d.end]))
}
