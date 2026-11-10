## ADDED Requirements

### Requirement: Edit project appearance in the sidebar

The project row menus in Projects and Favourites SHALL offer Rename, Icon and Colour in that order to users who may edit the project under the project header's permissions. Changes SHALL use the existing project operations offline and converge per field on sync.

#### Scenario: Rename in the Projects group
- **WHEN** a user chooses Rename from a project row in Projects
- **THEN** the name becomes an editable field in the same row, Enter or leaving the field saves a valid change, and Escape cancels

#### Scenario: Rename a favourite project
- **WHEN** a user chooses Rename from a project row in Favourites
- **THEN** the existing name dialog opens

#### Scenario: Edit from either sidebar group
- **WHEN** a project owner or admin opens a project's menu in Projects or Favourites and renames it or chooses an icon or colour
- **THEN** the new value is saved to the same project and shown wherever the project is displayed

#### Scenario: A member cannot edit project metadata
- **WHEN** a project editor or viewer opens either sidebar menu
- **THEN** the menu omits Rename, Icon and Colour

### Requirement: Choose appearance while creating sidebar items

The sidebar New project form SHALL offer one control to the left of the name for choosing the icon and colour. The sidebar New label form SHALL offer one control in the same position for choosing the colour. These controls SHALL fit in the existing name row without helper text. A submitted choice SHALL be saved with the new item through the existing local operations and converge on sync. The usual defaults SHALL apply to choices the user leaves untouched.

#### Scenario: Set appearance before creation
- **WHEN** a user chooses an icon and colour for a new project or a colour for a new label and submits the form
- **THEN** the new item has the selected appearance immediately, including offline

#### Scenario: Create with defaults or cancel
- **WHEN** a user creates an item without changing its appearance, or cancels the form after choosing an appearance
- **THEN** a submitted item uses its usual defaults and a cancelled draft creates no item
