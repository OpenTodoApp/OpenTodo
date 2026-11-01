// The types of the device's routine planner (OpenSpec change routines-ai-step,
// design D7): what a run reads (RunWorld), what it is asked to run (RunRoutine,
// RunOptions) and what it plans (RunPlan). Values are plaintext: the device
// holds its decrypted copy; the runner encrypts before it commits.
import type { Membership, RoutineStep, RuleCondition } from '../../types'
import type { StepValue } from '../stepData'

/** A stored row: field name to value (JSON-decoded). */
export type Row = Record<string, unknown>

/** What step availability reads (internal/ruleval.Env); everything on by default. */
export interface RunEnv {
  automations?: boolean
  demo?: boolean
  emailConfigured?: boolean
  emailVerified?: boolean
  webhooks?: readonly string[]
  energy?: boolean
  focusOff?: boolean
  timeTrackingOff?: boolean
  shared?: boolean
  ai?: boolean
  aiConsent?: boolean
}

/** A library template as internal/templatelib reads it (web/src/generated/templates.json). */
export interface LibraryTemplate {
  slug: string
  icon?: string
  labels?: { name: Record<string, string>; color?: string }[]
  projects?: LibraryProject[]
}
export interface LibraryTask {
  title: Record<string, string>
  description?: Record<string, string>
  priority?: number
  due?: string
  time?: string
  recurrence?: string
  estimate?: number
  labels?: number[]
  subtasks?: LibraryTask[]
}
export interface LibraryProject {
  name: Record<string, string>
  color?: string
  icon?: string
  tasks?: LibraryTask[]
  sections?: { name: Record<string, string>; tasks?: LibraryTask[] }[]
}

/** The user's rows and settings a run reads (internal/rules world). Rows are live and deleted ones alike. */
export interface RunWorld {
  userId: string
  /** The user's logical today (zone and day start applied). */
  today: string
  /** The run's clock, Unix milliseconds. */
  now: number
  /** First day of the week, 0 = Sunday … 6 = Saturday. */
  weekStart: number
  /** Minutes east of UTC, and the day start "HH:MM" (tracked time, quick add). */
  offset: number
  dayStart: string
  tasks: Row[]
  projects: Row[]
  labels: Row[]
  sections: Row[]
  views: Row[]
  /** Custom field definitions (filter queries). */
  fields?: Row[]
  timeEntries: Row[]
  /** user_prefs "me": language, favourites, focus style, day parts. */
  prefs?: Row
  /** Each shared project's membership; a project absent here is personal. */
  memberships: Map<string, Membership>
  /** Each task's logical date of its newest change, for the condition `unchanged`. */
  changed?: Record<string, string>
  encrypted: boolean
  env?: RunEnv
  /** The template library (project_from_template); loaded lazily by the caller. */
  templates?: readonly LibraryTemplate[]
}

/** A routine as the planner reads it. */
export interface RunRoutine {
  id: string
  name: string
  steps: RoutineStep[]
  trigger: { kind: string } & Record<string, unknown>
  condition?: RuleCondition | null
  /** rule.ai_budget as stored (0 reads as 20,000). */
  aiBudget?: number
}

/** One AI step's request (internal/rules AICall). */
export interface AICall {
  instruction: string
  context: string[]
  answer: 'text' | 'lines'
  maxTokens: number
}

/** The model's answer and its tokens. */
export interface AIAnswer {
  text?: string
  lines?: string[]
  input: number
  output: number
}

/** A call that gave no answer; code is the failed step's error code (ai_refused, ai_truncated, …). */
export class AIError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export interface RunOptions {
  /** The occurrence key (ids of a resumed run stay the same). */
  key: string
  /** The run's id (the server's run id, or the client's for Run now). */
  runId: string
  /** The trigger's task, when the trigger has one. */
  triggerTaskId?: string
  /** A test: AI steps are estimated, not called, unless callAI. */
  test?: boolean
  callAI?: boolean
  ai?: (c: AICall) => Promise<AIAnswer>
  /** Tokens the routine used today before this run (the server reports them at dispatch). */
  aiTokensToday?: number
  /** Monotonic clock for the run's time limit; defaults to Date.now. */
  clock?: () => number
}

/** One step's record: ids, counts, statuses; never text (internal/rules StepRecord). */
export interface StepRecord {
  index: number
  step_id: string
  kind: string
  status: 'ok' | 'skipped' | 'ended' | 'failed' | 'unavailable' | 'truncated'
  duration_ms: number
  items: number
  output: string
  ids: string[]
  error?: string
  tokens?: number
  estimate?: number
}

/** A planned change of one entity (agenttools.Change). */
export interface Change {
  entity: string
  entityId: string
  create?: boolean
  patch: Record<string, unknown>
}

/** One entity's planned changes merged in plan order. */
export interface MergedChange {
  entity: string
  id: string
  create: boolean
  patch: Record<string, unknown>
}

export interface RoutineNotice { ruleId: string; ruleName: string; runId: string; stepId: string; text: string; taskId?: string; at: number }
export interface RuleEvent { ruleId: string; ruleName: string; taskId?: string; taskTitle?: string; at: number }
export interface RoutineDelivery { RuleID: string; RuleName: string; RunID: string; StepID: string; Text: string | null; TaskIDs: string[] }
export interface RoutineMail { RuleID: string; RuleName: string; RunID: string; Subject: string; Text: string }

/** A side effect as data (internal/rules sideSpec, the same JSON). */
export interface SideSpec {
  kind: 'notify' | 'fired' | 'webhook' | 'email'
  notice?: RoutineNotice
  fired?: RuleEvent
  hook?: string
  delivery?: RoutineDelivery
  mail?: RoutineMail
  day?: string
}

/** One reviewable item of a proposal (internal/rules ProposalItem, the same JSON). */
export interface ProposalItem {
  key: string
  kind: string
  entity?: string
  id?: string
  fields?: Record<string, unknown>
  before?: Record<string, unknown>
  ai: boolean
  side?: SideSpec
}

export interface RunPlan {
  outcome: 'applied' | 'already_matched' | 'ended' | 'failed' | 'stopped'
  reason?: string
  failedStep: number
  records: StepRecord[]
  /** The overlay: every planned change in plan order. */
  overlay: Change[]
  /** The overlay merged per entity, in plan order (what a commit writes). */
  changes: MergedChange[]
  /** Tasks the plan completes (the commit rolls a series forward or completes open subtasks). */
  completing: string[]
  sides: SideSpec[]
  /** The AI's answers (to mark items "Written by AI"). */
  aiTexts: string[]
  tokens: number
  writesPlanned: number
  /** A test's previews by step id (titles included, never stored). */
  previews?: Record<string, unknown>
}

export type { StepValue }
