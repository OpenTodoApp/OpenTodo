# Design

## Context

The set was drawn in inbox-means-unplaced D9 and moments-and-onboarding D1 as calm, token-only line drawings. Reviewed in light and dark across the eight accent themes:
- **Icon-like:** each drawing is one object on a line from edge to edge.
- **Dark theme:** the sunken fill makes objects darker than the canvas.
- **Weak accent:** the 15 % accent fill is barely visible on the dark canvas, because the dark theme keeps the darker button accent in `--color-accent`.
- **Week clear:** its squares are not drawn as the brief describes.

## Goals / Non-Goals

**Goals:**
- A set that reads as one family and as illustration rather than icon.
- Equally clear in both themes and every accent.
- Still small, token-only and checked by the lint.

**Non-Goals:**
- People, mascots or faces.
- Third-party art.
- Animation.
- More drawings.

## Decisions

### D1. The art brief

| Element | Rule |
| --- | --- |
| Canvas | 160 × 120, `fill="none"`, round caps and joins |
| Loop | The brand mark's open loop: centre (80, 54), radius 40, from −15° clockwise round to −85°, so the opening is at the upper right. Fine weight, drawn first, so objects in front hide it |
| Ground | One main line `M40 100h80` with short dashes `M26 100h6M128 100h6` |
| Object | Centred, resting on the ground, at most about 56 × 44, main weight (1.75), filled with `--color-surface` |
| Details | Fine weight (1): steam, rays, pages, trails, seams |
| Accent | One shape, about 14 px, in or just through the loop's opening (around (108, 23)), filled `--color-accent` at 20 %, outlined in `--text-color-accent`. Its own detail line may use the accent text colour at the fine weight |
| Character | Small and object-like: a paper plane, a kite, a sprout, steam. No faces or mascots |

The loop ties the set to the brand mark, and the accent leaving through its opening is the mark's own gesture: the tick escaping the loop. A trail (fine, dashed) may join the object to the accent when the motif is about movement: the plane, the kite.

### D2. Surface fill instead of sunken

The surface token is white in the light theme and lighter than the canvas in the dark theme, so objects lift off the page in both. The sunken surface stays allowed for ground shapes. Rejected: keeping the sunken fill, which reads as a hole in the dark theme.

### D3. The accent outline

The dark theme keeps the darker button colour in `--color-accent`, so a soft fill alone vanishes. The outline in `--text-color-accent` (the bright accent in the dark theme, the accent itself in the light theme) keeps the accent shape visible in every theme. The fill rises from 15 % to 20 %.

### D4. The lint enforces the brief

`illustrationProblems` (scripts/ui-check.mjs, run by `make ui-lint`) now also checks three things:
- stroke widths other than 1.75 and 1
- shape fills other than `none`, the surface, the sunken surface and the accent
- more than one accent-filled shape

The colour, image, text, gradient and 4 KB rules are unchanged. Two weights is a deliberate change of the "one stroke width" rule, recorded in the delta.

### D5. Motifs

| Name | Object | Accent through the opening |
| --- | --- | --- |
| `inbox-zero` | An empty tray, its inner edge in fine line | A paper plane, with a dashed trail from the tray |
| `today-clear` | A mug from the side, steam in fine lines | The sun, with fine rays |
| `week-clear` | A desk calendar with two rings and seven open days as small rings | A kite, with a dashed string |
| `project-new` | An open box with its flaps out | The leaf of a sprout growing from the box |
| `day-done` | A closed notebook lying flat, page edges and a ribbon | A crescent moon, with two small stars |
| `trash-empty` | A bin with its lid on and its handle | A leaf drifting out |

## Risks / Trade-offs

- **The loop repeats in every drawing.** That's the point, but it may feel uniform. Each accent and object differs, and the loop is drawn in the fine weight, so it stays in the background.
- **Small accent detail at 1×.** The accent shapes are about 14 px. They were checked at 1× in all sixteen theme combinations.
- **Baselines.** Every story and screen that shows an empty state gets a new visual baseline.

## Verification

All six were rendered at 1× and 2× in light and dark for the eight accents (emerald, blue, indigo, violet, rose, orange, teal, graphite) and compared with the previous set. The workbench's illustration stories and the empty-state screens were regenerated in the pinned Playwright image.
