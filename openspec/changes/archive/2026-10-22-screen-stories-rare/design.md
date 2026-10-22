# Design

## Context

The screen inventory (`scripts/ux-audit/screens.json`) names a story title for each entry; the story-coverage check (`scripts/ux-audit/stories.mjs`) fails on core entries without one and lists the rare ones (`findings.md`). A story title covers an entry when a `*.stories.tsx` file declares it in its `meta`. Every story is captured by the visual gate in light and dark at 375 and 1280 px and goes through the accessibility gate with the focus pass, so a story is a baseline. Several rare screens already have workbench stories under a component title (Settings/App, Settings/Data, Settings/Integrations, Settings/Administration, Screens/Workspaces, Screens/Locations, Shortcuts/Spotlight and cheat sheet) that the inventory does not name.

## Goals / Non-Goals

**Goals:**
- Every rare inventory entry names a story title that exists, so the audit's "rare screens without a story" list is empty.
- Each new story renders the screen with fixture data and no server: the frozen clock, sequential ids and a stubbed network, as the core-screen stories do.

**Non-Goals:**
- Changing a screen, its words or its layout; a finding a story makes visible goes to `ux-fixes-phone`.
- Making the coverage check fail on rare screens (the requirement keeps them listed only).

## Decisions

**D1. Reuse a story that already renders the screen; add a story only where none does.** The settings sections are already in the workbench as their panels; the inventory names `Settings/App` (General, Notifications, Capture), `Settings/Data`, `Settings/Integrations`, `Settings/Administration` (People, Server), `Screens/Workspaces`, `Screens/Locations` (a location's list and the location editor) and `Shortcuts/Spotlight and cheat sheet`. A section page that has no panel story yet (About) gets a page story in `Settings/Navigation`, beside the General and Appearance pages there. Alternative: a `Screens/Settings …` story per section duplicating the panels. Rejected: twice the baselines for the same pixels.

**D2. New story files, one per family:** `Screens/Signed out` (sign-in, owner setup, forgot, reset, verify, confirm email, the three invitations, a signed-in member opening a project invite), `Screens/Display` (Today, Today with high contrast at the largest size, Upcoming, a project, a saved view), `Screens/Public list` (the list and its e-ink display), `Screens/Import`, `Screens/Help` (the index and a guide), `Screens/Capture` (the share screen with a shared page) and `Screens/Project dialogs` (Fields and Duplicate project). Voice consent is a state of the Capture settings: a `Settings/App` story clicks the voice switch so the consent dialog is open. Several inventory entries name the same title, as core entries already do (`Screens/Calendar`).

**D3. Screens that talk to the server render through a request stub, not their pure views.** The signed-out screens and the public list read one preview or list by token; a story answers that path with a fixture (`answerRequests` in the story fixtures: path prefix to status and body, everything else 404) so the whole screen renders as a visitor sees it, frame and mark included. The invalid-link states (an expired token) are one story each where the inventory's tour shows that state. Alternative: render the exported `*View` components with props. Rejected for the screens because the view leaves out the screen's frame; the views keep their unit tests.

**D4. Display and public display options come from the address.** The display route takes its options as a prop; the public display reads `location.search` once, so its story sets `?display=1&eink=1` with `history.replaceState` before it renders and restores the address afterwards.

**D5. Scripted states mark themselves pending** (`data-story-pending` until the dialog is open), so the visual gate captures the dialog, as the sidebar and editor stories do.

## Risks / Trade-offs

- [The visual job grows by about 100 captures] → The job is already split in three shards; at about 0.7 s per capture each shard grows by well under a minute.
- [A fixture shape drifts from the server's answer] → The stubs use the same TypeScript types as the client (`ResetPreview`, `ProjectInvitePreview`, `PublicList`…), so the type check catches a renamed field.
- [The display keeps the screen awake and ticks every second] → The frozen clock stops the tick; the wake lock is not available in the headless browser and fails silently, as on a desktop without it.

## Open Questions

- Whether the coverage check should also fail when a rare entry names a story title that does not exist (a misspelling now lists the screen as uncovered instead of failing). Deferred: it changes the "Core screens in the workbench" requirement, not this change's stories.
