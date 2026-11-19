# Design

## D1. The editor's zone is the due's own

`DoOn` passes the zone it reads and writes the fields in: the due's `tz` when the due has a time and a zone, else the viewer's zone. `localDueOf(due, tz)` is then the stored wall time, and `dueFromView(original, view, tz)` writes it back in the same zone, so a typed time keeps both the zone and the number typed. The inline zone control still gets the viewer's zone, so its chip, preview and `z` toggle (fix to my zone, release) behave as before.

## D2. The hint

Only when the zone differs from the viewer's, one muted line under the Do on time line gives `zonePreview`. That is the zone panel's preview sentence, moved out of `ZoneControl` so both use the one function. It is not a new string.

## Interface budget

No chrome is added above any list. The task panel gains one text line, shown only for a due fixed to another zone. No new property, sidebar destination, scroll region or shortcut.

## Data model

None.
