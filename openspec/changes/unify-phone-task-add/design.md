# Design

## Approach

- Extend the existing sheet opener with optional project/section context and the trigger for focus return. Reset context on close, navigation and global opening; retain it for repeated adds.
- Use the existing 768 px viewport query independently of the phone-screen preference or narrow-column headers. Keep desktop inline entry and the standalone section-input fallback.
- Apply context before parsed fields for single and batch saves; a different explicit project clears the source section. Reuse existing ops, placement, reusable-list and Undo helpers, and the existing overlay for keyboard/safe-area handling.

## Constraints

No data/schema/API changes or dependencies. Removing a phone row stays within the interface budget: at most two chrome rows, seven task properties, six sidebar destinations and three scrollers; no new shortcuts. Crossing the breakpoint does not transfer drafts between editors. Deploy/rollback through the usual web/server build; no migration or APK release.

## Validation

Regression coverage lives in `web/src/app/quickAddSheet.test.tsx` and existing budget/phone/board suites. Prior checks passed: Go/web/performance suites, Chromium/WebKit capture, offline sync, layout, axe and portrait/landscape safe areas. Bundle: entry 99.3/148 KB gzip; first load 668.5/712 KB. The contributor confirmed the phone preview; keyboard dismissal and system Back remain manual review checks. Screenshots remain local artifacts in `dist/issue-2105-{before,after}/`.
