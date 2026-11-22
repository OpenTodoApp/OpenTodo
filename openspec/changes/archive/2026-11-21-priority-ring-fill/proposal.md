# Proposal

## Why

A task's completion circle shows its priority by hue alone: a red ring for P1, an orange one for P2. To someone with red–green colour blindness both look like the same olive ring (GitHub issue [#1674](https://github.com/OpenTodoApp/OpenTodo/issues/1674), reported by @davereeck). The bars beside the title already step with priority, but at 12 px they are easy to miss, and the circle is what the eye reads first.

## What Changes

- The circle of an open P1 or P2 task is filled with its priority colour, more for P1 than for P2: a dark disc, a light disc, then the empty P3 and P4 rings. The step in lightness reads without hue, in light and dark, under deuteranopia and protanopia.
- Nothing else changes: the ring colours, the bars, P3 and P4, a completed task's circle and the hover tint stay as they are.

## Design

- **D1 — Fill, not weight.** Weight stepping (a thicker P1 ring, a thinner P4 ring) also tells the levels apart, but it changes the ring of every default task. The fill touches only P1 and P2, which are the rows that need to stand out, and it is the larger difference at 20 px.
- **D2 — Tokens only.** The fill is the priority token at an opacity (`bg-p1/55`, `bg-p2/25`), so every theme, the high-contrast theme and custom themes follow their own priority colours. The percentages were chosen by looking at Today in light and dark through deuteranopia and protanopia matrices: P1 reads clearly darker than P2 in all four, and both stay lighter than a ticked circle, which keeps its check mark.

## Capabilities

- Modified: `row-layouts` ("Priority is never colour alone").

## Impact

- `web/src/app/rowTone.ts` (`PRIORITY_RING`), used by list rows, board cards, the Plan and compact rows; the visual baselines of stories with P1 or P2 tasks.
