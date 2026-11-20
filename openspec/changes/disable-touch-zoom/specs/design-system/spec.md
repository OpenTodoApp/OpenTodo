# Spec Delta

## MODIFIED Requirements

### Requirement: Fields never zoom the screen on touch
On a touch screen every text input, text area, select and editable area, and the text inside an editable area, SHALL be at least 16 px, so focusing it never makes the browser zoom in. The desktop sizes SHALL stay as they are. Pinch zoom SHALL stay available by default; a person MAY turn it off for one device with the Appearance switch "Allow pinch zoom" (on by default, remembered per device and never synced), and that choice SHALL NOT affect the 16 px field rule nor the device's own system text size and accessibility zoom. While the switch is on the page viewport SHALL allow user scaling; while it is off the app SHALL set the viewport to disallow user scaling. The switch SHALL appear in Settings → Appearance only on a touch device. When the on-screen keyboard closes, a document the browser left scrolled SHALL return to its place unless the person has zoomed in. The layout check SHALL fail on any such field under 16 px on any screen or overlay.

#### Scenario: Quick add on an iPhone
- **WHEN** a person taps the quick add field in the installed app on an iPhone
- **THEN** the keyboard opens without the screen zooming in, and after it closes nothing scrolls sideways and no gap is left under the app

#### Scenario: Desktop is unchanged
- **WHEN** the same field is shown with a mouse at 1280 px
- **THEN** it keeps its 13 px text, and no "Allow pinch zoom" switch is shown

#### Scenario: A small field fails the check
- **WHEN** a field with 13 px text is on a screen in the layout check's touch emulation
- **THEN** the check fails naming the screen, the field and its size

#### Scenario: Turning off pinch zoom on a phone
- **WHEN** a person turns off "Allow pinch zoom" in Appearance on their phone
- **THEN** pinch zoom no longer zooms the app on that device, their other devices keep it, and fields are still at least 16 px so focusing one does not zoom
