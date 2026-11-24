# Spec Delta

## MODIFIED Requirements

### Requirement: Microsoft To Do structure
Microsoft To Do has no export of its own. The `microsoft-todo-json` format SHALL read a JSON document holding the Microsoft Graph To Do shape, as written by the script in the switch guide: an array (or a `value` array) of `todoTaskList` objects, each with `displayName`, `wellknownListName` and a `tasks` array of `todoTask` objects (`id`, `title`, `body`, `importance`, `status`, `dueDateTime`, `startDateTime`, `completedDateTime`, `createdDateTime`, `reminderDateTime`, `recurrence`, `categories`, `checklistItems`, `linkedResources`). It SHALL be recognised by the presence of `wellknownListName` or of a task with `importance` and `dueDateTime`. Each list SHALL become a project (the `defaultList` SHALL go to the target project, Inbox by default; the `flaggedEmails` list SHALL become a project "Flagged emails"), each task a task, each checklist item a subtask. The switch guide SHALL name this PowerShell and Microsoft Graph export as the way to get the data out of To Do today, and SHALL say that once Microsoft publishes its own To Do export, OpenTodo checks that file and supports it if it can.

#### Scenario: Lists and checklist items
- **WHEN** the file has a list "Home" with a task "Fix tap" holding two `checklistItems`, one `isChecked`
- **THEN** the project "Home" has the task with two subtasks, one completed

#### Scenario: Default list
- **WHEN** a list has `wellknownListName` `defaultList`
- **THEN** its tasks go to the target project (Inbox by default) and the preview notes it

#### Scenario: Not a To Do file
- **WHEN** a JSON array of objects has neither `wellknownListName` nor tasks with `importance`
- **THEN** it is not detected as `microsoft-todo-json` and the generic JSON profiles decide as before

#### Scenario: The guide names the way out
- **WHEN** a Microsoft To Do user opens the Microsoft To Do switch guide
- **THEN** it gives the PowerShell script that reads the lists through Microsoft Graph as today's export, says that Microsoft's own export will be checked and supported if it can be once Microsoft publishes it, and claims no other file is read
