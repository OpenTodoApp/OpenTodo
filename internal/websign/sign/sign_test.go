package sign_test

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/OpenTodoApp/opentodo/internal/websign"
	"github.com/OpenTodoApp/opentodo/internal/websign/sign"
)

func hash(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

// fixture is a small built web app and its unsigned list naming keys.
func fixture(t *testing.T, version string, spkis ...string) (fstest.MapFS, []byte) {
	t.Helper()
	files := fstest.MapFS{
		"index.html":          {Data: []byte("<!doctype html><div id=root></div>")},
		"sw.js":               {Data: []byte("self.x=1")},
		"assets/index-1.js":   {Data: []byte("console.log(1)")},
		"assets/MapView-2.js": {Data: []byte("map")},
		".gitkeep":            {Data: nil},
	}
	m := websign.Manifest{App: websign.App, Version: version, Worker: websign.Worker{Path: "sw.js", SHA256: hash(files["sw.js"].Data)}, Files: map[string]websign.File{}}
	for _, s := range spkis {
		m.Keys = append(m.Keys, websign.Key{SPKI: s, Role: "release"})
	}
	for p, f := range files {
		if !websign.Listed(p) {
			continue
		}
		load := websign.LoadInstall
		if strings.Contains(p, "MapView") {
			load = websign.LoadLazy
		}
		m.Files[p] = websign.File{SHA256: hash(f.Data), Size: int64(len(f.Data)), Load: load}
	}
	payload, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	env, err := sign.Marshal(&websign.Envelope{Format: websign.Format, Payload: base64.RawURLEncoding.EncodeToString(payload)})
	if err != nil {
		t.Fatal(err)
	}
	return files, env
}

func TestRoundTrip(t *testing.T) {
	k, err := sign.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	pemBytes, err := sign.MarshalPrivateKey(k)
	if err != nil {
		t.Fatal(err)
	}
	k2, err := sign.ParsePrivateKey(pemBytes)
	if err != nil || !k2.Equal(k) {
		t.Fatalf("parse the key back: %v", err)
	}
	spki, _ := sign.SPKI(k)
	fp, _ := sign.Fingerprint(k)
	files, env := fixture(t, "1.3.0", spki)
	signed, err := sign.Dist(files, env, []*ecdsa.PrivateKey{k}, sign.Options{Version: "v1.3.0"})
	if err != nil {
		t.Fatal(err)
	}
	report, m, err := websign.Inspect(signed, []string{spki})
	if err != nil {
		t.Fatal(err)
	}
	if report.Signer != fp || report.SignatureErr != nil || m.Version != "1.3.0" {
		t.Fatalf("report %+v", report)
	}
	if problems, err := websign.CheckFS(files, m); err != nil || len(problems) != 0 {
		t.Fatalf("problems %v %v", problems, err)
	}
	get := func(_ context.Context, p string) ([]byte, error) {
		f, ok := files[p]
		if p == websign.FileName {
			return signed, nil
		}
		if !ok {
			return nil, os.ErrNotExist
		}
		return f.Data, nil
	}
	r, err := websign.Check(context.Background(), get, []string{spki})
	if err != nil || !r.OK(false) || r.Mode() != "own-key" {
		t.Fatalf("check %+v %v", r, err)
	}
	// Signing again with the same key replaces its signature; a second key adds one.
	k3, _ := sign.GenerateKey()
	spki3, _ := sign.SPKI(k3)
	files, env = fixture(t, "1.3.0", spki, spki3)
	once, err := sign.Dist(files, env, []*ecdsa.PrivateKey{k}, sign.Options{})
	if err != nil {
		t.Fatal(err)
	}
	twice, err := sign.Dist(files, once, []*ecdsa.PrivateKey{k, k3}, sign.Options{})
	if err != nil {
		t.Fatal(err)
	}
	var e websign.Envelope
	if err := json.Unmarshal(twice, &e); err != nil || len(e.Signatures) != 2 {
		t.Fatalf("signatures %+v %v", e.Signatures, err)
	}
}

func TestDistRefuses(t *testing.T) {
	k, _ := sign.GenerateKey()
	spki, _ := sign.SPKI(k)
	other, _ := sign.GenerateKey()
	cases := []struct {
		name  string
		edit  func(fstest.MapFS)
		ver   string
		keys  []*ecdsa.PrivateKey
		list  string
		want  string
		build string
	}{
		{name: "changed file", edit: func(f fstest.MapFS) { f["assets/index-1.js"] = &fstest.MapFile{Data: []byte("console.log(2)")} }, keys: []*ecdsa.PrivateKey{k}, want: "changed-file assets/index-1.js"},
		{name: "missing file", edit: func(f fstest.MapFS) { delete(f, "assets/MapView-2.js") }, keys: []*ecdsa.PrivateKey{k}, want: "missing-file assets/MapView-2.js"},
		{name: "unlisted file", edit: func(f fstest.MapFS) { f["evil.js"] = &fstest.MapFile{Data: []byte("x")} }, keys: []*ecdsa.PrivateKey{k}, want: "unlisted-file evil.js"},
		{name: "wrong version", ver: "v1.4.0", keys: []*ecdsa.PrivateKey{k}, want: "the release is v1.4.0"},
		{name: "not semver", list: "dev", keys: []*ecdsa.PrivateKey{k}, want: "not a semantic version"},
		{name: "key not listed", keys: []*ecdsa.PrivateKey{other}, want: "not in the list's keys"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v := "1.3.0"
			if c.list != "" {
				v = c.list
			}
			files, env := fixture(t, v, spki)
			if c.edit != nil {
				c.edit(files)
			}
			_, err := sign.Dist(files, env, c.keys, sign.Options{Version: c.ver})
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err %v, want %q", err, c.want)
			}
		})
	}
}

