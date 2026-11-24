# Proposal

## Why

Task text is small on a phone, and pinch zoom magnifies the whole page instead of making the text larger and letting it wrap (GitHub issue [#1414](https://github.com/OpenTodoApp/OpenTodo/issues/1414), owner-prioritised). Today a theme's list text size (13, 14 or 15 px) is a design choice, Safari's per-site **aA** setting is hidden, and neither app follows the phone's own text size.

## What Changes

- A per-device setting in Settings → Appearance, **Text size**: Default, Large, Larger, Largest. It scales the whole app's type through the root font size, so everything sized in rem (rows, sheets, the editor, the calendar) grows and reflows instead of being zoomed.
- **Default follows the phone in the apps**: the iPhone app follows Dynamic Type and the Android app the system font scale. In a browser, Default is the browser's own text size, as today. Large, Larger and Largest override the phone.
- Remembered on the device, applied before the first frame, never synced or exported. It is separate from the theme, whose list size stays a design choice.
- Fields on a touch screen stay at least 16 px and grow with the text size.

## Out of scope

- Changing the theme's list text size or the density setting.
- Native screens of the shells (first-run screen, widgets), which already follow the system size.

Advances the ROADMAP accessibility work (WCAG 2.2 AA, 1.4.4 Resize text). No new environment variable, no op-log change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `appearance-preferences`: a per-device text size.
- `native-shells`: the shells let the web app follow the system text size.
