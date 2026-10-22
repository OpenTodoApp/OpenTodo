// The accessibility exceptions register (OpenSpec accessibility, "Exceptions register
// and statement"; design D1): every WCAG 2.2 AAA criterion the default look does not
// meet, with where it applies, the measured value, why the look wins and the route to
// the criterion. Read by the token contrast test (a text pair may sit below 7:1 only
// when an entry lists it), by the story audit (an enhanced-contrast finding on a
// registered pair passes) and by the repository check that keeps
// docs/accessibility.md in step. Never shipped to the browser.
import register from './exceptions.json'

export interface ExceptionPair { fg: string; bg: string }
export interface Exception {
  id: string
  criterion: string
  where: string
  pairs?: ExceptionPair[]
  measured?: Record<string, string>
  reason: string
  route: string
}

export const EXCEPTIONS: Exception[] = register

/** The contrast a registered text pair must still reach (WCAG 2.2 AA). */
export const EXCEPTION_MIN = 4.5

/** The register entry that covers a token pair, if any; `bg: "*"` covers every background. */
export function exceptionFor(fg: string, bg: string): Exception | undefined {
  return EXCEPTIONS.find((e) => e.pairs?.some((p) => p.fg === fg && (p.bg === '*' || p.bg === bg)))
}

/** The minimum a pair must reach: its own, or the registered minimum when an entry covers it. */
export function registeredMin(fg: string, bg: string, min: number): number {
  return exceptionFor(fg, bg) ? Math.min(min, EXCEPTION_MIN) : min
}