func TestVerifyCauses(t *testing.T) {
	k, _ := sign.GenerateKey()
	spki, _ := sign.SPKI(k)
	files, env := fixture(t, "1.3.0", spki)
	if _, _, err := websign.Inspect(env, []string{spki}); err != nil {
		t.Fatal(err)
	}
	r, _, _ := websign.Inspect(env, []string{spki})
	if !errors.Is(r.SignatureErr, websign.ErrUnsigned) || r.Mode() != "self-built" || !r.OK(false) || r.OK(true) {
		t.Fatalf("unsigned report %+v", r)
	}
	signed, err := sign.Dist(files, env, []*ecdsa.PrivateKey{k}, sign.Options{})
	if err != nil {
		t.Fatal(err)
	}
	other, _ := sign.GenerateKey()
	otherSPKI, _ := sign.SPKI(other)
	if r, _, _ := websign.Inspect(signed, []string{otherSPKI}); !errors.Is(r.SignatureErr, websign.ErrUnknownKey) {
		t.Fatalf("unknown key: %v", r.SignatureErr)
	}
	tampered := bytes.Replace(signed, []byte(`"sig": "`), []byte(`"sig": "A`), 1)
	if r, _, _ := websign.Inspect(tampered, []string{spki}); !errors.Is(r.SignatureErr, websign.ErrBadSignature) || r.OK(false) {
		t.Fatalf("bad signature: %+v", r)
	}
}

// TestServerDoesNotLinkSign keeps private keys out of the server (design D2):
// only cmd/websign links this package.
func TestServerDoesNotLinkSign(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		if gobin, err = exec.LookPath(filepath.Join(os.Getenv("GOROOT"), "bin", "go")); err != nil {
			t.Skip("the go command is not on PATH")
		}
	}
	for _, cmd := range []string{"opentodo", "ot"} {
		out, err := exec.Command(gobin, "list", "-deps", "../../../cmd/"+cmd).CombinedOutput()
		if err != nil {
			t.Fatalf("go list %s: %v\n%s", cmd, err, out)
		}
		if bytes.Contains(out, []byte("internal/websign/sign")) {
			t.Fatalf("cmd/%s links internal/websign/sign", cmd)
		}
	}
	out, err := exec.Command(gobin, "list", "-deps", "../../../cmd/websign").CombinedOutput()
	if err != nil {
		t.Fatalf("go list websign: %v\n%s", err, out)
	}
	if !bytes.Contains(out, []byte("internal/websign/sign")) {
		t.Fatal("cmd/websign does not link internal/websign/sign: the check above proves nothing")
	}
}
