package vault

import (
	"fmt"
	"math/rand"
	"strings"
	"testing"
)

// A property test for the vault's file reader (after #1799, #1831 and #1833,
// three fixes for files read half saved or with their front matter lost): a
// project file read empty, cut short at any byte, or with its front matter
// lost or damaged, and then saved in full, loses no task and no project,
// moves no task to another project and duplicates nothing, neither at the
// damaged read nor after the save.

// damage is one way a file can be read: what the reader sees instead of text.
type damage struct {
	name  string
	apply func(r *rand.Rand, text string) string
}

// frontEnd is the index just past the front matter's closing line, or 0.
func frontEnd(text string) int {
	if !strings.HasPrefix(text, "---\n") {
		return 0
	}
	if i := strings.Index(text[4:], "\n---\n"); i >= 0 {
		return 4 + i + len("\n---\n")
	}
	return 0
}

var damages = []damage{
	{name: "empty", apply: func(_ *rand.Rand, _ string) string { return "" }},
	{name: "cut at a byte", apply: func(r *rand.Rand, text string) string {
		return text[:1+r.Intn(len(text)-1)]
	}},
	{name: "cut at a line end", apply: func(r *rand.Rand, text string) string {
		ends := []int{}
		for i := 0; i < len(text)-1; i++ {
			if text[i] == '\n' {
				ends = append(ends, i+1)
			}
		}
		return text[:ends[r.Intn(len(ends))]]
	}},
	{name: "cut inside the front matter", apply: func(r *rand.Rand, text string) string {
		return text[:1+r.Intn(frontEnd(text)-1)]
	}},
	{name: "opentodo-id garbled", apply: func(r *rand.Rand, text string) string {
		lines := strings.Split(text, "\n")
		for i, l := range lines {
			if strings.HasPrefix(l, keyID+":") {
				lines[i] = keyID + ": " + fmt.Sprintf("%x", r.Int63())
			}
		}
		return strings.Join(lines, "\n")
	}},
	{name: "front matter bytes overwritten", apply: func(r *rand.Rand, text string) string {
		b := []byte(text)
		for n := 1 + r.Intn(4); n > 0; n-- {
			b[r.Intn(frontEnd(text))] = "x:-\n #"[r.Intn(6)]
		}
		return string(b)
	}},
	{name: "front matter removed", apply: func(_ *rand.Rand, text string) string {
		return text[frontEnd(text):]
	}},
	{name: "front matter not closed", apply: func(_ *rand.Rand, text string) string {
		end := frontEnd(text)
		if end == 0 {
			return text
		}
		return text[:end-len("---\n")] + text[end:]
	}},
	{name: "front matter opening line lost", apply: func(_ *rand.Rand, text string) string {
		return strings.TrimPrefix(text, "---\n")
	}},
}

func TestDamagedFileReadLosesNothing(t *testing.T) {
	for di, d := range damages {
		for seed := int64(1); seed <= 8; seed++ {
			t.Run(fmt.Sprintf("%s/%d", d.name, seed), func(t *testing.T) {
				r := rand.New(rand.NewSource(seed*31 + int64(di)))
				s := newServer(t)
				projects := map[string]string{} // id → file
				where := map[string]string{}    // task id → project id
				for _, name := range []string{"Home", "Work"} {
					p := s.create("projects", map[string]any{"name": name, "color": "#3b82f6"})
					projects[p] = name + ".md"
					s.create("sections", map[string]any{"name": "Later", "project_id": p})
					for i := 0; i < 2+r.Intn(4); i++ {
						body := map[string]any{"title": fmt.Sprintf("%s task %d", name, i), "project_id": p}
						if r.Intn(2) == 0 {
							body["due"] = map[string]any{"date": "2026-12-0" + fmt.Sprint(1+r.Intn(9))}
						}
						tk := s.create("tasks", body)
						where[tk] = p
						if r.Intn(3) == 0 {
							where[s.create("tasks", map[string]any{"title": fmt.Sprintf("%s sub %d", name, i), "project_id": p, "parent_id": tk})] = p
						}
					}
				}
				v := s.vault(t)
				// One file is read damaged; which one is up to the seed.
				ids := []string{}
				for p := range projects {
					ids = append(ids, p)
				}
				if ids[0] > ids[1] {
					ids[0], ids[1] = ids[1], ids[0]
				}
				hit := projects[ids[r.Intn(len(ids))]]
				full := v.read(t, hit)
				damaged := d.apply(r, full)
				check := func(when string) {
					t.Helper()
					for p := range projects {
						if s.status("/api/v1/projects/"+p) == 404 {
							t.Fatalf("%s: project %s trashed (file %s read as %q)", when, projects[p], hit, damaged)
						}
					}
					// Nothing is duplicated either: no new project, no new task.
					if n := len(s.list("projects")); n != len(projects) {
						t.Fatalf("%s: %d projects, want %d (file %s read as %q)", when, n, len(projects), hit, damaged)
					}
					if n := len(s.list("tasks")); n != len(where) {
						t.Fatalf("%s: %d tasks, want %d (file %s read as %q)", when, n, len(where), hit, damaged)
					}
					for tk, p := range where {
						if s.status("/api/v1/tasks/"+tk) == 404 {
							t.Fatalf("%s: task %s trashed (file %s read as %q)", when, tk, hit, damaged)
						}
						if got := s.get("tasks", tk); got["project_id"] != p {
							t.Fatalf("%s: task %q moved from %s to %v (file %s read as %q)", when, got["title"], projects[p], got["project_id"], hit, damaged)
						}
					}
				}
				v.write(t, hit, damaged)
				v.sync(t)
				check("after the damaged read")
				// The save completes: the file holds its full text again.
				v.write(t, hit, full)
				v.sync(t)
				check("after the full save")
			})
		}
	}
}
