# Proposal

## Why

The six empty-state drawings (Inbox zero, an empty Today, an empty Upcoming, a new project, Done for today, the empty Trash) follow the token rules, but the owner finds them "nice but not very nice". Side by side they read as enlarged interface icons rather than illustrations:
- They share no motif.
- Every one is a single object on a full-width line.
- In the dark theme the objects are filled with the sunken surface, which is darker than the canvas, so they look like holes.
- The accent fill at 15 % nearly disappears on the dark canvas.
- `week-clear` does not show the seven squares its brief promises.

This change gives the set a stronger art brief and redraws all six against it, keeping everything that made them safe: tokens only, decorative, small, every theme.

## What Changes

- **A recurring motif from the brand mark.** Every drawing sits inside a fine open loop, the brand mark's loop, with its opening at the upper right. The drawing's one accent element leaves through that opening, the way the mark's tick escapes its loop.
- **Two stroke weights.** A main line (1.75) for the object and a fine detail line (1) for the loop, steam, rays, pages and trails.
- **Lifted objects.** Objects are filled with the surface token, so they sit above the canvas in both themes. The sunken surface stays available for ground shapes.
- **A visible accent.** The accent shape is filled with the accent at 20 % and outlined in the accent text colour, which is the bright accent in the dark theme.
- **A consistent stage.** One ground line at the same height with short dashes at its ends, the same loop and the same scale in all six.
- **New motifs** with a little character and no people:
  - **Inbox zero:** an empty tray, with a paper plane leaving.
  - **Today clear:** a mug with steam, with the sun.
  - **Week clear:** a desk calendar with seven open days, with a kite.
  - **New project:** an open box with a sprout, its leaf in the opening.
  - **Day done:** a closed notebook with its ribbon, with a crescent moon.
  - **Trash empty:** a bin with its lid on, with a drifting leaf.
- **The UI lint enforces the new rules:**
  - stroke widths of 1.75 and 1 only
  - shape fills from the surface, sunken and accent tokens only
  - at most one accent-filled shape per drawing

Out of scope: people or mascots (an owner question: whether a CC0 set such as Open Doodles would be acceptable), new illustrations for other screens, animation, and the empty-state pattern itself.

No new dependency. Each drawing grows by about 100 bytes and stays well under the 4 KB limit. No environment variable and no op change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: "Illustrations" (two stroke weights, the surface fill, the accent outline, the open-loop motif) and "Illustration set" (the new motifs).
