# notes-graph Specification

## Purpose
The Connections dialog: a local graph of the links around one note, task or project, two steps deep, with pointer, touch and keyboard interaction and a list equivalent, drawn on the device from local data.

## Requirements

### Requirement: Connections of an item
A note, a task and a project with at least one link to or from it SHALL offer **Show connections** in its menu, a Graph control in the heading of its Linked references, and the palette command "Show connections" while it is open. It SHALL open a dialog showing the item at the centre, on an inner ring every item it links to or that links to it, and on an outer ring the items those link with that are not already shown, with one line between every linked pair shown. Only items the user can read SHALL be shown. The inner ring SHALL show at most 24 items and the outer at most 48, the most recently changed when there are more, with a marker giving how many are left out. The dialog SHALL be a card on a computer and a full-screen sheet below 640 px, close with Escape, and return focus to where it was.

#### Scenario: Two steps
- **WHEN** the note "Trip" links to the task "Book ferry", the note "Packing list" links to "Trip", and "Book ferry" links to the note "Ferry times", and the user chooses Show connections on "Trip"
- **THEN** "Trip" is at the centre, "Book ferry" and "Packing list" are on the inner ring, and "Ferry times" is on the outer ring

#### Scenario: Not offered without links
- **WHEN** a task has no link to or from it
- **THEN** its menu does not offer Show connections

#### Scenario: Hub note
- **WHEN** 40 notes link to the note "Index" and the user opens its connections
- **THEN** 24 are drawn on the inner ring with a marker saying 16 more, and the List view lists all 40

#### Scenario: No access
- **WHEN** a shared project's note links to another member's personal note and the user opens the note's connections
- **THEN** the personal note is not shown

### Requirement: A picture that stays put
The graph SHALL be drawn the same way every time for the same items and the same dialog size, and nothing in it SHALL move unless the user centres another item. Labels SHALL be short enough not to overlap at 360 px, with the full title in the node's accessible name and shown on focus or hover. Moving to a new centre SHALL use the app's short motion, and SHALL be immediate when the user prefers reduced motion.

#### Scenario: Same picture
- **WHEN** the user opens the connections of "Trip" twice without any change in between
- **THEN** every item is in the same place both times

#### Scenario: Reduced motion
- **WHEN** reduced motion is on and the user centres another item
- **THEN** the graph is redrawn around it without animation

### Requirement: Walking the graph
Clicking or tapping a node SHALL centre the graph on it; clicking the centre SHALL open the item and close the dialog. From the keyboard, focus SHALL start on the centre, the arrow keys SHALL move between nodes, Enter SHALL open the focused item, Space SHALL centre on it, Backspace SHALL return to the previous centre, and Escape SHALL close the dialog; these keys SHALL act only inside the dialog.

#### Scenario: Centre and open by keyboard
- **WHEN** the user opens the connections of "Trip", presses Right until "Book ferry" is focused, presses Space and then Enter
- **THEN** the graph centres on "Book ferry", and Enter opens the task "Book ferry"

#### Scenario: Back
- **WHEN** the user has centred on "Book ferry" from "Trip" and presses Backspace
- **THEN** "Trip" is at the centre again

#### Scenario: Phone
- **WHEN** the user on a 390 px phone taps "Packing list" in the connections of "Trip" and then taps it again at the centre
- **THEN** the sheet centres on "Packing list", then opens it

### Requirement: A list equivalent
The dialog SHALL offer a List view showing the centre's **Links** and **Linked from** as lists with the rows of Linked references and the same centre and open actions, and the choice of Graph or List SHALL be remembered on the device. Every node of the graph SHALL be reachable by keyboard and announced with its title, its kind and whether it is linked directly; the graph SHALL be announced as the connections of the centre's title. Every string SHALL be translated in the app's languages.

#### Scenario: Screen reader
- **WHEN** a screen reader user opens the connections of "Trip" and moves to the first node
- **THEN** it is announced with its title, its kind and that it is linked directly, and the List control is reachable right after the title

#### Scenario: List remembered
- **WHEN** the user switches to List and later opens connections of another note on the same device
- **THEN** the dialog opens in List

### Requirement: Drawn on the device, loaded on demand
The dialog SHALL be computed from the device's local data and link index only, SHALL work offline and on an unlocked encrypted account, and SHALL make no request. Its code SHALL be loaded on first use and SHALL not be part of the app's first load. A change arriving by sync while the dialog is open SHALL update it.

#### Scenario: Offline and encrypted
- **WHEN** an encrypted account is unlocked on an offline device and the user opens the connections of a note
- **THEN** the graph is shown and no request is made

#### Scenario: First load
- **WHEN** the web app is built
- **THEN** the dialog's code is not in the first load measured against the bundle budget

#### Scenario: Link added elsewhere
- **WHEN** another device links a new note to "Trip" while this device shows the connections of "Trip", and this device syncs
- **THEN** the new note appears on the inner ring
