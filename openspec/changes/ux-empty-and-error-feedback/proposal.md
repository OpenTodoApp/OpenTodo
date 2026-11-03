# Proposal

## Why

Three small but visible gaps remain in the client's feedback:

- A local refusal thrown by the client library (for example "project not found" after a project was deleted on another device) reaches the toast in English. Server errors are already translated by code; local refusals are not.
- The Projects view, when empty, shows only "No projects yet." with no way to start. Labels use the shared empty state with an action; projects do not.
- In the compact sidebar (icon rail) and on touch, a sync error is only in the tooltip. The red dot is unnamed and the error text is unreachable without hover.

## What Changes

- actionError maps the eight local refusal sentences a user can cause to translated messages; an unknown sentence passes through unchanged.
- The Projects empty state becomes the shared EmptyState with a title, one line that distinguishes projects from labels, and a primary New project action that opens the existing prompt.
- A sync error keeps the pill's text label in compact mode and shows the error as a role=alert below the pill, in both layouts. Healthy idle sync stays dot-only in compact mode.
- The nine new messages are added to de, es, fr, it and pt, and to the source catalog.

No API, sync protocol, data model or server change. Not BREAKING.

## Out of scope

- Server errors (already translated by code).
- The sync state machine, retry policy or error wording.
- Project creation, sorting, archiving or the projects table.
- The tooltip itself.

## Capabilities

### Modified Capabilities

- localization: local refusal messages translated by known source sentence.
- project-organization: an empty Projects view offers creation.
- offline-first-sync: a sync error is visible without hover in compact layouts.

## Roadmap

No new roadmap item; this closes feedback gaps found while porting the fork's UX work.
