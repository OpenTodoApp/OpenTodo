# Tasks

## 1. Contextual sheet

- [x] 1.1 Extend the sheet opener and Shell state with project/section defaults, trigger focus return and close/navigation reset; apply the same defaults to single and batch input with project-override safety. Add interaction tests for repeated adds, batch defaults, No section and context reset. Verify focused Vitest tests and typecheck.
- [x] 1.2 Route phone section/board controls through the sheet, omit the top phone input with both preference states, and preserve desktop inline entry and permissions. Add integration regressions and update quick-add/phone/board docs plus a changelog fragment. Verify focused phone/board/section tests and docs-check.

## 2. Integration verification

- [x] 2.1 Build the web and server, run web tests/lint, bundle budget, strict OpenSpec validation and make check. Verify exit status and record any pre-existing failures.
- [x] 2.2 Run affected browser layout/accessibility checks on throwaway servers at other ports, exercise section/board creation with the keyboard dismissed, and capture before/after phone and desktop screenshots. Verify task destination and absence of competing inline input in the browser.
- [ ] 2.3 Finalize the change for a pull request after review: review the diff, record completed checks and remaining device-only validation, and archive the OpenSpec change in the PR that finishes it. Verify the diff contains only the feature, its specs, tests, documentation and changelog.
