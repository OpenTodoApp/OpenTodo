package tenant

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
)

// Upgrades from every released version (OpenSpec change `stability-contract`,
// design D4; docs/stability.md "Upgrades"). Each directory under
// internal/store/testdata/upgrade/ holds the data directory a released
// version wrote in the fixed scenario (scripts/release/upgrade-fixture.sh)
// and what that version reported. The current server opens each one,
// migrates it and must report the same.

const upgradeFixtures = "../store/testdata/upgrade"

// upgradeManifest is what scripts/release/upgrade-scenario.mjs recorded.
type upgradeManifest struct {
	Version   string `json:"version"`
	CreatedAt int64  `json:"created_at"`
	Owner     struct {
		Email, Password string
	} `json:"owner"`
	Member struct {
		Email, Password string
	} `json:"member"`
	Token string `json:"token"`
	IDs   struct {
		Shared string   `json:"shared"`
		Tasks  []string `json:"tasks"`
	} `json:"ids"`
	Attachment *struct {
		ID     string `json:"id"`
		SHA256 string `json:"sha256"`
	} `json:"attachment"`
	MemberEncryption    bool            `json:"member_encryption"`
	PhoneCursor         int64           `json:"phone_cursor"`
	Counts              map[string]*int `json:"counts"`
	Ops                 int             `json:"ops"`
	OpsAfterPhoneCursor int             `json:"ops_after_phone_cursor"`
	Export              struct {
		Format  string `json:"format"`
		Version int    `json:"version"`
		Tasks   int    `json:"tasks"`
	} `json:"export"`
}

func TestUpgradeFromEveryRelease(t *testing.T) {
	dirs, err := filepath.Glob(filepath.Join(upgradeFixtures, "*", "manifest.json"))
	if err != nil || len(dirs) == 0 {
		t.Fatalf("no upgrade fixtures under %s", upgradeFixtures)
	}
	for _, m := range dirs {
		dir := filepath.Dir(m)
		t.Run(filepath.Base(dir), func(t *testing.T) { checkUpgrade(t, dir) })
	}
}

