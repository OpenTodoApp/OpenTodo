# Spec Delta

## MODIFIED Requirements

### Requirement: Confirmation dialog
The client SHALL offer one shared confirmation dialog, used instead of the browser's native confirm prompt. It SHALL name the action and its consequence, start focus on the safe choice, cancel on Escape and return focus to the control that opened it. A destructive confirmation SHALL NOT close on an outside tap. The client SHALL NOT use the browser's native `confirm()`, `prompt()` or `alert()` anywhere: confirmations use this dialog, and a question that needs an answer (such as the address of a link in a note) uses a small dialog of the app that validates the answer before it is applied.

#### Scenario: Destructive confirmation by keyboard
- **WHEN** a keyboard user triggers a destructive action and the confirmation dialog opens
- **THEN** focus is on Cancel, Escape closes the dialog without acting, and focus returns to the control that opened it

#### Scenario: Outside tap does not confirm or dismiss
- **WHEN** a destructive confirmation is open and the user taps outside it
- **THEN** the dialog stays open and nothing is changed

#### Scenario: Leaving a shared project
- **WHEN** a member chooses Leave in the share dialog
- **THEN** the app's confirmation dialog names the project, and the member leaves only after confirming

#### Scenario: Link address in a note
- **WHEN** a user selects text in a note, presses Mod-k and enters `javascript:alert(1)`
- **THEN** the link dialog says the address must start with `https://`, `http://` or `mailto:` and keeps the text unlinked; a valid address links the selection, which syncs like any note edit (offline it is saved locally and uploaded later)

### Requirement: Token lint covers the screens
The token lint SHALL cover the app folder as well as the shared UI folder, with a per-file allow-list that may only shrink and reaches zero when this change is complete. Raw palette colours, hex literals, literal colour functions (`rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` with numeric values), raw text sizes, pixel font sizes, raw radii, raw shadows and the legacy component classes SHALL each fail it. A colour mixed from tokens (`color-mix()` over `var(--ot-…)`) passes.

#### Scenario: New raw size
- **WHEN** a change adds `text-xs` to a screen that is not on the allow-list
- **THEN** the token lint fails naming the file and line

#### Scenario: Allow-list only shrinks
- **WHEN** a change adds a file to the allow-list
- **THEN** the lint's self-test fails

#### Scenario: Literal colour function
- **WHEN** a change styles a screen with `rgb(148 163 184 / 0.35)`
- **THEN** the token lint fails naming the file, the line and the value
