# Proposal: assistant-proposal-editing

## Why

Proposals can be edited only in the list shape. To move a proposed task to another day in the calendar shape, you have to switch to the list and type a date. And "also add X" replaces the open proposal instead of growing it.

## What Changes

- **Drag in the calendar shape:** a proposed item can be dragged, or moved with the keyboard, to another day or time in the proposal's calendar. That changes the proposed date, and the item is marked edited.
- **Editing in every shape:** the pencil works in the calendar, outline and map shapes, not only the list.
- **Proposals that grow:** while a proposal is open, the next turn sends it back to the model, and a new proposal amends it (adds, changes, drops items) instead of replacing it. The card shows what the latest turn changed.
- **Before and after:** a switch on the card shows each item's old and new values side by side.

## Capabilities

### New Capabilities

### Modified Capabilities

- `in-app-assistant`: new requirements for editing in every shape, dragging, and proposals that grow over turns.

## Out of scope

- Proposals from routines (`routines-ai-step` keeps its own review).

## Roadmap

A follow-up to `assistant-generative-ui`.

## Impact

- `ChangeSetReview` and `ProposalShapes` (drag through `calendarDrag.ts`).
- The turn request gains an optional `open_proposal`; the loop seeds its draft from it.
