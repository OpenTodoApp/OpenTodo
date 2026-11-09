# Spec Delta

## MODIFIED Requirements

### Requirement: Map block
While maps are on, a `show_map` block SHALL show the given tasks' places and saved places as markers, with the same items as a numbered list under the map; each marker carries its item's number and name. An item with a name or address but no coordinates SHALL be looked up through the server's map proxy, pinned at the first match and marked "found by address"; nothing found is written. While maps are off the block SHALL show the list only and contact no map provider. Activating a list item SHALL open its task or place.

#### Scenario: Maps on
- **WHEN** the model calls `show_map` with two tasks that have places and maps are on
- **THEN** the block shows a map with two numbered markers and a list of the two tasks with their place names

#### Scenario: Maps off
- **WHEN** the owner has turned maps off and the model calls `show_map`
- **THEN** the block shows the list only and the device makes no map request

#### Scenario: Address without coordinates
- **WHEN** maps are on and the model shows a task whose location is only the address "Landsberger Str. 100, München"
- **THEN** the block looks the address up through the map proxy, pins the first match, marks the item "found by address", and the task's stored location is unchanged

### Requirement: Task links in answers
The fixed instructions of the in-app assistant, on the server and on the device, SHALL tell the model to write every task it names in prose as a link of the form `[title](?task=<id>)`. Such a link SHALL render as the app's task link: the task's current title and done state, opening the task when activated, when the task is on this device; otherwise the link text, muted and not a link.

#### Scenario: Linked task
- **WHEN** the answer says "Start with [Pay taxes](?task=t1)" and the user has since renamed t1 to "Pay taxes 2026"
- **THEN** the answer shows "Pay taxes 2026" as a link that opens the task

## ADDED Requirements

### Requirement: Map block explains a missing map
When a `show_map` block cannot draw its map, it SHALL say why above its list: maps are off, no item has coordinates and none could be found by address, this browser cannot draw maps, or the map could not load. While addresses are being looked up it SHALL say so.

#### Scenario: Nothing found
- **WHEN** maps are on and the only item is a task located "Kfz-Service Richard" which the address search cannot find
- **THEN** the block shows the list with the line that none of these places could be found on the map

### Requirement: Instructions on showing blocks
The fixed instructions, on the server and on the device, SHALL tell the model to: show two or more specific tasks with `show_tasks` rather than a list; not restate what a block shows; never claim how a block looks or that a map or view appeared; and, when the user says a block did not show, not call the same display tool again but say what may be missing.

#### Scenario: A block reported missing
- **WHEN** the user replies "this is a list, not a map" after a `show_map` block
- **THEN** the fixed instructions sent with the turn tell the model not to call `show_map` again and to say what may be missing, such as coordinates or maps being off
