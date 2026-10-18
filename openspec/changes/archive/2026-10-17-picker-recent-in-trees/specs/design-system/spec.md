## ADDED Requirements

### Requirement: Recent picks in a project tree
A picker that shows a tree (projects with their sub-projects) SHALL keep the tree's shape. When the tree has at least 12 entries and the device has recent picks for that picker, it SHALL offer up to five of them first under a "Recent" heading and head the tree below "All". A shorter tree SHALL show each entry once, in tree order, with no "Recent" group.

#### Scenario: Short project list has no duplicates
- **WHEN** a user with four projects, three of them picked before as the import target, opens "Tasks without a project go to"
- **THEN** each project is listed once, in tree order, and there is no "Recent" heading

#### Scenario: Long project list offers recent picks
- **WHEN** a user with fifteen projects, one of them picked before, opens the same picker
- **THEN** that project is listed first under "Recent", and the full tree follows under "All"
