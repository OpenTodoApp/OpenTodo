# Proposal

## Why

On a phone the app shows keyboard shortcuts nobody can press ([#1337](https://github.com/OpenTodoApp/OpenTodo/issues/1337), seen at 360 px in the interface audit). Sheets and menus carry key badges (`C`, `Shift+L`, `Delete / Backspace`, `Q`), pickers end with "Enter toggles or creates · Esc closes", and the Settings search field shows `/`. Each one is noise on a small screen and tells the person the app was made for another device.

## What Changes

- **Key badges and keys-only lines are not shown on a device used by touch alone.** A phone or a tablet with no mouse, trackpad or hovering pen draws no shortcut badge in menus, sheets, buttons, tooltips, the palette and fields, and no line that only names keys.
- **They return when a key can be pressed.** Every computer keeps them, a touch laptop included. A phone or tablet shows them as soon as a mouse or trackpad is attached, or at the first press on a hardware keyboard.
- **Nothing is left behind**: no empty gap, no stray separator, no "then" or "or" without its keys.
- **Reference stays.** The cheat sheet and the keyboard guide in Help list every key on every device. Shortcuts stay announced to assistive technology.
- **"Show shortcut hints" is unchanged**: it still decides whether badges are printed in the chrome; this change decides whether any badge is drawn at all on the device.

Out of scope: rewriting sentences that mention a key among other things ("Labels group tasks across projects. Add one to a selected task with L, or create one here."); they keep their key, see the design. Touch gestures, row titles, header room and sheets on phones belong to `shell-touch`, `phone-row-titles`, `phone-header-room` and `sheet-drag-dismiss`. No new preference, no change to the registry or to any shortcut.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `keyboard-shortcuts`: a new requirement says where shortcut hints are shown: only where a key can be pressed, with the cheat sheet and the guide exempt.

## Impact

- `web/src/index.css`: one rule. `web/src/lib/keyboardSeen.ts`: the first hardware key press, loaded outside the first load.
- `web/src/ui` (`Tooltip`) and about twenty screens in `web/src/app`: a `data-kbd-hint` or `data-kbd-keep` attribute on existing elements. No new string, no new dependency.
- No server change, no op field, no stored preference, no environment variable. First load: the entry chunk is unchanged (145.9 KB gzip of 146 KB); the detector is a lazy chunk under 1 KB.
- Screenshots: phone baselines taken with touch emulation that show a key badge or a keys-only line change; desktop baselines do not.
