package sync

// The workspace partition rules (OpenSpec change workspaces, design D2, D4 and
// D15), shared with web/src/lib/workspaces.ts through
// testdata/workspaces_fixture.json: where an entity belongs is decided on read,
// never written, so the server (CalDAV, MCP, the CLI, the export) and every
// device agree without an extra op.

// PartitionProject is what the partition needs of a project.
type PartitionProject struct {
	WorkspaceID string
	ParentID    string
}

// PartitionTask is what the partition needs of a task.
type PartitionTask struct {
	WorkspaceID string
	ProjectID   string
	ParentID    string
}

// Partition places entities in one account's workspaces.
type Partition struct {
	// Default is the account's default workspace id.
	Default string
	// Known holds the ids of the workspaces the account belongs to.
	Known    map[string]bool
	Projects map[string]PartitionProject
	Tasks    map[string]PartitionTask
}

// maxDepth bounds parent chains so a cycle cannot loop.
const maxDepth = 64

// known maps an empty, unknown or foreign workspace id onto the default: a
// project shared from another account's workspace the user is not in, or a
// workspace this device has not received, reads as the default workspace.
func (p *Partition) known(id string) string {
	if id != "" && p.Known[id] {
		return id
	}
	return p.Default
}

// Project returns the workspace of a project: its root ancestor's own value
// (sub-projects follow their parent; a missing parent ends the chain).
func (p *Partition) Project(id string) string {
	cur, ok := p.Projects[id]
	if !ok {
		return p.Default
	}
	for i := 0; i < maxDepth && cur.ParentID != ""; i++ {
		parent, ok := p.Projects[cur.ParentID]
		if !ok {
			break
		}
		cur = parent
	}
	return p.known(cur.WorkspaceID)
}

// Task returns the workspace of a task: its project's when the project is
// known, else its parent task's, else its own value.
func (p *Partition) Task(id string) string {
	cur, ok := p.Tasks[id]
	if !ok {
		return p.Default
	}
	for i := 0; i < maxDepth; i++ {
		if _, ok := p.Projects[cur.ProjectID]; cur.ProjectID != "" && ok {
			return p.Project(cur.ProjectID)
		}
		parent, ok := p.Tasks[cur.ParentID]
		if cur.ParentID == "" || !ok {
			break
		}
		cur = parent
	}
	return p.known(cur.WorkspaceID)
}

// Own returns the workspace of a label or a view: its own value.
func (p *Partition) Own(workspaceID string) string { return p.known(workspaceID) }
