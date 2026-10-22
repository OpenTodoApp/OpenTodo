# Proposal

## Why

The interface audit's story coverage (M14, OpenSpec change `ux-audit-three-widths`) passes for every core screen, and lists 35 rarely used screens without a story: the signed-out screens (sign in, owner setup, forgot, reset, verify, confirm email), the invitations (account, project, workspace), the public list and the task page's guest view, the display routes, Import, Help, the capture screen, settings sections other than Account and Appearance, Locations and a location, Rules, archived projects, and overlays such as the spotlight, the template dialog, duplicate project, the fields and location dialogs and voice consent. Without a story they have no visual baseline, so a regression there is found by a person, late.

## What Changes

- A `Screens/*` story with fixture data for each rare screen the audit lists (`findings.md`), in light and dark at 375 and 1280 px, under the accessibility gate (with the focus pass) and the visual baselines.
- The inventory names each new story, so the coverage list in the audit report is empty.

Out of scope: changing the screens themselves; core screens (covered). ROADMAP: advances "Next: Design refresh"; no row is closed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: `design-system` "Core screens in the workbench" already requires stories for core screens and lists rare ones; this change covers the rare ones without changing the requirement.

## Impact

New `*.stories.tsx` files and their baselines, `scripts/ux-audit/screens.json` (`story` fields). No production code, no dependency.
