# Design

## Context

See proposal.md, "Why". The start guide's second step (`WorkStep` in `web/src/app/FirstRun.tsx`) and Settings → How you work (`HowYouWorkSection.tsx`) render one component, `MethodModeChooser`. Its option labels and descriptions come from the settings copy table (`web/src/lib/settingsCopy.ts`, `how-you-work`), which a test holds to Settings limits: a label of at most 4 words, a card line of at most 90 characters, and an option of at most 60 (`settingsCopy.test.ts`, docs/interface-guide.md "Copy"). Catalog keys are the English strings (`web/src/locales/*.json`), so every changed English string is a new key in de, es, fr, it and pt.

The method's vocabulary (moves, principles, the name) lives in `web/src/lib/method/vocabulary.json`, the single source of the `open-loops` "One method vocabulary" requirement.

### Inventory: jargon on the onboarding path (audit of `main`, 2026-10-26)

| # | Where | Current string | Problem |
| --- | --- | --- | --- |
| 1 | `settingsCopy.ts:67` option label | Lists only | the internal mode `lists` as a label; reads as a restriction |
| 2 | `settingsCopy.ts:67` option description | OpenTodo as a plain task app, with no method words. | "method words" assumes the method is known |
| 3 | `settingsCopy.ts:68` option label | Companion | the internal mode `companion`; says nothing about what changes |
| 4 | `settingsCopy.ts:68` option description | Your sidebar as it is; screens name the move they serve. | "move" is method vocabulary |
| 5 | `settingsCopy.ts:69` option label | Open Loops first | method name plus internal mode `first` |
| 6 | `settingsCopy.ts:69` option description | The Loop home first, a sidebar by the Places, a daily check. | three unexplained terms: Loop home, Places, daily check |
| 7 | `settingsCopy.ts:65` card line | How much the app shows its method, Open Loops. Synced; never changes a task. | "its method" before saying what the method is |
| 8 | `MethodModeChooser.tsx:74–76` link | Learn the method: {method} | reads as homework; "the method" is undefined |
| 9 | `MethodModeChooser.tsx:82` offer | Start with four contexts? {names}. Any label that starts with @ is a context. | "context" is never explained |
| 10 | `MethodModeChooser.tsx:89` button and status | Open on the Loop home / This device now opens on the Loop home. | "Loop home" is unexplained at first mention |
| 11 | `MethodModeChooser.tsx:92` offer | Open on the Loop home on this device? Your other devices keep their own start view. | same; "start view" is fine |
| 12 | `settingsIndex.ts:34` search description | Lists only, Companion or Open Loops first: how much the app shows its method | repeats 1, 3 and 5 |
| 13 | `FirstRun.tsx` step 2 | (no introduction at all) | the choice comes before any explanation of Open Loops |

That makes 13 places and 6 distinct terms: Lists only, Companion, Open Loops first, move, Loop home / Places, and context. Step 1 (add a task), step 3 (install), the first-day checklist, the welcome note and the sign-in and sign-up screens have no jargon.

The terms come from the OpenSpec specs. `first-run` "Three-step first run" and `open-loops` "How you work preference" name the options "Lists only", "Companion" and "Open Loops first", and the implementation copied them verbatim, so the specs are modified too.

## Goals / Non-Goals

**Goals:**
- A newcomer can make the step 2 choice from the screen alone.
- The same words in the start guide and in Settings, since it is one component.
- A test keeps method terms out of onboarding unless they're explained or linked.

**Non-Goals:**
- Renaming Open Loops, its moves, the Loop home, Next or Waiting anywhere else.
- Changing the stored preference values or any behaviour of the three modes.

## Decisions

### D1. New wording

The limits are labels of at most 4 words, options of at most 60 characters and card lines of at most 90. The guide's intro is guide copy, not Settings, so only "one idea per sentence" applies to it.

