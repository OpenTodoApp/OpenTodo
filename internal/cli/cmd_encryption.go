package cli

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/e2ee/crypt"
)

// The account key on the user's machine (OpenSpec change mcp-projects, design
// D6): `ot encryption unlock` unwraps it from the account's key record with the
// passphrase or the recovery key, locally, and keeps it in an owner-only file
// next to the configuration, one per profile. Nothing secret is ever sent: the
// server only serves the wrapped record to the profile's token. `ot mcp
// --decrypt` reads the file; `ot encryption lock` deletes it.

// keyFile is the stored account key of one profile.
type keyFile struct {
	Server     string `json:"server"`
	KeyVersion int    `json:"key_version"`
	// Key is the 32-byte account key, base64url. Owner-only file, never printed.
	Key       string `json:"key"`
	CreatedAt int64  `json:"created_at"`
}

// attempts records failed unlocks, to delay guessing (5 within a minute).
type attempts struct {
	Failures []int64 `json:"failures"`
}

const (
	maxFailures   = 5
	failureWindow = time.Minute
)

// keysDir is <config dir>/keys, next to the configuration file.
func (a *App) keysDir() (string, error) {
	if a.ConfigPath == "" {
		return "", authErr("cannot determine the configuration directory for the encryption key")
	}
	return filepath.Join(filepath.Dir(a.ConfigPath), "keys"), nil
}

func (a *App) keyPath(profile string) (string, error) {
	dir, err := a.keysDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, safeProfile(profile)+".json"), nil
}

// safeProfile keeps a profile name usable as a file name.
func safeProfile(p string) string {
	return strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == 0 {
			return '_'
		}
		return r
	}, p)
}

// writeOwnerOnly replaces path atomically with 0600 permissions in a 0700 directory.
func writeOwnerOnly(path string, v any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	_ = os.Chmod(dir, 0o700)
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", tmp, err)
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// loadKey reads a profile's stored key; nil when there is none.
func (a *App) loadKey(profile string) (*keyFile, []byte, error) {
	path, err := a.keyPath(profile)
	if err != nil {
		return nil, nil, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, authErr("read the stored encryption key: %v", err)
	}
	var kf keyFile
	if json.Unmarshal(raw, &kf) != nil {
		return nil, nil, authErr("the stored encryption key is unreadable; run `ot encryption lock` and `ot encryption unlock`")
	}
	key, err := base64.RawURLEncoding.DecodeString(kf.Key)
	if err != nil || len(key) != crypt.KeyBytes {
		return nil, nil, authErr("the stored encryption key is unreadable; run `ot encryption lock` and `ot encryption unlock`")
	}
	return &kf, key, nil
}

// encryptionStatus reads the account's encryption state from /api/v1/me.
func (c *client) encryptionStatus(ctx context.Context) (e2ee.Status, error) {
	var out struct {
		Encryption e2ee.Status `json:"encryption"`
	}
	if err := c.getJSON(ctx, "/me", &out); err != nil {
		return e2ee.Status{}, err
	}
	return out.Encryption, nil
}

func (c *client) keyRecord(ctx context.Context) (*e2ee.KeyRecord, error) {
	var out struct {
		Keys *e2ee.KeyRecord `json:"keys"`
	}
	if err := c.getJSON(ctx, "/encryption/keys", &out); err != nil {
		var ee *exitError
		if errors.As(err, &ee) && ee.jsonCode == "encryption_disabled" {
			return nil, nil
		}
		return nil, err
	}
	return out.Keys, nil
}

func cmdEncryption(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot encryption unlock|lock|status")
	}
	switch args[0] {
	case "unlock":
		return cmdEncryptionUnlock(a, ctx, g, args[1:])
	case "lock":
		return cmdEncryptionLock(a, ctx, g, args[1:])
	case "status":
		return cmdEncryptionStatus(a, ctx, g, args[1:])
	}
	return usageErr("unknown subcommand %q\nusage: ot encryption unlock|lock|status", args[0])
}

