package sync

import (
	"errors"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// fs turns plain switches into the input's pointers.
func fs(m map[string]bool) map[string]*bool {
	out := map[string]*bool{}
	for k, v := range m {
		out[k] = &v
	}
	return out
}

// TestWorkspaceFeaturesNull: a null switch is refused and stores nothing.
func TestWorkspaceFeaturesNull(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	_, err := f.s.UpdateWorkspace(f.ctx, "alice", f.ws, WorkspaceInput{Features: map[string]*bool{"habits": nil}})
	if !errors.Is(err, ErrInvalidInput) || !strings.Contains(err.Error(), "habits") {
		t.Fatalf("null switch: %v", err)
	}
}

// TestWorkspaceFeaturesMerge (workspace-feature-switches D2): a new workspace
// reads every feature on, PATCHes merge per key, an admin may switch, a member
// may not, an unknown key is refused and a stored unknown key is kept.
func TestWorkspaceFeaturesMerge(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob", "carol")
	f.must(f.s.SetWorkspaceMemberRole(f.ctx, "alice", f.ws, "bob", WorkspaceAdmin))
	read := func(user string) map[string]bool {
		t.Helper()
		w, err := f.s.WorkspaceByID(f.ctx, user, f.ws)
		if err != nil {
			t.Fatal(err)
		}
		return w.Features
	}
	if got := read("alice"); got == nil || len(got) != 0 {
		t.Fatalf("new workspace features = %v, want {}", got)
	}
	f.must(f.s.UpdateWorkspace(f.ctx, "alice", f.ws, WorkspaceInput{Features: fs(map[string]bool{"habits": false})}))
	f.must(f.s.UpdateWorkspace(f.ctx, "bob", f.ws, WorkspaceInput{Features: fs(map[string]bool{"focus": false})}))
	if got, want := read("carol"), map[string]bool{"habits": false, "focus": false}; !reflect.DeepEqual(got, want) {
		t.Fatalf("merged = %v, want %v", got, want)
	}
	// Renaming alone leaves the map as it is.
	f.must(f.s.UpdateWorkspace(f.ctx, "alice", f.ws, WorkspaceInput{Name: strp("Home")}))
	if got := read("alice"); len(got) != 2 {
		t.Fatalf("after rename = %v", got)
	}
	if _, err := f.s.UpdateWorkspace(f.ctx, "carol", f.ws, WorkspaceInput{Features: fs(map[string]bool{"habits": true})}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member switch: %v, want ErrForbidden", err)
	}
	_, err := f.s.UpdateWorkspace(f.ctx, "alice", f.ws, WorkspaceInput{Features: fs(map[string]bool{"habit": false, "focus": true})})
	if !errors.Is(err, ErrInvalidInput) || !strings.Contains(err.Error(), `"habit"`) {
		t.Fatalf("unknown key: %v", err)
	}
	if got := read("alice"); got["focus"] {
		t.Fatalf("a refused change was stored: %v", got)
	}
	// A key written by a newer server (before a downgrade) survives a merge.
	if _, err := f.s.db.Exec(`UPDATE workspaces SET features = '{"habits":false,"boards":false}' WHERE id = ?`, f.ws); err != nil {
		t.Fatal(err)
	}
	f.must(f.s.UpdateWorkspace(f.ctx, "alice", f.ws, WorkspaceInput{Features: fs(map[string]bool{"habits": true})}))
	if got, want := read("alice"), map[string]bool{"habits": true, "boards": false}; !reflect.DeepEqual(got, want) {
		t.Fatalf("with a stored unknown key = %v, want %v", got, want)
	}
}

// TestWorkspaceFeaturesOnCreate: a workspace may be created with features off.
func TestWorkspaceFeaturesOnCreate(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	w, err := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Team"), Features: fs(map[string]bool{"habits": false})})
	if err != nil || !reflect.DeepEqual(w.Features, map[string]bool{"habits": false}) {
		t.Fatalf("created = %v %v", w.Features, err)
	}
	if _, err := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Bad"), Features: fs(map[string]bool{"kits": false})}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("unknown key on create: %v", err)
	}
}

// TestWorkspaceFeaturesDefaultWorkspace: the default workspace, even before its
// row exists, reads every feature on and its owner may switch them.
func TestWorkspaceFeaturesDefaultWorkspace(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	list, err := f.s.Workspaces(f.ctx, "dan")
	if err != nil {
		t.Fatal(err)
	}
	var def Workspace
	for _, w := range list {
		if w.Default {
			def = w
		}
	}
	if def.Features == nil || len(def.Features) != 0 {
		t.Fatalf("default features = %v, want {}", def.Features)
	}
	f.must(f.s.UpdateWorkspace(f.ctx, "dan", def.ID, WorkspaceInput{Features: fs(map[string]bool{"notes": false})}))
	w, err := f.s.WorkspaceByID(f.ctx, "dan", def.ID)
	if err != nil || w.Features["notes"] != false || len(w.Features) != 1 {
		t.Fatalf("default after switch = %v %v", w.Features, err)
	}
}

// TestWorkspaceFeaturesMatchWeb: the server knows exactly the ids the web app
// lists in web/src/lib/features.ts, in the same order.
func TestWorkspaceFeaturesMatchWeb(t *testing.T) {
	src, err := os.ReadFile("../../web/src/lib/features.ts")
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(`export const FEATURES = \[([^\]]*)\]`).FindSubmatch(src)
	if m == nil {
		t.Fatal("FEATURES not found in features.ts")
	}
	var web []string
	for _, q := range regexp.MustCompile(`'([a-z-]+)'`).FindAllSubmatch(m[1], -1) {
		web = append(web, string(q[1]))
	}
	if !reflect.DeepEqual(web, WorkspaceFeatures) {
		t.Fatalf("web FEATURES = %v, server = %v", web, WorkspaceFeatures)
	}
}
