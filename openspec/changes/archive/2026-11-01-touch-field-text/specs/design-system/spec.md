## ADDED Requirements

### Requirement: Fields never zoom the screen on touch
On a touch screen every text input, text area, select and editable area, and the text inside an editable area, SHALL be at least 16 px, so focusing it never makes the browser zoom in. The desktop sizes SHALL stay as they are, and the app SHALL never turn off zoom: pinch zoom stays available. When the on-screen keyboard closes, a document the browser left scrolled SHALL return to its place unless the person has zoomed in. The layout check SHALL fail on any such field under 16 px on any screen or overlay.

#### Scenario: Quick add on an iPhone
- **WHEN** a person taps the quick add field in the installed app on an iPhone
- **THEN** the keyboard opens without the screen zooming in, and after it closes nothing scrolls sideways and no gap is left under the app

#### Scenario: Desktop is unchanged
- **WHEN** the same field is shown with a mouse at 1280 px
- **THEN** it keeps its 13 px text

#### Scenario: A small field fails the check
- **WHEN** a field with 13 px text is on a screen in the layout check's touch emulation
- **THEN** the check fails naming the screen, the field and its size
