## ADDED Requirements

### Requirement: Pinning notes in write tools
`set_favourite` SHALL accept `kind: "note"` with the id of a standalone note the caller can read, adding it to the user's Favourites at the end or removing it, keeping the order of the other entries, behind the same write permission gate, limits, audit and history as for projects. An id that is not a readable standalone note SHALL be refused with `not_found` and change nothing. The change SHALL be written as an operation, reach devices that are offline on their next sync, and converge with their edits of the favourites list by last-writer-wins. It SHALL work on encrypted accounts, since a favourite holds no content.

#### Scenario: Assistant pins a note
- **WHEN** an allowed assistant calls `set_favourite` with `kind: "note"`, the id of "Wi-Fi" and `favourite: true`
- **THEN** "Wi-Fi" is pinned on the Notes page and in Favourites on the user's devices after sync, and history shows the change as made by an AI assistant

#### Scenario: Unknown note
- **WHEN** an allowed assistant calls `set_favourite` with `kind: "note"` and an id that is not a standalone note of the user
- **THEN** the result is the tool error `not_found` and the favourites are unchanged

#### Scenario: Gate closed
- **WHEN** the user's switch is off and an `agent` token calls `set_favourite` with `kind: "note"`
- **THEN** the result is the tool error `writes_disabled_by_user` and nothing changes
