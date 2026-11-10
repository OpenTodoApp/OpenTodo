## ADDED Requirements

### Requirement: List or Graph
The Notes page header SHALL offer a List | Graph switch (on a phone, one control in the page bar), the Notes space of the sidebar SHALL list Graph under All notes, and the key `v` on the page SHALL switch between them. Graph mode SHALL be at `/notes?view=graph`, and a standalone note open beside it at `/notes/<id>?view=graph`, so the address can be shared, and Back and reload keep the mode. The last mode shown SHALL be kept on the device, never synced, and every way into Notes that names no mode (`g e`, the palette, the Tasks | Notes switch) SHALL open it, while the sidebar's All notes and Graph name theirs; storage being unavailable SHALL open the List. Both modes SHALL share the page's title, count and search field with its chips. Offline it works the same, since nothing is sent; there is nothing to converge.

#### Scenario: Switch to the graph
- **WHEN** the user on the Notes list chooses Graph
- **THEN** the address becomes `/notes?view=graph`, the graph replaces the list under the same header, and Back returns to the list

#### Scenario: Remembered
- **WHEN** the user leaves Notes in Graph mode and later opens Notes from the sidebar on the same device
- **THEN** Notes opens in Graph mode

#### Scenario: Reload
- **WHEN** the user reloads `/notes?view=graph`
- **THEN** the graph is shown
