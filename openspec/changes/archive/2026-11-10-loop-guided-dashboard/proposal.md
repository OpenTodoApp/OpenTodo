# Proposal

## Why

The Loop home (`/loop`, `web/src/app/method/LoopHome.tsx`) is the start view of the Full Open Loops method, and the owner finds it half-developed:

- **The capture field at the top has no stated purpose.** It drops text into the Inbox with no explanation.
- **Clarify is nearly always highlighted, without a reason.** `nextMove` picks Clarify whenever the Inbox holds anything, and every capture from that same page adds to the Inbox.
- **Each move is a link to another page**, so the home is a switchboard rather than a place where work happens.
- **The Loop pulse is four figures and a bar strip** that compete with the moves.

The owner asked for "a dashboard that guides flows".

## What Changes

- **A Next step card** sits at the top. It names exactly one action and its reason, for example "3 things in the Inbox are waiting. Clarify them", with one primary button. The step comes from the existing next-move order (Clarify, Place, Review, Do, then Catch), so the guidance follows the method's fixed order.
- **The five moves become a stepper** in method order: Catch, Clarify, Place, Do, Review.
  - Only moves with work show a count. A move without work shows a quiet done mark.
  - Only the next move has the accent, so the highlight now has the reason on the card above it.
  - The words stay the method's own (`One method vocabulary`).
- **A move opens in place**, below the stepper. The page stays, and the address becomes `/loop/<move>`, so Back closes it and a link opens it.
  - **Catch** holds the capture field, labelled "Catch into the Inbox", and the latest captures.
  - **Clarify** holds the triage card: the first Inbox task with its single-key decisions.
  - **Place** lists the projects without a next action, each with a field to add one.
  - **Do** holds Today's focus, then the next actions by context.
  - **Review** lists the rhythms with when each was last done and whether it is due, plus Close the day.

  A full review still opens its own screen.
- **The capture field leaves the top** and lives in Catch. Quick add (`q`, the add button and the command bar) still captures from everywhere, including the Loop home.
- **The Loop pulse shrinks to one quiet line** under the stepper ("9 done this week · 11 of 18 decided · oldest in Inbox 9 days"). Its figures and the 14-day strip open behind a click.
- **On a phone**, the stepper is one compact row. An open move takes the screen as a page with Back.
- No new op field, entity, route on the server, setting, dependency or shortcut. Not **BREAKING**.

Out of scope:
- Renaming the moves.
- Changing what counts as a next action, stalled or due.
- The method views (Next, Waiting) themselves.
- The weekly review screens.
- The other two method modes' start views.

Roadmap: the "UX polish (2026-11 feedback)" area of ROADMAP.md, row 5. It follows up `open-loops-method`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `open-loops`: the Loop home's layout, the Next step card, the moves opening in place, the capture field's place, and the Loop pulse as a summary line.

## Impact

- Web:
  - `web/src/app/method/LoopHome.tsx`, split into a home and one lazy part per move.
  - `web/src/app/TriageView.tsx`, whose card becomes embeddable.
  - `web/src/lib/method/pulse.ts`, extended so `nextMove` also returns its reason facts.
  - The router's `/loop/<move>`.
  - Stories, tests and strings in every catalogue.
- Server: none.
- Docs: `docs/method/overview.md` and `docs/method/set-up.md` (the Loop home), and the method pages linked from the moves.
- Size: the home's chunk gets smaller. The pulse strip and each move's part load lazily when opened. The first load is unchanged, and the budget is not raised.
