package backup

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

func testManifest() Manifest {
	return Manifest{Format: ManifestFormat, FormatVersion: ManifestVersion, AppVersion: "test", SchemaVersion: store.LatestVersion(),
		CreatedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC).Format(time.RFC3339), Generation: "0123456789abcdef0123456789abcdef"}
}

func taskOp(id, entityID, title string, ts int64) opsync.Op {
	v, _ := json.Marshal(title)
	return opsync.Op{ID: id, Entity: "task", EntityID: entityID, Field: "title", Value: v, TS: ts, Device: "dev"}
}

// Writers keep committing ops through the sync service while snapshots are taken;
// every snapshot must open cleanly, pass integrity_check, contain every op committed
// before it began, and have a fields row for every op (ops and fields are written
// in one transaction, so a torn snapshot would show ops without fields).
func TestSnapshotIsConsistentUnderConcurrentWrites(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	syncSvc := opsync.NewService(e.db)
	stop := make(chan struct{})
	var wg sync.WaitGroup
	for w := 0; w < 3; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; ; i++ {
				select {
				case <-stop:
					return
				default:
				}
				ops := []opsync.Op{
					taskOp(fmt.Sprintf("w%d-%d-a", w, i), fmt.Sprintf("t%d-%d", w, i), "x", int64(1000+i)),
					taskOp(fmt.Sprintf("w%d-%d-b", w, i), fmt.Sprintf("t%d-%d", w, i), "y", int64(1001+i)),
				}
				if _, err := syncSvc.Apply(ctx, "u1", ops); err != nil {
					t.Error(err)
					return
				}
			}
		}(w)
	}
	defer func() { close(stop); wg.Wait() }()

	for round := 0; round < 5; round++ {
		time.Sleep(20 * time.Millisecond)
		var before int64
		if err := e.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(seq),0) FROM ops`).Scan(&before); err != nil {
			t.Fatal(err)
		}
		path, err := e.svc.snapshot(ctx)
		if err != nil {
			t.Fatal(err)
		}
		snap, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
		if err != nil {
			t.Fatal(err)
		}
		var ok string
		if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&ok); err != nil || ok != "ok" {
			t.Fatalf("integrity_check = %q, %v", ok, err)
		}
		var maxSeq, orphans int64
		snap.QueryRow(`SELECT COALESCE(MAX(seq),0) FROM ops`).Scan(&maxSeq)
		if err := snap.QueryRow(`SELECT COUNT(*) FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE NOT EXISTS (SELECT 1 FROM scope_fields f
			WHERE f.scope_id = s.scope_id AND f.entity = o.entity AND f.entity_id = o.entity_id AND f.field = o.field)`).Scan(&orphans); err != nil {
			t.Fatal(err)
		}
		snap.Close()
		os.Remove(path)
		if maxSeq < before {
			t.Fatalf("snapshot missing committed ops: max seq %d < %d", maxSeq, before)
		}
		if orphans != 0 {
			t.Fatalf("snapshot torn: %d ops without fields", orphans)
		}
		if before == 0 {
			t.Fatal("writers made no progress")
		}
	}
}

func TestArchiveExcludesSecrets(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	key, pass := "S3-SECRET-abcdef", "DAV-PASSWORD-123456"
	if err := e.svc.secrets.Update(map[string]*string{SecretS3Key: &key, SecretWebDAVPass: &pass}); err != nil {
		t.Fatal(err)
	}
	// An earlier backup in the default local destination must not be nested either.
	os.MkdirAll(filepath.Join(e.dir, "backups"), 0o700)
	os.WriteFile(filepath.Join(e.dir, "backups", "opentodo-20260101-000000-00000000.tar"), []byte("OLD-BACKUP-MARKER"), 0o600)

	snap, err := e.svc.snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, compress := range []bool{false, true} {
		var buf bytes.Buffer
		if err := writeArchive(&buf, snap, testManifest(), archiveOptions{compress: compress}); err != nil {
			t.Fatal(err)
		}
		tr, finish, encrypted, err := openArchive(&buf, "")
		if err != nil || encrypted {
			t.Fatalf("open: %v encrypted=%v", err, encrypted)
		}
		var names []string
		var all bytes.Buffer
		for {
			h, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatal(err)
			}
			names = append(names, h.Name)
			io.Copy(&all, tr)
		}
		if err := finish(); err != nil {
			t.Fatal(err)
		}
		if strings.Join(names, ",") != "manifest.json,opentodo.db" {
			t.Fatalf("entries = %v", names)
		}
		for _, needle := range []string{key, pass, "OLD-BACKUP-MARKER", "secrets/"} {
			if bytes.Contains(all.Bytes(), []byte(needle)) {
				t.Fatalf("archive contains %q", needle)
			}
		}
	}
}

// The map tile cache (task-locations D4) lives under <data>/cache/maps and is
// never part of a backup: only the database, attachment files and the listed
// extras are archived.
func TestArchiveExcludesMapCache(t *testing.T) {
	e := newTestEnv(t)
	dir := filepath.Join(e.dir, "cache", "maps", "ab")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "abcd.bin"), []byte("TILE"), 0o640); err != nil {
		t.Fatal(err)
	}
	files, err := attachmentFiles(e.dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		if strings.Contains(f.path, "cache") || strings.HasPrefix(f.name, "cache/") {
			t.Fatalf("backup would include %s", f.path)
		}
	}
	for _, p := range e.svc.extraFiles() {
		if strings.Contains(p, "cache") {
			t.Fatalf("backup would include %s", p)
		}
	}
}

func TestManifestDescribesContent(t *testing.T) {
	e := newTestEnv(t)
	snap, err := e.svc.snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	size, sum, _ := fileDigest(snap)
	var buf bytes.Buffer
	if err := writeArchive(&buf, snap, testManifest(), archiveOptions{compress: true, passphrase: "pw", chunkSize: 4096}); err != nil {
		t.Fatal(err)
	}
	tr, _, encrypted, err := openArchive(&buf, "pw")
	if err != nil || !encrypted {
		t.Fatalf("open: %v %v", err, encrypted)
	}
	h, _ := tr.Next()
	if h.Name != ManifestName {
		t.Fatalf("first entry %s", h.Name)
	}
	var m Manifest
	if err := json.NewDecoder(tr).Decode(&m); err != nil {
		t.Fatal(err)
	}
	if !m.Encrypted || m.Compression != CompressionGzip || len(m.Files) != 1 || m.Files[0].SHA256 != sum || m.Files[0].Size != size || m.SchemaVersion != store.LatestVersion() {
		t.Fatalf("manifest = %+v", m)
	}
}

func TestArchiveNamePattern(t *testing.T) {
	ts := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	for _, c := range []struct {
		gz, enc bool
		want    string
	}{
		{false, false, "opentodo-20260102-030405-abcdef01.tar"},
		{true, false, "opentodo-20260102-030405-abcdef01.tar.gz"},
		{true, true, "opentodo-20260102-030405-abcdef01.tar.gz.enc"},
	} {
		got := ArchiveName(ts, "abcdef0123456789", c.gz, c.enc)
		if got != c.want {
			t.Fatalf("got %s want %s", got, c.want)
		}
		if pt, ok := archiveTime(got); !ok || !pt.Equal(ts) {
			t.Fatalf("archiveTime(%s) = %v %v", got, pt, ok)
		}
	}
	if _, ok := archiveTime("opentodo-probe-1.txt"); ok {
		t.Fatal("probe matched archive pattern")
	}
}

// TestBackupExcludesAssistantSecrets (in-app-assistant): provider keys in
// secrets/assistant.json never reach an archive.
func TestBackupExcludesAssistantSecrets(t *testing.T) {
	e := newTestEnv(t)
	key, own := "sk-ant-ASSISTANT-KEY-0001", "sk-user-OWN-KEY-0002"
	// A member's key for their own provider (assistant-member-provider).
	memberOwn := "sk-member-OWN-OPENAI-0003"
	f := settings.NewSecretsFile(e.dir, "assistant")
	if err := f.Update(map[string]*string{"operator:anthropic": &key, "user:u1:anthropic": &own, "user:u2:openai": &memberOwn}); err != nil {
		t.Fatal(err)
	}
	snap, err := e.svc.snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := writeArchive(&buf, snap, testManifest(), archiveOptions{extras: e.svc.extraFiles()}); err != nil {
		t.Fatal(err)
	}
	tr, finish, _, err := openArchive(&buf, "")
	if err != nil {
		t.Fatal(err)
	}
	var all bytes.Buffer
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		all.WriteString(h.Name + "\n")
		io.Copy(&all, tr)
	}
	_ = finish()
	for _, needle := range []string{key, own, memberOwn, "assistant.json", "secrets/"} {
		if bytes.Contains(all.Bytes(), []byte(needle)) {
			t.Fatalf("archive contains %q", needle)
		}
	}
}
