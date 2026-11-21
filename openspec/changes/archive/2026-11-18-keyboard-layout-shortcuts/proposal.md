## Why

Documented shortcuts stop working on some keyboard layouts (#1521).

## What Changes

- Resolve a typed shortcut first, then accept eligible physical letter and number keys as a fallback.
- Apply the rule to sequence steps and actions that use the matched digit.

This fixes the existing keyboard-shortcuts capability, which has no separate roadmap item for this bug. Custom bindings and separate editor and Vim keymaps are out of scope.
