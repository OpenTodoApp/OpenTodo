# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar destinations preference
Each user SHALL have a synced list of promoted destinations, shown among the primary sidebar items. Any of these can be promoted: Loop home, Next, Waiting, Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter. The default is empty. Settings → Appearance SHALL offer one switch per destination. A client SHALL ignore unknown entries and keep the stored value unchanged. While the user's "How you work" preference is `first`, the switches SHALL be shown disabled with a sentence explaining that Open Loops first arranges the sidebar, and the stored list SHALL be kept.

#### Scenario: Promote Someday
- **WHEN** the user turns on Someday in Settings → Appearance
- **THEN** Someday is listed under Calendar in the primary items on every device after sync and leaves the More group

#### Scenario: Companion promotes Next
- **WHEN** a user in `companion` mode turns on Next
- **THEN** Next is listed under Calendar in the primary items on every device after sync

#### Scenario: Older client
- **WHEN** a client that predates this change receives a promotion list containing `next`
- **THEN** it ignores the entry and keeps the stored value unchanged

#### Scenario: Open Loops first
- **WHEN** a user in `first` mode opens Settings → Appearance
- **THEN** the destination switches are disabled with the explanation, and switching back to `companion` restores the promotions they show
