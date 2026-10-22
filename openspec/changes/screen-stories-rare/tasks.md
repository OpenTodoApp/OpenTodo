## 1. Fixtures

- [ ] 1.1 Add `answerRequests(routes)` to `web/src/app/stories/fixtures.tsx`: a fetch stub that answers listed path prefixes with a status and a JSON body and every other request with 404 (design D3); verify the typecheck passes

## 2. Existing stories in the inventory

- [ ] 2.1 Name the existing story titles in `scripts/ux-audit/screens.json` for workspaces, the settings sections with a panel story, the location page and editor, and the spotlight (design D1); add a `Settings/Navigation` About page story and a location page story to `Screens/Locations`; verify `node scripts/ux-audit/stories.mjs` lists fewer rare screens

## 3. New stories

- [ ] 3.1 `Screens/Signed out`: sign-in, owner setup, forgot, reset (form and expired), verify (form and expired), confirm email, account invitation (form and expired), project invite (signed out, and a signed-in member), workspace invite; verify each renders in the workbench without a request leaving the page
- [ ] 3.2 `Screens/Display`: Today, Today at size xl with high contrast, Upcoming, a project and a saved view, seeded; `Screens/Public list`: the list and its e-ink display (design D4)
- [ ] 3.3 `Screens/Import`, `Screens/Help` (index and a guide), `Screens/Capture` (a shared page), `Screens/Project dialogs` (Fields, Duplicate project) and the voice consent dialog in `Settings/App` (design D5)
- [ ] 3.4 Name every new title in the inventory; verify `node scripts/ux-audit/stories.mjs` reports 0 rare screens without a story

## 4. Gates

- [ ] 4.1 Run the accessibility gate with the focus pass on the new stories (`ONLY` set to their ids); fix a story's fixture where it trips the gate, and carry a finding in the screen itself to `ux-fixes-phone`'s findings
- [ ] 4.2 Generate the new visual baselines in the pinned Playwright image; verify the visual gate passes in CI

## 5. Integration

- [ ] 5.1 CHANGELOG under Unreleased, `docs/design-system.md` (the rare screens are in the workbench); run `make check`; verify it passes
