# Spec Delta

## ADDED Requirements

### Requirement: The sidebar's project menu
A project's menu in the sidebar, in the Projects tree and in Favourites, SHALL be the project header's menu: the same items for the person's role, with the same handlers, confirmations and dialogs, followed by Move up and Move down for the row where the person may reorder it. A right-click on a sidebar row that has a menu SHALL open that menu and suppress the browser's own, except in a text field (the inline rename) and over selected text; a right-click raised by touch SHALL be suppressed and left to the touch hold. Archiving or deleting a project from the sidebar SHALL go to the Inbox only when that project's page is open, and leave any other page as it is. The All projects page keeps its own row menu.

#### Scenario: The whole menu from the sidebar
- **WHEN** the owner right-clicks a project in the sidebar
- **THEN** its menu opens with the header's items (Duplicate, Save as template, Fields, Move to, Rename, Icon, Archive, Delete, Activity, History, Routines, Display mode, the colours) and Move up and Move down, and the browser's menu does not appear

#### Scenario: The same role rules
- **WHEN** an editor of a shared project opens its sidebar menu
- **THEN** it offers what the header offers an editor, without Rename, Icon, the colours, Archive or Delete

#### Scenario: Archive from another page
- **WHEN** the person is in Today and archives a project from its sidebar menu
- **THEN** the project is archived after the confirmation and Today stays on screen

#### Scenario: Rename keeps the field's menu
- **WHEN** the person right-clicks inside the inline rename field of a sidebar project
- **THEN** no app menu opens and the field's own menu appears
