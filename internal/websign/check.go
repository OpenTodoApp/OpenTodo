package websign

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"sync"
)

// Report is what a check of a whole web app found.
type Report struct {
	Version string
	Build   string
	Refuse  bool
	// Signer is the full fingerprint of the trusted key that signed the list,
	// empty when none did.
	Signer   string
	Official bool
	// SignatureErr is nil when Signer is set, else ErrUnsigned, ErrUnknownKey or ErrBadSignature.
	SignatureErr error
	Files        int
	Problems     []Problem
}

// Inspect reads an envelope and checks its signature against trusted keys.
func Inspect(envelope []byte, trusted []string) (*Report, *Manifest, error) {
	env, payload, err := ParseEnvelope(envelope)
	if err != nil {
		return nil, nil, err
	}
	m, err := ParseManifest(payload)
	if err != nil {
		return nil, nil, err
	}
	r := &Report{Version: m.Version, Build: m.Build, Refuse: m.Refuse, Files: len(m.Files)}
	r.Signer, r.SignatureErr = Verify(env, payload, trusted)
	r.Official = r.Signer != "" && IsOfficial(r.Signer)
	return r, m, nil
}

// Getter reads one file of a web app by its listed path.
type Getter func(ctx context.Context, path string) ([]byte, error)

// Check reads app-manifest.json through get, checks its signature against
// trusted keys, then reads every listed file and compares its size and hash.
func Check(ctx context.Context, get Getter, trusted []string) (*Report, error) {
	envelope, err := get(ctx, FileName)
	if err != nil {
		return nil, fmt.Errorf("websign: read %s: %w", FileName, err)
	}
	r, m, err := Inspect(envelope, trusted)
	if err != nil {
		return nil, err
	}
	r.Problems = CheckFiles(ctx, get, m)
	return r, nil
}

// CheckFiles reads every listed file through get, eight at a time, and
// returns the ones that are missing or differ, sorted by path.
func CheckFiles(ctx context.Context, get Getter, m *Manifest) []Problem {
	paths := make([]string, 0, len(m.Files))
	for p := range m.Files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	var (
		mu       sync.Mutex
		problems []Problem
		wg       sync.WaitGroup
		slots    = make(chan struct{}, 8)
	)
	for _, p := range paths {
		wg.Add(1)
		slots <- struct{}{}
		go func(p string) {
			defer wg.Done()
			defer func() { <-slots }()
			want := m.Files[p]
			var cause string
			if !ValidPath(p) {
				cause = "missing-file"
			} else if body, err := get(ctx, p); err != nil {
				cause = "missing-file"
			} else {
				sum := sha256.Sum256(body)
				if hex.EncodeToString(sum[:]) != want.SHA256 || int64(len(body)) != want.Size {
					cause = "changed-file"
				}
			}
			if cause != "" {
				mu.Lock()
				problems = append(problems, Problem{p, cause})
				mu.Unlock()
			}
		}(p)
	}
	wg.Wait()
	sort.Slice(problems, func(i, j int) bool { return problems[i].Path < problems[j].Path })
	return problems
}

// Mode is how a device would treat this list on first use: "signed" by an
// official key, "own-key" (signed by a key it was built to trust), or
// "self-built" / "preview" when unsigned.
func (r *Report) Mode() string {
	switch {
	case r.Signer != "" && r.Official:
		return "signed"
	case r.Signer != "":
		return "own-key"
	case r.Build == BuildPreview:
		return "preview"
	}
	return "self-built"
}

// Summary is one line for a person: who signed it, the version and the files.
func (r *Report) Summary() string {
	var who string
	switch {
	case r.Signer != "" && r.Official:
		who = "signed by OpenTodo (" + ShortFingerprint(r.Signer) + ")"
	case r.Signer != "":
		who = "signed by " + ShortFingerprint(r.Signer) + ", which is not an official key"
	case errors.Is(r.SignatureErr, ErrBadSignature):
		who = "the signature does not verify"
	case errors.Is(r.SignatureErr, ErrUnknownKey):
		who = "signed, but not by an official key"
	case r.Build == BuildPreview:
		who = "preview build, not signed"
	default:
		who = "self-built, not signed"
	}
	state := "report-only"
	if r.Refuse {
		state = "refusal on"
	}
	files := "every file matches"
	if len(r.Problems) > 0 {
		files = fmt.Sprintf("%d of %d files do not match", len(r.Problems), r.Files)
	}
	return fmt.Sprintf("version %s, %s, %s, %s", r.Version, who, state, files)
}

// OK reports whether the web app passes: every file matches and the signature,
// if any, verifies. With requireSigned an official key must have signed it.
func (r *Report) OK(requireSigned bool) bool {
	if len(r.Problems) > 0 || errors.Is(r.SignatureErr, ErrBadSignature) {
		return false
	}
	if requireSigned {
		return r.Signer != "" && r.Official
	}
	return true
}
