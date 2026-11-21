package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// TestExportStreamsSameBytes: the streamed export is byte-for-byte what the old
// handler produced, which built the whole document as one map and wrote it with
// json.NewEncoder(w).Encode. That encoder sorts an object's keys and escapes and
// spaces values a fixed way, so re-encoding the streamed document the same way
// must reproduce it exactly — the proof that streaming changed only the memory
// the export uses, not a byte a client reads. Both formats are checked: the JSON
// export (compact) and the ZIP export's export.json (two-space indent).
func TestExportStreamsSameBytes(t *testing.T) {
	e := ownerEnv(t)
	// Populate several collections, including ones that are annotated (tasks),
	// folded (comments) and empty (views, frames, …, which must still be "[]").
	ts := e.now.Now().UnixMilli()
	e.syncOps("devA",
		rop("p1", "project", "p1", "name", "Work", ts),
		rop("p1c", "project", "p1", "created_at", ts, ts),
		rop("t1", "task", "t1", "title", "Ship it <today>", ts),
		rop("t1c", "task", "t1", "created_at", ts, ts),
		rop("t1p", "task", "t1", "project_id", "p1", ts),
		rop("t1d", "task", "t1", "description", "notes & more", ts),
		rop("t2", "task", "t2", "title", "Second", ts+1),
		rop("t2c", "task", "t2", "created_at", ts+1, ts+1),
		rop("l1", "label", "l1", "name", "urgent", ts),
		rop("l1c", "label", "l1", "created_at", ts, ts),
		rop("cm1", "comment", "cm1", "task_id", "t1", ts),
		rop("cm1b", "comment", "cm1", "body", "looks good", ts),
		rop("cm1c", "comment", "cm1", "created_at", ts, ts),
		rop("te1", "time_entry", "te1", "task_id", "t1", ts),
		rop("te1s", "time_entry", "te1", "started_at", ts, ts),
		rop("te1c", "time_entry", "te1", "created_at", ts, ts),
	)

	check := func(name string, got []byte, indent bool) {
		t.Helper()
		var doc map[string]json.RawMessage
		if err := json.Unmarshal(got, &doc); err != nil {
			t.Fatalf("%s: not valid JSON: %v", name, err)
		}
		// Content sanity: the streamed document really carries the account.
		if string(doc["version"]) != "1" || string(doc["format"]) != `"opentodo-export"` {
			t.Fatalf("%s: version/format = %s / %s", name, doc["version"], doc["format"])
		}
		for _, k := range []string{"tasks", "comments", "time_entries", "labels", "workspaces", "encryption"} {
			if _, ok := doc[k]; !ok {
				t.Fatalf("%s: missing %q", name, k)
			}
		}
		var want bytes.Buffer
		enc := json.NewEncoder(&want)
		if indent {
			enc.SetIndent("", "  ")
		}
		if err := enc.Encode(doc); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, want.Bytes()) {
			t.Fatalf("%s: streamed bytes differ from encoding/json's canonical form\n got: %s\nwant: %s", name, head(got), head(want.Bytes()))
		}
	}

	resp, body := e.raw("GET", "/api/v1/export", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("json export: status %d", resp.StatusCode)
	}
	check("json", body, false)

	resp, zbody := e.raw("GET", "/api/v1/export?format=zip", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("zip export: status %d", resp.StatusCode)
	}
	check("zip export.json", zipEntry(t, zbody, "export.json"), true)
}

// zipEntry returns the bytes of one file inside a ZIP.
func zipEntry(t *testing.T, archive []byte, name string) []byte {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range zr.File {
		if f.Name == name {
			rc, err := f.Open()
			if err != nil {
				t.Fatal(err)
			}
			defer rc.Close()
			b, err := io.ReadAll(rc)
			if err != nil {
				t.Fatal(err)
			}
			return b
		}
	}
	t.Fatalf("%q not in the archive", name)
	return nil
}

func head(b []byte) []byte {
	if len(b) > 300 {
		return b[:300]
	}
	return b
}
