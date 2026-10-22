package sync

import (
	"context"
	"fmt"
	"testing"
)

// BenchmarkRecomputeGroupChange measures one group change at the limits
// (OpenSpec change workspaces, task 2.6): a group of 100 members on 50
// projects gains and loses one member, which recomputes all 50 projects.
func BenchmarkRecomputeGroupChange(b *testing.B) {
	s := newTestService(b)
	ctx := context.Background()
	exec := func(q string, args ...any) {
		if _, err := s.db.Exec(q, args...); err != nil {
			b.Fatal(err)
		}
	}
	for i := range 102 {
		exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, fmt.Sprintf("u%03d", i), fmt.Sprintf("u%d@x.y", i), "U")
	}
	w, err := s.CreateWorkspace(ctx, "u000", WorkspaceInput{Name: strp("Big")})
	if err != nil {
		b.Fatal(err)
	}
	for i := 1; i <= 101; i++ {
		if _, err := s.AddWorkspaceMember(ctx, "u000", w.ID, fmt.Sprintf("u%03d", i), WorkspaceMember); err != nil {
			b.Fatal(err)
		}
	}
	g, _, err := s.CreateGroup(ctx, "u000", w.ID, "All")
	if err != nil {
		b.Fatal(err)
	}
	for i := 1; i <= 99; i++ {
		if _, err := s.SetGroupMember(ctx, "u000", w.ID, g.ID, fmt.Sprintf("u%03d", i), true); err != nil {
			b.Fatal(err)
		}
	}
	for p := range 50 {
		id := fmt.Sprintf("p%02d", p)
		ops := []Op{
			{ID: id + "-n", Entity: "project", EntityID: id, Field: "name", Value: []byte(`"P"`), TS: 1, Device: "d"},
			{ID: id + "-w", Entity: "project", EntityID: id, Field: "workspace_id", Value: []byte(fmt.Sprintf("%q", w.ID)), TS: 1, Device: "d"},
		}
		if _, err := s.Apply(ctx, "u000", ops); err != nil {
			b.Fatal(err)
		}
		if _, err := s.SetGroupGrant(ctx, "u000", id, g.ID, RoleEditor, true); err != nil {
			b.Fatal(err)
		}
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// The 100th member joins and leaves: two recomputations of 50 projects.
		if _, err := s.SetGroupMember(ctx, "u000", w.ID, g.ID, "u100", i%2 == 0); err != nil {
			b.Fatal(err)
		}
	}
}
