## ADDED Requirements

### Requirement: Registered shortcuts across keyboard layouts

The web shortcut dispatcher SHALL resolve an eligible binding by the typed character first. If no typed binding claims the press, it SHALL accept the physical KeyA–KeyZ position for a non-Latin letter or the physical Digit1–Digit9 position for a printable non-digit. A symbol with a typed binding SHALL take precedence over a positional fallback. This rule SHALL apply to each sequence step, respect text entry, composition and the single-key shortcut setting, and pass the matched digit to numeric actions. Matching SHALL work offline and resulting task changes SHALL converge through existing operations.

#### Scenario: Latin layout letter
- **WHEN** a US or French AZERTY keyboard types `a` on an eligible task row
- **THEN** Add subtask opens regardless of the physical key position

#### Scenario: Greek letter and modified shortcuts
- **WHEN** the Greek layout types `α` from KeyA on an eligible row or `κ` from Ctrl+KeyK
- **THEN** Add subtask or Search opens respectively

#### Scenario: Russian sequence
- **WHEN** the Russian layout types `п` then `е` from KeyG and KeyT
- **THEN** the app navigates to Today

#### Scenario: French AZERTY number row
- **WHEN** French AZERTY types `&` from Digit1 on an eligible task and no typed binding claims the key
- **THEN** the task's priority is set to 1

#### Scenario: Typed symbol has precedence
- **WHEN** a key produces a symbol with an eligible binding
- **THEN** the symbol binding runs even when the physical position could trigger another binding

#### Scenario: Text entry and disabled single-key shortcuts
- **WHEN** a bare key eligible for fallback is pressed during text entry, composition or AltGraph input, or with single-key shortcuts disabled
- **THEN** the bare fallback shortcut does not run
