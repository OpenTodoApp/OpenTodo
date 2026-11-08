package web

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/OpenTodoApp/opentodo/internal/websign"
)

// listFor writes the unsigned list of files, as the build does.
func listFor(t *testing.T, files fstest.MapFS) []byte {
	t.Helper()
	m := websign.Manifest{App: websign.App, Version: "1.3.0", Files: map[string]websign.File{}}
	for p, f := range files {
		sum := sha256.Sum256(f.Data)
		m.Files[p] = websign.File{SHA256: hex.EncodeToString(sum[:]), Size: int64(len(f.Data)), Load: websign.LoadInstall}
	}
	payload, _ := json.Marshal(m)
	env, _ := json.Marshal(websign.Envelope{Format: 1, Payload: base64.RawURLEncoding.EncodeToString(payload), Signatures: []websign.Signature{}})
	return env
}

func TestLogSignature(t *testing.T) {
	files := fstest.MapFS{"index.html": {Data: []byte("<div id=root>")}, "assets/a.js": {Data: []byte("a")}}
	sub := fstest.MapFS{"index.html": files["index.html"], "assets/a.js": files["assets/a.js"], websign.FileName: {Data: listFor(t, files)}}
	var out bytes.Buffer
	logSignature(slog.New(slog.NewTextHandler(&out, nil)), sub)
	if got := out.String(); !strings.Contains(got, `msg="web app" mode=self-built key="" version=1.3.0 refuse=off`) || strings.Contains(got, "WARN") {
		t.Fatalf("log: %s", got)
	}

	// A file changed after the build: the operator is told.
	sub["assets/a.js"] = &fstest.MapFile{Data: []byte("b")}
	out.Reset()
	logSignature(slog.New(slog.NewTextHandler(&out, nil)), sub)
	if got := out.String(); !strings.Contains(got, "level=WARN") || !strings.Contains(got, `first="changed-file assets/a.js"`) {
		t.Fatalf("log: %s", got)
	}

	// No list (the web app not built): nothing.
	out.Reset()
	logSignature(slog.New(slog.NewTextHandler(&out, nil)), fstest.MapFS{})
	if out.Len() != 0 {
		t.Fatalf("log without a list: %s", out.String())
	}
}
