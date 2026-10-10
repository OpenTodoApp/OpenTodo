# Spec Delta

## ADDED Requirements

### Requirement: Vim keybindings are opt-in
The settings view SHALL offer a "Vim keybindings" switch that is off by default. The preference SHALL be stored on the device only, SHALL take effect immediately without a reload, SHALL be readable offline, and SHALL NOT be synced or sent to the server; signing out clears it with the rest of the local data. Because it is device-local there is nothing to converge between devices.

#### Scenario: Default is off
- **WHEN** a user signs in on a device for the first time
- **THEN** the switch is off and every shortcut behaves exactly as specified in "Keyboard navigation"

#### Scenario: Toggle takes effect at once
- **WHEN** the user turns the switch on and returns to a task view
- **THEN** the mode indicator appears and Normal-mode bindings work without reloading the page

#### Scenario: Preference survives offline reload
- **WHEN** the switch is on and the installed app is reopened without network
- **THEN** Vim keybindings are still enabled

### Requirement: Modes and mode indicator
With Vim keybindings enabled the client SHALL be in exactly one of three modes: Normal (default), Insert (while a text field has focus) and Command (while the command line is open). The current mode SHALL be shown persistently in the shell. Mode is interface state only; it touches no task or project data and has no offline or convergence implications.

#### Scenario: Focusing a field enters Insert
- **WHEN** the user presses `q` or clicks into the quick-add field
- **THEN** the indicator shows Insert and letter keys type into the field

#### Scenario: Escape returns to Normal
- **WHEN** the user is in Insert or Command mode and presses Escape
- **THEN** focus leaves the field or command line, the indicator shows Normal, and any text already typed into a task field is kept

### Requirement: Normal-mode motions and counts
In Normal mode the client SHALL support a count prefix for `j`, `k`, `J` and `K` (`J`/`K` move the selected task in manual order), `gg`/`G` to select the first/last task, `dd` to delete it, `x` to complete or reopen it, `o` to open quick add after the selection and `i` to open its detail panel in Insert mode. Task actions SHALL be applied locally first and recorded as operations, so they work offline and converge.

#### Scenario: Count prefix
- **WHEN** a task is selected and the user types `3j`
- **THEN** the selection moves down three tasks, clamped at the last task

#### Scenario: Delete with dd offline
- **WHEN** the device is offline and the user presses `d` twice with a task selected
- **THEN** the task is deleted immediately, the deletion is uploaded on the next sync, and other devices converge on the tombstone

#### Scenario: Incomplete sequence times out
- **WHEN** the user presses `d` once and nothing within one second
- **THEN** no task is deleted and the pending key is discarded

#### Scenario: Count before G or gg
- **WHEN** the user types `4G` or `4gg`
- **THEN** the fourth task of the list is selected

#### Scenario: Move the selected task with J
- **WHEN** a task is selected in a project list or the Inbox and the user types `2J`
- **THEN** the task moves down two places, recorded as position operations like Alt+Down

#### Scenario: a keeps its default meaning
- **WHEN** a task is selected and the user presses `a`
- **THEN** the inline subtask field opens as without Vim keybindings, which is Insert mode

### Requirement: Command line
In Normal mode `:` SHALL open a one-line command input with completion over `inbox`, `today`, `upcoming`, `completed`, `settings`, `project <name>` (prefix match), `new <title>`, `q` (close panel or clear selection), `sync` and `help`. Enter runs the command, Escape cancels, and an unknown command SHALL show a message without side effects. Commands that write data SHALL use the same local-first path as the equivalent interface action, so they work offline and converge like any edit.

#### Scenario: Navigate by command
- **WHEN** the user types `:tod` and accepts the completion with Enter
- **THEN** the Today view opens and the indicator returns to Normal

#### Scenario: Unknown command
- **WHEN** the user runs `:frobnicate`
- **THEN** a message "Unknown command: frobnicate" is shown and nothing else changes

#### Scenario: Create task by command while offline
- **WHEN** the device is offline, the user is in a project view and runs `:new Buy milk`
- **THEN** the task appears in that project immediately and syncs later like any quick-add entry

### Requirement: Existing shortcuts keep working
Enabling Vim keybindings SHALL NOT remove or change any shortcut specified in "Keyboard navigation": `q`, `j`/`k`, arrows, Enter, `c`, `1`–`4`, Delete, `g` + `i`/`t`/`u`/`c`/`s`, Escape and `?` SHALL behave as before in Normal mode. The `g` prefix SHALL serve both the existing targets and `gg`, and Vim bindings SHALL never fire while typing in a field.

#### Scenario: g prefix is shared
- **WHEN** the user presses `g` then `t`, and later `g` then `g`
- **THEN** the first opens Today and the second selects the first task

#### Scenario: Typing is not intercepted
- **WHEN** the user types `dd` into the quick-add field in Insert mode
- **THEN** the letters appear in the field and no task is deleted

### Requirement: Discoverable Vim help
When Vim keybindings are enabled the `?` overlay SHALL include a Vim section listing every added motion and command with a one-line description, and `:help` SHALL open the same overlay. When disabled the section SHALL be absent so the default help stays short.

#### Scenario: Help with Vim on
- **WHEN** Vim keybindings are on and the user presses `?`
- **THEN** the overlay lists the Normal-mode motions, counts and the command line alongside the default shortcuts

#### Scenario: Help with Vim off
- **WHEN** Vim keybindings are off and the user presses `?`
- **THEN** the overlay shows only the default shortcuts and a hint that Vim keybindings can be enabled in Settings