| # | Screen | Current | Proposed |
| --- | --- | --- | --- |
| 13 | Start guide, step 2, new intro under the title | – | "Open Loops is an optional way to clear your head: write everything down, decide what each thing needs, and look back weekly. Choose how much of it you want; you can change this in Settings." |
| 1 | Chooser label | Lists only | **Simple lists** |
| 2 | Chooser description (≤ 60) | OpenTodo as a plain task app, with no method words. | "Just your tasks and lists, nothing else." (39) |
| 3 | Chooser label | Companion | **Lists with method hints** |
| 4 | Chooser description (≤ 60) | Your sidebar as it is; screens name the move they serve. | "Same sidebar, plus a hint on each screen's purpose." (51) |
| 5 | Chooser label | Open Loops first | **Full Open Loops method** |
| 6 | Chooser description (≤ 60) | The Loop home first, a sidebar by the Places, a daily check. | "A home page for the method and a daily check-in." (48) |
| 7 | Settings card line (≤ 90) | How much the app shows its method, Open Loops. Synced; never changes a task. | "How much of the Open Loops method the app shows. Synced; never changes a task." (78) |
| 8 | Link | Learn the method: {method} | "What is {method}?" (renders "What is Open Loops?") |
| 9 | Starter offer | Start with four contexts? {names}. Any label that starts with @ is a context. | "Add four context labels, {names}? A context is where or how you can do a task; any label starting with @ is one." |
| 10 | Offer button and status | Open on the Loop home / This device now opens on the Loop home. | unchanged button; status unchanged |
| 11 | Start-view offer | Open on the Loop home on this device? Your other devices keep their own start view. | "Open on the Loop home on this device? It shows what needs your attention today. Your other devices keep their own start view." |
| 12 | Settings search | Lists only, Companion or Open Loops first: how much the app shows its method | "Simple lists, method hints or the full Open Loops method" |

"Loop home" stays as it is (item 10). It's the destination's name in the sidebar, the palette and the shortcuts, and renaming it is out of scope. Items 11 and 9 now explain it and "context" at first mention, which is what the new requirement asks.

The `{method}` placeholder stays, so a translation can place the name. The vocabulary's `name` is unchanged.

### D2. Values and the export are untouched

`METHOD_MODES`, the stored values and `MODE_LABEL` / `MODE_DESCRIPTION` keep their keys. Only the copy table's English text changes. Existing accounts keep their mode, sync sees no operation, and the JSON export is the same.

### D3. A test for the rule, built from the vocabulary

A new test in `web/src/app/firstRun.test.tsx`:
- renders the start guide's step 2 and both offers;
- collects their text;
- fails when a term from `vocabulary.json` (its `name`, the move names) or the fixed list "Loop home", "Places", "context", "Companion", "Lists only" appears outside a link element and without one of the explanation sentences from D1 in the same text node.

It also asserts that no option label equals a `METHOD_MODES` value or its old label. `settingsCopy.test.ts` already enforces the length limits on the new strings.

### D4. Catalogs

The five catalogs get translations for every new English key in D1. The old keys are dropped by the extractor (`make i18n-check` fails on stale entries otherwise). The German, Spanish, French, Italian and Portuguese wording follows the same plain register, and keeps "Open Loops" untranslated as the catalogs already do.

### Interface budget

Step 2 gains one sentence inside the existing dialog. No chrome row, list, scroll region, sidebar destination or shortcut changes. The sheet stays within two thirds of a 390×844 screen: the layout check's `start-guide` overlay at 390 px verifies this.

### Size

Copy only. No dependency, and no measurable bundle or memory change.

## Risks / Trade-offs

- **[Docs, screenshots and support answers use the old names]** → `docs/method/set-up.md`, `docs/settings-you.md` and `docs/your-first-task.md` are updated in the same change, and `docs/method/overview.md:50` too. Help is regenerated with `make docs`. Docs screenshots of the start guide are re-taken where they show step 2.
- **[Specs elsewhere still say "Companion mode" in scenarios]** (`app-shell`, `appearance-preferences`) → these name the internal mode `companion`, which is unchanged. The new "How you work preference" text maps each value to its label, so the old scenario wording stays correct as a value name.
- **[Translators lose context on short labels]** → the catalog entries for the three labels get a translator comment, in the existing `messages.json` comment convention, saying they are mode names in a choice card.

## Open Questions

- Should "Loop home" itself get a plainer name (for example "Open Loops home") across the app? Deferred. It doesn't change this change's wording, which explains the name instead of replacing it.
