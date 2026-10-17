package sync

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"
)

// seedScale fills the op log of a fresh database with users × opsPerUser task
// ops (five fields per task), plus a shared project owned by "bob" that
// "alice" is a member of, the shape of OpenSpec change database-concurrency's
// CORE-7 reproduction. It writes rows directly: Apply would take minutes.
func seedScale(tb testing.TB, db *sql.DB, users, opsPerUser int) {
	tb.Helper()
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		tb.Fatal(err)
	}
	defer tx.Rollback()
	exec := func(q string, args ...any) {
		if _, err := tx.ExecContext(ctx, q, args...); err != nil {
			tb.Fatal(err)
		}
	}
	fields := []string{"title", "project_id", "position", "created_at", "notes"}
	seq := 0
	addOp := func(author, scope, entity, id, field, value string) {
		seq++
		exec(`INSERT INTO ops(seq,user_id,op_id,entity,entity_id,field,value,ts,device,received_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
			seq, author, fmt.Sprintf("op%d", seq), entity, id, field, value, seq, "dev-"+author, seq)
		exec(`INSERT INTO op_scopes(seq,scope_id) VALUES(?,?)`, seq, scope)
		exec(`INSERT INTO scope_fields(scope_id,entity,entity_id,field,value,ts,device) VALUES(?,?,?,?,?,?,?)
			ON CONFLICT(scope_id,entity,entity_id,field) DO UPDATE SET value=excluded.value, ts=excluded.ts`,
			scope, entity, id, field, value, seq, "dev-"+author)
	}
	names := []string{"alice", "bob"}
	for i := 0; len(names) < users; i++ {
		names = append(names, fmt.Sprintf("u%04d", i))
	}
	for _, u := range names {
		exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", u)
	}
	// Interleave users so each scope's ops spread over the whole log, as on a
	// real server.
	for n := 0; n < opsPerUser; n++ {
		for _, u := range names {
			task := fmt.Sprintf("%s-t%d", u, n/len(fields))
			f := fields[n%len(fields)]
			addOp(u, PersonalScope(u), "task", task, f, fmt.Sprintf("%q", f))
		}
		if n < opsPerUser/10 {
			task := fmt.Sprintf("shared-t%d", n/len(fields))
			f := fields[n%len(fields)]
			addOp("bob", ProjectScope("p1"), "task", task, f, fmt.Sprintf("%q", f))
		}
	}
	// carol has little data of her own and joined the shared project.
	exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('carol','carol@example.com','carol','h',1)`)
	for n := 0; n < 10; n++ {
		addOp("carol", PersonalScope("carol"), "task", fmt.Sprintf("carol-t%d", n/len(fields)), fields[n%len(fields)], `"x"`)
	}
	exec(`INSERT INTO project_scopes(project_id,owner_id,created_at) VALUES('p1','bob',1)`)
	exec(`INSERT INTO project_members(project_id,user_id,role,created_at) VALUES('p1','bob','owner',1),('p1','alice','editor',1),('p1','carol','editor',1)`)
	if err := tx.Commit(); err != nil {
		tb.Fatal(err)
	}
}

// BenchmarkScaleShared measures List and the first Pull of a member of one
// shared project on a large op log (CORE-7):
//
//	go test ./internal/sync -run '^$' -bench ScaleShared -benchtime 20x
func BenchmarkScaleShared(b *testing.B) {
	ctx := context.Background()
	s := newTestService(b)
	seedScale(b, s.db, 30, 10000)
	for _, u := range []string{"u0001", "alice", "carol"} {
		b.Run("List/"+u, func(b *testing.B) {
			for b.Loop() {
				if _, err := s.List(ctx, u, "task", false); err != nil {
					b.Fatal(err)
				}
			}
		})
		b.Run("Apply/"+u, func(b *testing.B) {
			i := 0
			for b.Loop() {
				i++
				if _, err := s.Apply(ctx, u, []Op{op(fmt.Sprintf("bench-%s-%d", u, i), "task", u+"-t0", "title", `"x"`, int64(1e12)+int64(i), "bench")}); err != nil {
					b.Fatal(err)
				}
			}
		})
		b.Run("Pull/"+u, func(b *testing.B) {
			for b.Loop() {
				if _, _, _, err := s.Pull(ctx, u, 0, "", 0); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

// TestQueryPlansStayInVisibleScopes checks that the hot reads of a user who
// sees several scopes search those scopes' index ranges instead of scanning
// every user's rows or sorting a scope's whole history (CORE-7), with and
// without planner statistics.
func TestQueryPlansStayInVisibleScopes(t *testing.T) {
	s := newTestService(t)
	seedScale(t, s.db, 20, 200)
	scopes := []string{ProjectScope("p1"), PersonalScope("alice")}
	cases := []struct {
		name, query string
		args        []any
		want        string // must appear in the plan
	}{
		{"list", listQuery(2), append(anys(scopes), "task"), "sqlite_autoindex_scope_fields_1"},
		{"pull", pullQuery(2), pullArgs(scopes, 0, 1001), "op_scopes_scope_seq (scope_id=? AND seq>?)"},
	}
	for _, stats := range []bool{false, true} {
		if stats {
			if _, err := s.db.Exec(`ANALYZE`); err != nil {
				t.Fatal(err)
			}
		}
		for _, c := range cases {
			plan := explain(t, s.db, c.query, c.args...)
			// A full scan of a table, the entity index (every user's rows of a
			// kind) or a sort of the whole result (every op of the scopes after
			// the cursor) means the plan left the visible scopes' ranges. Sorts
			// inside a merge arm are bounded by the page limit.
			bad := strings.Contains(plan, "scope_fields_entity") || strings.Contains(plan, "\nTOP USE TEMP B-TREE")
			for _, table := range []string{"scope_fields", "op_scopes", "ops", "o"} {
				bad = bad || strings.Contains(plan, "SCAN "+table+"\n")
			}
			if !strings.Contains(plan, c.want) || bad {
				t.Errorf("%s (stats %v): plan does not stay in the scopes' index ranges:\n%s", c.name, stats, plan)
			}
		}
	}
}

func explain(t *testing.T, db *sql.DB, query string, args ...any) string {
	t.Helper()
	rows, err := db.Query(`EXPLAIN QUERY PLAN `+query, args...)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	b := strings.Builder{}
	b.WriteString("\n")
	for rows.Next() {
		var id, parent, notused int
		var detail string
		if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
			t.Fatal(err)
		}
		if parent == 0 {
			b.WriteString("TOP ")
		}
		b.WriteString(detail + "\n")
	}
	return b.String()
}

// TestPullPagesMergeScopesInOrder walks a member's whole log in small pages:
// the per-scope merge must return every visible op once, in seq order.
func TestPullPagesMergeScopesInOrder(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seedScale(t, s.db, 5, 300)
	var want []int64
	rows, err := s.db.Query(`SELECT seq FROM op_scopes WHERE scope_id IN (?,?) ORDER BY seq`, ProjectScope("p1"), PersonalScope("alice"))
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var q int64
		rows.Scan(&q)
		want = append(want, q)
	}
	rows.Close()
	var got []int64
	cursor := int64(0)
	for range 1000 {
		ops, next, more, err := s.Pull(ctx, "alice", cursor, "", 37)
		if err != nil {
			t.Fatal(err)
		}
		for _, o := range ops {
			got = append(got, o.Seq)
		}
		cursor = next
		if !more {
			break
		}
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("pulled %d ops, want %d in seq order", len(got), len(want))
	}
}
