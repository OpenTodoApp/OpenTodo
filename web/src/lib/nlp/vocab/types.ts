// Per-language vocabulary for the quick-add date and time grammar.
//
// Every entry is matched against tokens after `normalize()` (lower case, diacritics
// stripped, "ß" → "ss"), so vocabularies may be written with their natural spelling.
// Multi-word phrases are written with single spaces and matched across tokens.
// Abbreviations that end in "." only match tokens that also end in "." (German "Mi."),
// which keeps two-letter abbreviations from swallowing ordinary words ("do", "so").

export type DayMonthOrder = 'DM' | 'MD'

export interface MonthVocab {
  /** Full names; alone (without a day) they resolve to the first of the month. */
  names: string[]
  /** Abbreviations; only recognised next to a day number (design D4). */
  abbr: string[]
}

export interface Vocabulary {
  /** BCP 47 primary language subtag. */
  code: string
  /** Default interpretation of an ambiguous numeric date such as 12/11. */
  dayMonthOrder: DayMonthOrder
  /** Relative day phrases → offset in days from today (never negative). */
  dayWords: Record<string, number>
  /** Index 0 = Monday … 6 = Sunday; names and abbreviations. */
  weekdays: string[][]
  /** Index 0 = January … 11 = December. */
  months: MonthVocab[]
  /** Words that may precede a date phrase and are swallowed with it ("on", "am", "le"). */
  before: string[]
  /** Words directly before a date phrase that make it the deadline (OpenSpec change deadlines, D7). */
  deadlineWords: string[]
  /** Words that park a task when the line has no date (someday-and-evening D6). */
  somedayWords: string[]
  /** Words that make a task due today and for This Evening ("tonight"). */
  eveningWords: string[]
  /** "next" placed before the noun ("next Wed", "nächsten Mittwoch"). */
  nextBefore: string[]
  /** "next" placed after the noun ("mardi prochain", "martes que viene"). */
  nextAfter: string[]
  /** "this" placed before the noun; resolves like the bare weekday. */
  thisBefore: string[]
  /** "in" for "in N days" ("in", "dans", "tra", "en", "em"). */
  inWords: string[]
  /** Words meaning one, for "in a week". */
  oneWords: string[]
  /** Units for "in N <unit>" and "next <unit>"; minute and year only in reminder and recurrence phrases. */
  units: { minute: string[]; hour: string[]; day: string[]; week: string[]; month: string[]; year: string[] }
  /** "of" between day and month ("3 of February", "3 de febrero"). */
  ofWords: string[]
  /** "at" before a time ("at", "um", "à", "alle", "a las", "às"). */
  atWords: string[]
  /** Hour marker after a number ("15 Uhr", "15 heures"). */
  hourWords: string[]
  /** Whether a bare "15h" / "15h30" token is a time in this language. */
  hourSuffixH: boolean
  /** Named times of day → "HH:MM". */
  timeWords: Record<string, string>
  am: string[]
  pm: string[]
  // ---- recurrence phrases (OpenSpec change quick-add-recurrence, design D2) ----
  /** Words that start a recurrence phrase ("every", "jeden", "tous les"). */
  every: string[]
  /** One-word recurrence forms → the English pattern after "every" ("daily" → "day"). */
  everyOne: Record<string, string>
  /** The collective weekday word ("weekday", "werktags", "jours ouvrés"). */
  weekdayAll: string[]
  /** Ordinal words → 1–4, or -1 for last. */
  ordinals: Record<string, number>
  /** "and" between weekdays. */
  andWords: string[]
  /** "after completion". */
  afterCompletion: string[]
  /** "until" before a date phrase. */
  untilWords: string[]
  /** "for N times": words before and after the count. */
  timesWords: { before: string[]; after: string[] }
  // ---- reminder phrases (quick-add-recurrence, design D3) ----
  /** "remind me", "erinnere mich", "rappelle-moi". */
  remindWords: string[]
  /** "before" / "after" after a reminder offset. */
  beforeWords: string[]
  afterWords: string[]
}
