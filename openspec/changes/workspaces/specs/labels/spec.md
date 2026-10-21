## MODIFIED Requirements

### Requirement: Label entity
A label SHALL have a name, a colour, a sort position, creation time, optional deletion time and an additive `workspace_id` (absent or null means the default workspace), and SHALL be created, edited and deleted as operations applied locally first so it works offline and converges under per-field last-writer-wins. On the creating device, names SHALL be unique per workspace ignoring case, so "errand" may exist in both "Personal" and "Work"; a duplicate created concurrently on another device in the same workspace SHALL be kept and offered for merging rather than rejected. The sidebar's Labels group, the labels overview, pickers and `@name` completion SHALL offer the current workspace's labels only, and a task SHALL display only the labels of its own workspace among the ids it carries (other ids are kept, not shown).

#### Scenario: Create a label offline
- **WHEN** the device is offline and the user creates label "errand"
- **THEN** it appears in the sidebar at once with an assigned colour, survives a reload and reaches other devices when the network returns

#### Scenario: Duplicate name on one device
- **WHEN** the user tries to create "Errand" while "errand" exists in the same workspace
- **THEN** the creation is refused with a message pointing to the existing label

#### Scenario: Concurrent creation of the same name
- **WHEN** two devices each create "errand" offline in the same workspace and both sync
- **THEN** both labels exist on every device, shown with a duplicate marker, and a merge action is offered

#### Scenario: Same name in two workspaces
- **WHEN** "errand" exists in "Personal" and the user creates "errand" in "Work"
- **THEN** both exist, each listed in its own workspace only, and the Work label picker offers Work's "errand" alone

#### Scenario: Task moved to another workspace
- **WHEN** a task carrying Personal's "errand" is moved into a project of "Work"
- **THEN** no chip is shown for that id in Work, the id stays in the task's array, and moving the task back shows the chip again
