## 1. Fixtures

- [x] 1.1 Add `answerRequests(routes)` to `web/src/app/stories/fixtures.tsx`: a fetch stub that answers listed path prefixes with a status and a JSON body and every other request with 404 (design D3); verify the typecheck passes
  - Done: marked as the workbench's stub, so `withClock` and a seed keep it; `tsc -b` passes.

## 2. Existing stories in the inventory

- [x] 2.1 Name the existing story titles in `scripts/ux-audit/screens.json` for workspaces, the settings sections with a panel story, the location page and editor, and the spotlight (design D1); add a `Settings/Navigation` About page story and a location page story to `Screens/Locations`; verify `node scripts/ux-audit/stories.mjs` lists fewer rare screens
  - Done: General → `Settings/Navigation`, Notifications and Capture → `Settings/App`, Integrations, Data, People and Server → their `Settings/*` panels, Workspaces → `Screens/Workspaces`, the location editor and a location's page → `Screens/Locations`, the spotlight → `Shortcuts/Spotlight and cheat sheet`.

## 3. New stories

- [x] 3.1 `Screens/Signed out`: sign-in, owner setup, forgot, reset (form and expired), verify (form and expired), confirm email, account invitation (form and expired), project invite (signed out, and a signed-in member), workspace invite; verify each renders in the workbench without a request leaving the page
  - Done: 13 stories in `web/src/app/signedOut.stories.tsx` (the workspace invite has its expired link too); every request is answered by `answerRequests`.
- [x] 3.2 `Screens/Display`: Today, Today at size xl with high contrast, Upcoming, a project and a saved view, seeded; `Screens/Public list`: the list and its e-ink display (design D4)
  - Done: `web/src/app/display/display.stories.tsx` (5) and `web/src/app/publicList.stories.tsx` (2).
- [x] 3.3 `Screens/Import`, `Screens/Help` (index and a guide), `Screens/Capture` (a shared page), `Screens/Project dialogs` (Fields, Duplicate project) and the voice consent dialog in `Settings/App` (design D5)
  - Done. The voice consent dialog is extracted from `VoiceSettingsSection` as `VoiceConsentDialog` (no behaviour change), so its story renders without the browser's speech support, which the headless browser may lack; no click is scripted.
- [x] 3.4 Name every new title in the inventory; verify `node scripts/ux-audit/stories.mjs` reports 0 rare screens without a story
  - Done: "story coverage: 0 rare screens without a story".

## 4. Gates

- [x] 4.1 Run the accessibility gate with the focus pass on the new stories (`ONLY` set to their ids); fix a story's fixture where it trips the gate, and carry a finding in the screen itself to `ux-fixes-phone`'s findings
  - Done: no axe violation on the 31 new stories. The focus pass finds the display rows focused without a ring: `outline-none` with `focus-visible:outline-3` draws no outline under Tailwind 4, because the outline style stays none. `<li.display-row>` is listed in `scripts/ux-audit/focus-exempt.json`, and the cause, likely shared by most of the exemptions, is in `ux-fixes-phone`'s findings.
- [x] 4.2 Generate the new visual baselines in the pinned Playwright image; verify the visual gate passes in CI
  - Done: 124 baselines from the pinned image (`--update-snapshots=missing`); the other 1,640 captures still match. CI result on the pull request.

## 5. Integration

- [ ] 5.1 CHANGELOG under Unreleased, `docs/design-system.md` (the rare screens are in the workbench); run `make check`; verify it passes
