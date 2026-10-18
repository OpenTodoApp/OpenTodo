## ADDED Requirements

### Requirement: Memberships in a fixed number of queries
Listing a user's shared projects with their members, which every sync exchange does, SHALL take a fixed number of queries however many projects the user belongs to, and SHALL return the same projects and members in the same order (projects by id, members owner first, then by role and email). Membership is server-side data; nothing changes for offline devices, which receive the list on their next sync as before.

#### Scenario: Member of many projects
- **WHEN** a user who belongs to 20 shared projects syncs
- **THEN** their memberships are read with two queries, not one per project

#### Scenario: Member of none
- **WHEN** a user who belongs to no shared project syncs
- **THEN** the membership list is empty
