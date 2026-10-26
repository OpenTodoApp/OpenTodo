# Proposal

## Why

Issue [#433](https://github.com/OpenTodoApp/OpenTodo/issues/433) (v0.14.0): the start guide and setup use words a new person cannot know, such as "Lists only", "Companion", "Open Loops first", "the move they serve", "the Loop home", "the Places" and "context". The second step of the start guide asks people to choose between three modes of a method it has not introduced. The three option names are the internal mode names (`lists`, `companion`, `first`) turned into labels, and the descriptions are written in the method's own vocabulary.

A new person's first decision in the app should be one they can make without reading Help.

## What Changes

- **The "How do you want to work?" step** (start guide, step 2) opens with one plain sentence on what Open Loops is and a note that the choice can be changed later.
- **The three choices get descriptive labels and plain one-sentence descriptions.** "Lists only" becomes "Simple lists", "Companion" becomes "Lists with method hints", and "Open Loops first" becomes "Full Open Loops method". The descriptions say what changes on screen, without method words. The stored values `lists`, `companion` and `first` are unchanged.
- **The links and offers say what they do.**
  - "Learn the method: Open Loops" becomes "What is Open Loops?".
  - The starter-labels offer explains what a context is in the same sentence.
  - The start-view offer explains what the Loop home shows.
- **Settings → How you work** uses the same labels and descriptions, because it renders the same chooser. Its card line also drops "its method, Open Loops" for a plain sentence.
- **A copy rule:** onboarding copy (the start guide and its offers) names a method term only together with a plain explanation in the same sentence, or behind a link to its Help page. A test checks the start guide's strings against the method vocabulary.
- **Docs and Help** that quote these labels are updated (`docs/your-first-task.md`, `docs/settings-you.md`, `docs/method/set-up.md`), and so are the five catalogs: de, es, fr, it and pt.

No data, op, API or environment-variable change. The preference values stay the same, so every existing account keeps its mode. Not **BREAKING**.

**Out of scope**:
- Renaming the method, its moves (Catch, Clarify, Place, Do, Review) or destinations (Loop home, Next, Waiting) elsewhere in the app. Those are named features with Help pages and shortcuts, and the method's vocabulary is deliberate.
- The Help method pages' own prose.
- The owner's welcome note and the sign-up screens, which the audit found free of jargon.

ROADMAP.md: no numbered row. This is a copy fix to shipped onboarding (`first-run`, `open-loops-method`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `first-run`: the second step of "Three-step first run" introduces the method in one sentence and uses the new labels and the "What is Open Loops?" link. There's also a new requirement, "Plain words in the start guide".
- `open-loops`: "How you work preference" shows the new display labels next to the unchanged values, and "Choosing how you work in Settings" uses the new link name and explains the start-view offer.

## Impact

- **Code**:
  - `web/src/lib/settingsCopy.ts`: the `how-you-work` labels, descriptions and card line.
  - `web/src/app/method/MethodModeChooser.tsx`: the link and offer strings.
  - `web/src/app/FirstRun.tsx`: the intro sentence in `WorkStep`.
  - `web/src/app/settingsIndex.ts`: the search entry's description.
- **Catalogs**: `web/src/locales/{de,es,fr,it,pt}.json` and `messages.json`. The keys are the English strings, so every changed string needs a new translation, or `make i18n-check` fails.
- **Tests and stories**: `firstRun.test.tsx`, `method/howYouWork.test.tsx`, `help/methodLink.test.tsx`, `appearance.test.tsx`, `sidebar.test.tsx`, `phoneDrawer.test.tsx`, `review/review.test.tsx`, `methodLink.stories.tsx` and `phone.stories.tsx` (they match the old labels), plus the visual baselines of the start guide and the How you work card.
- **Docs**: `docs/your-first-task.md`, `docs/settings-you.md` and `docs/method/set-up.md`; then `make docs` regenerates `web/src/generated/help.json`.
- **Dependencies**: none.
- **Issue**: Fixes #433.
