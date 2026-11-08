package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/websign"
	"github.com/OpenTodoApp/opentodo/internal/websign/sign"
)

// writeDist writes a small built web app with an unsigned list trusting spki.
func writeDist(t *testing.T, dir, spki string) {
	t.Helper()
	files := map[string]string{"index.html": "<div id=root></div>", "sw.js": "self.a=1", "assets/index-1.js": "1"}
	m := websign.Manifest{App: websign.App, Version: "1.3.0", Keys: []websign.Key{{SPKI: spki, Role: "release"}}, Files: map[string]websign.File{}}
	for p, body := range files {
		if err := os.MkdirAll(filepath.Join(dir, filepath.Dir(p)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, p), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256([]byte(body))
		m.Files[p] = websign.File{SHA256: hex.EncodeToString(sum[:]), Size: int64(len(body)), Load: websign.LoadInstall}
	}
	m.Worker = websign.Worker{Path: "sw.js", SHA256: m.Files["sw.js"].SHA256}
	payload, _ := json.Marshal(m)
	env, _ := sign.Marshal(&websign.Envelope{Format: 1, Payload: base64.RawURLEncoding.EncodeToString(payload)})
	if err := os.WriteFile(filepath.Join(dir, websign.FileName), env, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestKeygenSignVerify(t *testing.T) {
	dir := t.TempDir()
	keyFile := filepath.Join(dir, "key.pem")
	var out bytes.Buffer
	if err := run([]string{"keygen", "-out", keyFile}, &out, os.Getenv); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(keyFile); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("key file %v %v", info, err)
	}
	if err := run([]string{"keygen", "-out", keyFile}, &out, os.Getenv); err == nil {
		t.Fatal("keygen overwrote an existing key")
	}
	spki := regexp.MustCompile(`public key \(spki\): (\S+)`).FindStringSubmatch(out.String())[1]
	dist := filepath.Join(dir, "dist")
	writeDist(t, dist, spki)
	keys := filepath.Join(dir, "keys.json")
	if err := os.WriteFile(keys, []byte(`{"refuse":false,"keys":[{"spki":"`+spki+`","role":"release"}]}`), 0o644); err != nil {
		t.Fatal(err)
	}

	// Unsigned: passes as self-built, fails when a signature is required.
	out.Reset()
	if err := run([]string{"verify", "-keys", keys, dist}, &out, os.Getenv); err != nil || !strings.Contains(out.String(), "self-built") {
		t.Fatalf("unsigned verify: %v\n%s", err, out.String())
	}
	if err := run([]string{"verify", "-require-signed", dist}, &out, os.Getenv); err == nil {
		t.Fatal("an unsigned build passed -require-signed")
	}

	// Signed with WEB_SIGNING_KEY holding the key's PEM text.
	pemText, _ := os.ReadFile(keyFile)
	env := func(k string) string {
		if k == "WEB_SIGNING_KEY" {
			return string(pemText)
		}
		return ""
	}
	if err := run([]string{"sign", "-version", "v1.4.0", dist}, &out, env); err == nil || !strings.Contains(err.Error(), "v1.4.0") {
		t.Fatalf("sign accepted the wrong version: %v", err)
	}
	if err := run([]string{"sign", "-version", "v1.3.0", dist}, &out, env); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	if err := run([]string{"verify", "-keys", keys, dist}, &out, os.Getenv); err != nil || !strings.Contains(out.String(), "every file matches") {
		t.Fatalf("signed verify: %v\n%s", err, out.String())
	}

	// Over HTTP, then with a proxy that changes the page.
	srv := httptest.NewServer(http.FileServer(http.Dir(dist)))
	defer srv.Close()
	out.Reset()
	if err := run([]string{"verify", "-keys", keys, srv.URL}, &out, os.Getenv); err != nil {
		t.Fatalf("http verify: %v\n%s", err, out.String())
	}
	rewriting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/assets/index-1.js" {
			w.Write([]byte("1;/*injected*/"))
			return
		}
		http.FileServer(http.Dir(dist)).ServeHTTP(w, r)
	}))
	defer rewriting.Close()
	out.Reset()
	if err := run([]string{"verify", "-keys", keys, rewriting.URL}, &out, os.Getenv); err == nil || !strings.Contains(out.String(), "changed-file assets/index-1.js") {
		t.Fatalf("rewritten file passed: %v\n%s", err, out.String())
	}

	// A file changed after signing fails the directory check.
	if err := os.WriteFile(filepath.Join(dist, "assets/index-1.js"), []byte("2"), 0o644); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	if err := run([]string{"verify", "-keys", keys, dist}, &out, os.Getenv); err == nil {
		t.Fatalf("a changed file passed:\n%s", out.String())
	}
	if err := run([]string{"sign", "-key", keyFile, dist}, &out, os.Getenv); err == nil {
		t.Fatal("sign accepted a changed file")
	}
}
