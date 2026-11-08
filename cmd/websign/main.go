// Command websign makes and checks the web app's signed file list (OpenSpec
// change signed-web-app). It runs on a build machine or in CI, never on a
// server:
//
//	websign keygen -out release-key.pem   a new key pair; prints the public half
//	websign pubkey release-key.pem        the public half of a key file
//	websign sign [-key file]... [-version v1.3.0] <dist>
//	websign verify [-require-signed] [-keys file] <dist | https://your.server/>
//
// sign takes its keys from -key, or from WEB_SIGNING_KEY (a key file's path or
// its PEM text). verify checks the signature against the official keys
// (internal/websign/release-keys.json) and every file's hash; with a URL it
// downloads the files from the server, so it also catches a proxy that changes them.
package main

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/websign"
	"github.com/OpenTodoApp/opentodo/internal/websign/sign"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, "websign:", err)
		os.Exit(1)
	}
}

const usage = `usage:
  websign keygen -out <file>
  websign pubkey <key file>
  websign sign [-key <file>]... [-version <tag>] <dist>
  websign verify [-require-signed] <dist | url>`

func run(args []string, out io.Writer, getenv func(string) string) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	switch args[0] {
	case "keygen":
		return keygen(args[1:], out)
	case "pubkey":
		return pubkey(args[1:], out)
	case "sign":
		return signCmd(args[1:], out, getenv)
	case "verify":
		return verify(args[1:], out)
	}
	return errors.New(usage)
}

func keygen(args []string, out io.Writer) error {
	fs := flag.NewFlagSet("keygen", flag.ContinueOnError)
	file := fs.String("out", "", "where to write the private key (PEM)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *file == "" {
		return errors.New("keygen needs -out <file>")
	}
	k, err := sign.GenerateKey()
	if err != nil {
		return err
	}
	pemBytes, err := sign.MarshalPrivateKey(k)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(*file, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("write the key: %w", err)
	}
	if _, err := f.Write(pemBytes); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	fmt.Fprintf(out, "private key written to %s (keep it secret)\n", *file)
	return printPublic(k, out)
}

func pubkey(args []string, out io.Writer) error {
	if len(args) != 1 {
		return errors.New("pubkey needs one key file")
	}
	k, err := readKey(args[0])
	if err != nil {
		return err
	}
	return printPublic(k, out)
}

func printPublic(k *ecdsa.PrivateKey, out io.Writer) error {
	spki, err := sign.SPKI(k)
	if err != nil {
		return err
	}
	fp, err := sign.Fingerprint(k)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "public key (spki): %s\nfingerprint:       %s\nshort fingerprint: %s\n", spki, fp, websign.ShortFingerprint(fp))
	return nil
}

func readKey(source string) (*ecdsa.PrivateKey, error) {
	data := []byte(source)
	if !strings.HasPrefix(strings.TrimSpace(source), "-----BEGIN") {
		var err error
		if data, err = os.ReadFile(source); err != nil {
			return nil, fmt.Errorf("read the key: %w", err)
		}
	}
	return sign.ParsePrivateKey(data)
}

type keyFlags []string

func (k *keyFlags) String() string     { return strings.Join(*k, ",") }
func (k *keyFlags) Set(v string) error { *k = append(*k, v); return nil }

func signCmd(args []string, out io.Writer, getenv func(string) string) error {
	fs := flag.NewFlagSet("sign", flag.ContinueOnError)
	var keyFiles keyFlags
	fs.Var(&keyFiles, "key", "a private key file (repeat to sign with two keys)")
	version := fs.String("version", "", "the release tag the list must match, for example v1.3.0")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		return errors.New("sign needs the built web app's directory")
	}
	if len(keyFiles) == 0 {
		if v := getenv("WEB_SIGNING_KEY"); v != "" {
			keyFiles = append(keyFiles, v)
		}
	}
	if len(keyFiles) == 0 {
		return errors.New("sign needs -key or WEB_SIGNING_KEY")
	}
	var keys []*ecdsa.PrivateKey
	for _, f := range keyFiles {
		k, err := readKey(f)
		if err != nil {
			return err
		}
		keys = append(keys, k)
	}
	dist := fs.Arg(0)
	file := filepath.Join(dist, websign.FileName)
	envelope, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("read the list: %w", err)
	}
	signed, err := sign.Dist(os.DirFS(dist), envelope, keys, sign.Options{Version: *version})
	if err != nil {
		return err
	}
	if err := os.WriteFile(file, signed, 0o644); err != nil {
		return err
	}
	for _, k := range keys {
		fp, _ := sign.Fingerprint(k)
		fmt.Fprintf(out, "signed %s with %s\n", file, websign.ShortFingerprint(fp))
	}
	return nil
}

func verify(args []string, out io.Writer) error {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	requireSigned := fs.Bool("require-signed", false, "fail unless an official key signed the list")
	keysFile := fs.String("keys", "", "trust the keys of this file (release-keys.json format) instead of the official ones")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		return errors.New("verify needs a directory or a server address")
	}
	trusted := websign.OfficialKeys().KeySPKIs()
	if *keysFile != "" {
		data, err := os.ReadFile(*keysFile)
		if err != nil {
			return err
		}
		var o websign.Official
		if err := json.Unmarshal(data, &o); err != nil {
			return fmt.Errorf("read %s: %w", *keysFile, err)
		}
		trusted = o.KeySPKIs()
	}
	target := fs.Arg(0)
	ctx := context.Background()
	var report *websign.Report
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		u, err := url.Parse(strings.TrimSuffix(target, "/") + "/")
		if err != nil {
			return err
		}
		src := &httpSource{base: u, client: &http.Client{Timeout: 30 * time.Second}}
		if report, err = websign.Check(ctx, src.get, trusted); err != nil {
			return err
		}
	} else {
		envelope, err := os.ReadFile(filepath.Join(target, websign.FileName))
		if err != nil {
			return fmt.Errorf("read the list: %w", err)
		}
		r, m, err := websign.Inspect(envelope, trusted)
		if err != nil {
			return err
		}
		if r.Problems, err = websign.CheckFS(os.DirFS(target), m); err != nil {
			return err
		}
		report = r
	}
	fmt.Fprintln(out, report.Summary())
	for _, p := range report.Problems {
		fmt.Fprintln(out, "  "+p.String())
	}
	if !report.OK(*requireSigned) {
		return errors.New("the web app does not pass the check")
	}
	return nil
}

type httpSource struct {
	base   *url.URL
	client *http.Client
}

func (h *httpSource) get(ctx context.Context, p string) ([]byte, error) {
	if !websign.ValidPath(p) {
		return nil, fmt.Errorf("unsafe path %q", p)
	}
	u := h.base.ResolveReference(&url.URL{Path: p})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	res, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", p, res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, 64<<20))
}