func cmdEncryptionUnlock(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("encryption unlock", g)
	recovery := fs.Bool("recovery", false, "unlock with the recovery key instead of the passphrase")
	file := fs.String("passphrase-file", "", "read the passphrase (or recovery key) from this file")
	pos, err := a.parse(g, fs, "encryption unlock", args)
	if err != nil {
		return a.helpOr("encryption", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot encryption unlock [--recovery] [--passphrase-file <path>]")
	}
	c, t, err := a.connect(g)
	if err != nil {
		return err
	}
	rec, err := c.keyRecord(ctx)
	if err != nil {
		return err
	}
	if rec == nil {
		return usageErr("this account does not use end-to-end encryption; there is nothing to unlock")
	}
	if !*recovery {
		if err := crypt.CheckRecord(*rec); err != nil {
			return &exitError{code: ExitServer, jsonCode: "key_record_out_of_range", msg: err.Error() + "; ask the server operator to check the server"}
		}
	}
	if err := a.waitAfterFailures(t.Profile); err != nil {
		return err
	}
	secret, err := a.readSecret(*file, *recovery)
	if err != nil {
		return err
	}
	var key []byte
	if *recovery {
		key, err = crypt.UnlockWithRecoveryKey(*rec, secret)
	} else {
		key, err = crypt.UnlockWithPassphrase(*rec, secret)
	}
	if err != nil {
		a.recordFailure(t.Profile)
		msg := err.Error()
		if !*recovery && crypt.NeedsNormalisation(secret) && errors.Is(err, crypt.ErrWrongSecret) {
			msg += "; a passphrase with accented or other non-ASCII characters may need `ot encryption unlock --recovery` here"
		}
		return &exitError{code: ExitAuth, jsonCode: "wrong_secret", msg: msg}
	}
	path, err := a.keyPath(t.Profile)
	if err != nil {
		return err
	}
	kf := keyFile{Server: t.URL, KeyVersion: rec.Version, Key: base64.RawURLEncoding.EncodeToString(key), CreatedAt: a.Now().UnixMilli()}
	if err := writeOwnerOnly(path, kf); err != nil {
		return authErr("store the encryption key: %v", err)
	}
	a.clearFailures(t.Profile)
	if g.json {
		return a.printJSON(map[string]any{"state": "unlocked", "profile": t.Profile, "key_version": rec.Version})
	}
	fmt.Fprintf(a.Stdout, "Unlocked: the account key is stored for profile %q on this machine. Lock it again with `ot encryption lock`.\n", t.Profile)
	return nil
}

// readSecret reads the passphrase or recovery key without echo, or from a file.
func (a *App) readSecret(file string, recovery bool) (string, error) {
	if file != "" {
		raw, err := os.ReadFile(file)
		if err != nil {
			return "", usageErr("read %s: %v", file, err)
		}
		return strings.TrimRight(string(raw), "\r\n"), nil
	}
	prompt := "Passphrase: "
	if recovery {
		prompt = "Recovery key: "
	}
	s, err := a.ReadPassword(prompt)
	if err != nil {
		return "", usageErr("read the secret: %v", err)
	}
	if s == "" {
		return "", usageErr("no passphrase given")
	}
	return s, nil
}

func (a *App) attemptsPath(profile string) (string, error) {
	dir, err := a.keysDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, safeProfile(profile)+".attempts.json"), nil
}

// waitAfterFailures delays an attempt after 5 failures within a minute.
func (a *App) waitAfterFailures(profile string) error {
	path, err := a.attemptsPath(profile)
	if err != nil {
		return err
	}
	var at attempts
	if raw, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(raw, &at)
	}
	now := a.Now()
	var recent []int64
	for _, f := range at.Failures {
		if now.Sub(time.UnixMilli(f)) < failureWindow {
			recent = append(recent, f)
		}
	}
	if len(recent) < maxFailures {
		return nil
	}
	wait := failureWindow - now.Sub(time.UnixMilli(recent[len(recent)-maxFailures]))
	fmt.Fprintf(a.Stderr, "Too many failed attempts; waiting %d s before trying again.\n", int(wait.Round(time.Second)/time.Second))
	a.sleep(wait)
	return nil
}

