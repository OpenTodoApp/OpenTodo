## ADDED Requirements

### Requirement: Extension icon
The browser extension's toolbar and store icons (16, 48 and 128 px) SHALL be the colour variant of the brand mark, generated from the app's one brand source by the brand script, never drawn by hand, and a test SHALL fail when they differ from the source. The extension's version SHALL be raised when the icons change so the stores and installed copies pick them up.

#### Scenario: Icons regenerated
- **WHEN** the brand script runs
- **THEN** the three extension icons are written from the brand source and `make test-extension` compares them against it

#### Scenario: Toolbar icon
- **WHEN** the extension is loaded in Chrome and in Firefox
- **THEN** the toolbar shows the brand mark on its slate square at 16 px, legible in light and dark browser themes
