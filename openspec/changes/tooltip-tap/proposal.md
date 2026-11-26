# Proposal

## Why

The owner's goal (2026-11-26) is the whole app in the phone UI. The tooltip never opens on touch (`touch-no-tooltips`): right for an icon button, whose tooltip repeats its name. But a search of every tooltip in the app (83 uses) found 43 places where the tooltip carries a fact that is nowhere else on the screen, so a phone cannot read it at all. About two thirds of them sit on something that is not a control: a word, a time, a badge, where a tap does nothing. Among them: the device and address of a session and the full time of a sign-in (Settings, the audit log), "Not yet synced" behind "(pending)" in Updates and in a project's and a task's activity, "Arrived after a newer change and was never applied" behind "(lost)" in a task's history, what a role means in the share dialog, why a passkey is marked suspicious, that a single sign-on setting comes from an environment variable, the breakdown of a day's capacity in the calendar, the absolute time behind "3 h ago", an invite's cut email and a webhook's cut address.

## What Changes

- **On a coarse pointer, a tap on something that is not a control opens its tooltip**, at once; a second tap, a press anywhere else, a scroll, Escape or blur closes it. A tooltip on a control, or inside one, still does not open on touch: the tap is the control's.
- Nothing changes with a mouse or a keyboard.

Out of scope, the next change: the places where the fact sits on a control that has its own action (the Published marker, a saved view's error, a duplicate label's badge, an event's lock reason, the date behind a choice chip, why a time zone cannot be fixed, the capped-series note), which each need the fact shown another way; and announcing a tooltip to a screen reader on touch.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the "Tooltip primitive" requirement gains the tap on a coarse pointer.

## Impact

- Changed: `web/src/ui/Tooltip.tsx` and its tests. Every screen that puts a tooltip on text gets the behaviour with no change of its own.
- No op field, no route, no server change, no environment variable, no dependency.
