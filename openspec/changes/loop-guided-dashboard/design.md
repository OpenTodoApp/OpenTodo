# Design

## Context

Observed (`LoopHome.tsx`):
- **Header** with the method link.
- **`QuickAdd`**: the placeholder is "Whatever is on your mind…" and it creates in the Inbox. Typed `#project` still works.
- **Closed-loop line** when everything is clear.
- **Rail**: five cards (Catch, Clarify, Place, Do, Review), each a link to another route (Inbox, triage, the review's project walk, Next, the due rhythm). The next move from `nextMove` (`lib/method/pulse.ts:71-77`) gets the accent and the only primary button.
- **Today's focus.**
- **The Loop pulse**: four figures and a 14-day strip.

`nextMove` returns Clarify whenever `inbox > 0`, which is why Clarify is almost always lit.

Specs:
- `open-loops`: "One method vocabulary" (move ids `catch`, `clarify`, `place`, `do`, `review`, never renamed), "Loop home" and "Loop pulse".
- `method-views`: the rules behind the counts.

## Goals / Non-Goals

**Goals:**
- The home says what to do next and why.
- The work happens on the home.
- One highlight, with its reason.
- Less on screen at rest.

**Non-Goals:**
- New method rules.
- New words.
- A new statistics surface.
- Changing the method modes.

## Decisions

**D1. Layout.** From top to bottom:
1. the compact page header;
2. the Next step card;
3. the stepper, with the pulse line as the stepper's lead;
4. the open move, when one is open.

At rest (`/loop`) no move is open.

```
 Loop home                                         ⋯  ?
 ─────────────────────────────────────────────────────────
 ┌───────────────────────────────────────────────────────┐
 │ Next step                                             │
 │ 3 things in the Inbox are waiting.      [ Clarify ]   │
 └───────────────────────────────────────────────────────┘

  Catch ✓   ● Clarify 3   Place 2   Do 14   Review · due
  ────────────────────────────────────────────────────────
  9 done this week · 11 of 18 decided · oldest in Inbox 9 days   ›
```

With Clarify open (`/loop/clarify`), the same page continues below:

```
  Catch ✓   ● Clarify 3   Place 2   Do 14   Review · due
  ════════════ Clarify ═══════════════════════  2 left ═══
   Book the car service
   notes…
   Do now · Schedule · Move · Delegate · Someday · Trash   (triage's keys)
```

Alternative considered: keeping the five cards and adding the card's reason to the highlighted one. Rejected: the cards are the switchboard the owner rejected, and five equal cards cannot say "this one first".

**D2. The Next step card.**
- `nextMove` keeps its order (Clarify, Place, Review, Do, Catch) and also returns the facts for its sentence:
  - Clarify: "n things in the Inbox are waiting."
  - Place: "n projects have no next action."
  - Review: "Your weekly review is due." (or the Daily check, or the Monthly look)
  - Do: "n next actions are ready."
  - Catch, when every loop is closed: "Your loops are closed." This replaces the closed-loop line.
- The card's one primary button is named by the move ("Clarify", "Walk your projects", "Start the weekly review", "Go to Next", "Catch something"). It opens that move in place. The weekly review, the Daily check and the Monthly look open their own screens, as today.
- The card is the page's only primary action, and the stepper's next move echoes it with the accent and no second primary button.
- Alternative considered: a sentence without a button. Rejected: the card's job is the one action.

**D3. Stepper.**
- A list of five buttons in method order (Catch, Clarify, Place, Do, Review). Each shows its name and either its count (tabular, the unit in its accessible name) or a done mark. Review shows "due" when a rhythm is due.
- ← and → move between steps with roving focus inside the stepper, and Enter opens one. These keys are local to the control and not new registry shortcuts.
- Activating a step opens it in place, and activating the open step closes it.
- The stepper uses the method's order, not the card's priority order, so it reads as a flow. The card names the next step.
- Alternative considered: the GTD order Capture, Clarify, Organise, Reflect, Engage. Rejected for now (see the open questions): the method's own words and order are a spec'd vocabulary across the app, Help and the site.

**D4. A move in place.**
- Each move is one lazy part under the stepper. The address is `/loop/<move id>`, pushed to history, so Back closes it and the page does not reload. Opening `/loop/place` directly opens Place.
- The parts:
  - **Catch**: the capture field with the visible label "Catch into the Inbox", focus kept for the next entry, then the five latest captures and "Open the Inbox".
  - **Clarify**: `TriageView`'s card, embedded, with its single-key decisions and "n left". When the Inbox empties, the part shows its done mark and the card moves on to the next move.
  - **Place**: one row per project without a next action, with an inline "Add a next action" field, then the stalled projects. "Walk your projects" opens the review's project walk.
  - **Do**: Today's focus (moved here from the page body) with its indicator, then the next actions grouped by context (up to five per context), then "Open Next".
  - **Review**: the three rhythms with their last time and whether they are due, each opening its screen, then the "Close the day" or "Day: closed <time>" line.
- Alternative considered: navigating as today. Rejected by the owner ("the page doesn't change").

**D5. The capture field lives in Catch (recommended).**
- The field moves out of the page top into Catch, where its label says where text goes.
- Quick add keeps capturing everywhere: `q` and the add button open the command bar or sheet in Add mode on the Loop home, and they create in the Inbox as before.
- Alternatives considered:
  - Removing capture from the home entirely. Rejected: Catch would be the one move with nothing to do in place.
  - Keeping the field at the top. Rejected: it competes with the Next step card and is the cause of the "drops text into Clarify" confusion.

**D6. Loop pulse as one line.**
- One line under the stepper in the metadata size, muted, with the three figures that read as words. The caution mark stays on "oldest in Inbox" past seven days.
- A chevron opens a popover (a sheet on a phone) with the four figures, the 14-day strip, its text alternative and the Statistics link, as specified today.
- The figures, their definitions and the nothing-written rule are unchanged.

**D7. Phone.**
- Below 768 px the stepper is one row of five compact items (the name above the count, 48 px targets), and it scrolls never.
- An open move takes the screen as a page with Back, using the same `/loop/<move>` address. The Next step card stays at the top of the home.

## Data model

None. Everything is computed on the device from local rows, as today. Captures, triage decisions, a next action added in Place, and focus row actions go through the existing `mutate()` paths. No op schema change.

## Interface budget

- **Chrome above the content:** one header and the Next step card. The card is content, the page's guidance, not chrome. The capture field leaves the top, so the row count drops by one.
- **Visible facts:** the stepper shows one fact per move.
- **Scroll regions:** one, the content column. The open move scrolls with the page.
- **Sidebar:** no change.
- **Shortcuts:** no new registry shortcut. The arrows are local to the stepper, and the triage keys are the existing triage scope.

## Size

No dependency. The home chunk gets smaller. Each move part and the pulse popover are lazy chunks of a few KB, and the triage card is shared with `TriageView`. The first load is unchanged.

## Risks / Trade-offs

- [Embedding triage on the home duplicates its keyboard scope] → the embedded card registers the triage scope only while Clarify is open, and Esc closes the move before leaving the page.
- [Users who relied on the field at the top] → `q` captures from the Loop home, and the Catch move is one click or `/loop/catch`.
- [A deep link `/loop/clarify` on a device with an empty Inbox] → the part shows its done mark and the Next step card. It does not redirect.

## Migration Plan

UI only. `/loop` keeps working, and `/loop/<move>` is additive. Rollback is a revert. Existing links to `/triage`, Next and the review stay valid.

## Open questions for the owner

1. **Words and order.** Keep the method's moves (Catch, Clarify, Place, Do, Review) or adopt GTD's Capture, Clarify, Organise, Reflect, Engage? Recommendation: keep the method's words and order. They are a stable, translated vocabulary in the app, Help and the site bundle (`One method vocabulary`), and the Next step card already puts Review before Do whenever a rhythm is due.
2. **Should `/loop` open the next move by default** instead of showing only the card? Recommendation: no. The card states the step and opens it in one press. Opening it by default would put a triage card in front of someone who came to look, and the Back button would have nothing to close.
3. **Should the Clarify move embed the full triage** (notes, every decision) or a smaller card with the three most used decisions? Recommendation: embed the full triage card. One component and one set of keys is better UX and DX than a second, smaller clarify flow.