// checkUpgrade opens one fixture with the current server and compares.
func checkUpgrade(t *testing.T, fixture string) {
	raw, err := os.ReadFile(filepath.Join(fixture, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var m upgradeManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	data := t.TempDir()
	untarGz(t, filepath.Join(fixture, "data.tar.gz"), data)
	ctx := context.Background()
	// The tenant's clock is the fixture's: nothing it wrote is old enough for
	// the compaction job to thin, so the op counts stay comparable.
	at := time.UnixMilli(m.CreatedAt).Add(time.Hour)
	tn, err := Open(ctx, testConfig(data), Options{Version: "test", Web: http.NotFoundHandler(), Log: slog.New(slog.DiscardHandler), Now: func() time.Time { return at }})
	if err != nil {
		t.Fatalf("open %s (migrations): %v", m.Version, err)
	}
	defer tn.Close()
	// The one-time conversion of an older database runs as a job.
	jobNamed(t, tn, jobs.Compaction).Run(ctx)
	srv := httptest.NewServer(tn.Handler)
	defer srv.Close()

	owner := newClient(t, srv.URL)
	if st, out := owner.do("POST", "/api/v1/auth/login", map[string]string{"email": m.Owner.Email, "password": m.Owner.Password}); st != 200 {
		t.Fatalf("owner sign-in: %d %v", st, out)
	}
	api := &bearer{t: t, base: srv.URL, token: m.Token}
	if st, out := api.do("GET", "/api/v1/me", nil); st != 200 {
		t.Fatalf("fixture API token: %d %v", st, out)
	}
	for name, want := range upgradeCounts(api, m) {
		if m.Counts[name] != nil && *m.Counts[name] != want {
			t.Errorf("%s: %s count %d after the upgrade, %d before", m.Version, name, want, *m.Counts[name])
		}
	}
	checkUpgradeSync(t, api, m)
	st, exp := api.do("GET", "/api/v1/export", nil)
	tasks, _ := exp["tasks"].([]any)
	if st != 200 || exp["format"] != "opentodo-export" || exp["version"] != float64(1) || len(tasks) != m.Export.Tasks {
		t.Errorf("%s: export %d format %v version %v with %d tasks, want opentodo-export 1 with %d", m.Version, st, exp["format"], exp["version"], len(tasks), m.Export.Tasks)
	}
	if a := m.Attachment; a != nil {
		body := api.raw("GET", "/api/v1/attachments/"+a.ID+"/content")
		if sum := sha256.Sum256(body); hex.EncodeToString(sum[:]) != a.SHA256 {
			t.Errorf("%s: attachment %s unreadable or changed (%d bytes)", m.Version, a.ID, len(body))
		}
	}
	if m.MemberEncryption {
		member := newClient(t, srv.URL)
		if st, out := member.do("POST", "/api/v1/auth/login", map[string]string{"email": m.Member.Email, "password": m.Member.Password}); st != 200 {
			t.Fatalf("member sign-in: %d %v", st, out)
		}
		if st, out := member.do("GET", "/api/v1/encryption/keys", nil); st != 200 || out["keys"] == nil {
			t.Errorf("%s: the member's encryption key record is gone: %d %v", m.Version, st, out)
		}
	}
}

// upgradeCounts reads what upgrade-scenario.mjs counts(), the same way.
func upgradeCounts(api *bearer, m upgradeManifest) map[string]int {
	// A list the version answers with an error counts -1 (the manifest has
	// null for a list the old version did not have, and is not compared).
	list := func(path, key string) int {
		st, out := api.do("GET", path, nil)
		if st != 200 {
			return -1
		}
		l, _ := out[key].([]any)
		return len(l)
	}
	// A task's comments and attachments: a deleted task's are not listed (404).
	own := func(path, key string) int { return max(0, list(path, key)) }
	out := map[string]int{
		"projects":           list("/api/v1/projects", "projects"),
		"sections":           list("/api/v1/sections", "sections"),
		"labels":             list("/api/v1/labels", "labels"),
		"tasks":              list("/api/v1/tasks", "tasks"),
		"tasks_with_deleted": list("/api/v1/tasks?include_deleted=true", "tasks"),
		"reminders":          list("/api/v1/reminders", "reminders"),
		"time_entries":       list("/api/v1/time-entries", "entries"),
		"members":            list("/api/v1/projects/"+m.IDs.Shared+"/members", "members"),
	}
	for _, id := range m.IDs.Tasks {
		out["comments"] += own("/api/v1/tasks/"+id+"/comments", "comments")
		out["attachments"] += own("/api/v1/tasks/"+id+"/attachments", "attachments")
	}
	return out
}

// checkUpgradeSync: a pull from cursor 0 returns every op and covers every
// task; the phone that synced before the upgrade receives only what came
// after its cursor (plus anything the upgrade itself wrote), not everything.
func checkUpgradeSync(t *testing.T, api *bearer, m upgradeManifest) {
	all, seen := api.pull("upgrade-check", 0)
	if len(all) < m.Ops {
		t.Errorf("%s: a pull from cursor 0 returns %d ops, the version had %d", m.Version, len(all), m.Ops)
	}
	for _, id := range m.IDs.Tasks {
		if !seen[id] {
			t.Errorf("%s: no op of task %s in a pull from cursor 0", m.Version, id)
		}
	}
	after, _ := api.pull("fixture-phone", m.PhoneCursor)
	if want := m.OpsAfterPhoneCursor + len(all) - m.Ops; len(after) != want {
		t.Errorf("%s: the phone at cursor %d receives %d ops, want %d", m.Version, m.PhoneCursor, len(after), want)
	}
	for _, op := range after {
		if op.Seq <= m.PhoneCursor {
			t.Errorf("%s: op %d at or before the phone's cursor %d", m.Version, op.Seq, m.PhoneCursor)
			break
		}
	}
}

// bearer calls the API with an API token.
type bearer struct {
	t     *testing.T
	base  string
	token string
}

func (b *bearer) req(method, path string, body io.Reader) *http.Response {
	b.t.Helper()
	req, _ := http.NewRequest(method, b.base+path, body)
	req.Header.Set("Authorization", "Bearer "+b.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		b.t.Fatal(err)
	}
	return resp
}

func (b *bearer) do(method, path string, body any) (int, map[string]any) {
	b.t.Helper()
	var rd io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		rd = strings.NewReader(string(raw))
	}
	resp := b.req(method, path, rd)
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func (b *bearer) raw(method, path string) []byte {
	b.t.Helper()
	resp := b.req(method, path, nil)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil
	}
	return body
}

type pulledOp struct {
	Seq      int64  `json:"seq"`
	EntityID string `json:"entityId"`
}

// pull reads every op from cursor on for device; seen holds their entity ids.
func (b *bearer) pull(device string, cursor int64) ([]pulledOp, map[string]bool) {
	b.t.Helper()
	var all []pulledOp
	seen := map[string]bool{}
	for range 1000 {
		raw, _ := json.Marshal(map[string]any{"device": device, "cursor": cursor, "ops": []any{}})
		resp := b.req("POST", "/api/v1/sync", strings.NewReader(string(raw)))
		var out struct {
			Ops     []pulledOp `json:"ops"`
			Cursor  int64      `json:"cursor"`
			HasMore bool       `json:"hasMore"`
		}
		err := json.NewDecoder(resp.Body).Decode(&out)
		resp.Body.Close()
		if resp.StatusCode != 200 || err != nil {
			b.t.Fatalf("sync pull: %d %v", resp.StatusCode, err)
		}
		for _, op := range out.Ops {
			all = append(all, op)
			seen[op.EntityID] = true
		}
		cursor = out.Cursor
		if !out.HasMore {
			return all, seen
		}
	}
	b.t.Fatal("sync pull did not finish")
	return nil, nil
}

// untarGz unpacks a fixture's data directory.
func untarGz(t *testing.T, path, dst string) {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return
		}
		if err != nil {
			t.Fatal(err)
		}
		name := filepath.Clean(h.Name)
		if strings.HasPrefix(name, "..") || filepath.IsAbs(name) {
			t.Fatalf("%s: unsafe path %q", path, h.Name)
		}
		target := filepath.Join(dst, name)
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o700); err != nil {
				t.Fatal(err)
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				t.Fatal(err)
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := io.Copy(out, io.LimitReader(tr, 64<<20)); err != nil {
				t.Fatal(err)
			}
			out.Close()
		default:
			t.Fatalf("%s: unexpected entry %q", path, fmt.Sprint(h.Typeflag))
		}
	}
}