func (a *App) recordFailure(profile string) {
	path, err := a.attemptsPath(profile)
	if err != nil {
		return
	}
	var at attempts
	if raw, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(raw, &at)
	}
	now := a.Now()
	kept := at.Failures[:0]
	for _, f := range at.Failures {
		if now.Sub(time.UnixMilli(f)) < failureWindow {
			kept = append(kept, f)
		}
	}
	at.Failures = append(kept, now.UnixMilli())
	_ = writeOwnerOnly(path, at)
}

func (a *App) clearFailures(profile string) {
	if path, err := a.attemptsPath(profile); err == nil {
		_ = os.Remove(path)
	}
}

func cmdEncryptionLock(a *App, _ context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("encryption lock", g)
	pos, err := a.parse(g, fs, "encryption lock", args)
	if err != nil {
		return a.helpOr("encryption", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot encryption lock")
	}
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return authErr("%v", err)
	}
	t := resolveTarget(g, a.Getenv, cfg)
	path, err := a.keyPath(t.Profile)
	if err != nil {
		return err
	}
	removed := true
	if err := os.Remove(path); errors.Is(err, os.ErrNotExist) {
		removed = false
	} else if err != nil {
		return authErr("delete the stored key: %v", err)
	}
	if g.json {
		return a.printJSON(map[string]any{"state": "locked", "profile": t.Profile, "removed": removed})
	}
	if removed {
		fmt.Fprintf(a.Stdout, "Locked: the account key for profile %q was deleted from this machine.\n", t.Profile)
	} else {
		fmt.Fprintf(a.Stdout, "Already locked: no account key is stored for profile %q.\n", t.Profile)
	}
	return nil
}

// keyState compares the stored key with the account: locked, unlocked, stale
// or not_encrypted.
func (a *App) keyState(ctx context.Context, c *client, profile string) (string, *keyFile, []byte, e2ee.Status, error) {
	st, err := c.encryptionStatus(ctx)
	if err != nil {
		return "", nil, nil, st, err
	}
	kf, key, err := a.loadKey(profile)
	if err != nil {
		return "", nil, nil, st, err
	}
	switch {
	case !st.Enabled:
		return "not_encrypted", kf, key, st, nil
	case kf == nil:
		return "locked", nil, nil, st, nil
	case kf.KeyVersion != st.KeyVersion || strings.TrimRight(kf.Server, "/") != c.base:
		return "stale", kf, key, st, nil
	}
	return "unlocked", kf, key, st, nil
}

func cmdEncryptionStatus(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("encryption status", g)
	pos, err := a.parse(g, fs, "encryption status", args)
	if err != nil {
		return a.helpOr("encryption", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot encryption status")
	}
	c, t, err := a.connect(g)
	if err != nil {
		return err
	}
	state, _, _, st, err := a.keyState(ctx, c, t.Profile)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(map[string]any{"state": state, "profile": t.Profile, "key_version": st.KeyVersion})
	}
	switch state {
	case "not_encrypted":
		fmt.Fprintln(a.Stdout, "not_encrypted: this account does not use end-to-end encryption")
	case "locked":
		fmt.Fprintln(a.Stdout, "locked: run `ot encryption unlock` to store the account key on this machine")
	case "stale":
		fmt.Fprintln(a.Stdout, "stale: the passphrase or key changed elsewhere; run `ot encryption unlock` again")
	default:
		fmt.Fprintf(a.Stdout, "unlocked (key version %d)\n", st.KeyVersion)
	}
	return nil
}
