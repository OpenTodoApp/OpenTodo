package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pixari/opentodo/internal/e2ee/crypt"
	"github.com/pixari/opentodo/internal/vault"
)

// The Markdown vault (OpenSpec change markdown-vault): a folder of project
// files kept in two-way sync with the account. The vault is a sync device with
// its own state in <dir>/.opentodo/, so it is the one command group that keeps
// data on this machine (cli-client "Online-only client"). It exchanges over
// POST /api/v1/sync with its own transport: the global --read-only means "pull
// and write the files, push nothing", and --dry-run plans without writing.

// VaultPlaintextNotice is printed once by `ot vault init` for an encrypted
// account (design D10).
const VaultPlaintextNotice = "This account uses end-to-end encryption: the vault folder holds your tasks in plain text on this machine. Run `ot encryption lock` to remove the key when you stop syncing."

// Timings of `ot vault watch` (design D9); tests shorten them.
var (
	watchPoll     = 2 * time.Second
	watchStable   = time.Second
	watchFallback = 30 * time.Second
	watchMaxWait  = time.Minute
)

func cmdVault(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot vault init|sync|status|watch")
	}
	switch args[0] {
	case "init":
		return vaultInit(a, ctx, g, args[1:])
	case "sync":
		return vaultSync(a, ctx, g, args[1:])
	case "status":
		return vaultStatus(a, ctx, g, args[1:])
	case "watch":
		return vaultWatch(a, ctx, g, args[1:])
	}
	return usageErr("unknown vault command %q (expected init, sync, status or watch)", args[0])
}

// vaultParse parses a vault command's arguments without the shared write
// gate (see the file comment), returning the folder.
func (a *App) vaultParse(g *globalFlags, set *flag.FlagSet, name string, args []string, required bool) (string, error) {
	pos, err := parseArgs(set, name, args)
	if err != nil {
		return "", err
	}
	if envTrue(a.Getenv("OPENTODO_READ_ONLY")) {
		g.readOnly = true
	}
	switch {
	case len(pos) > 1:
		return "", usageErr("usage: ot %s [<dir>]", name)
	case len(pos) == 0 && required:
		return "", usageErr("usage: ot %s <dir>", name)
	case len(pos) == 0:
		return ".", nil
	}
	return pos[0], nil
}

// vaultSession is what a vault sync needs from the server: the transport,
// the user and, for an encrypted account, the key.
type vaultSession struct {
	opts   vault.Options
	target target
	locked bool
}

// keyCrypter opens and seals content values with the account key.
type keyCrypter struct{ key []byte }

func (k keyCrypter) Open(entity, id, field, value string) (string, error) {
	return crypt.Open(k.key, entity, id, field, value)
}

func (k keyCrypter) Seal(entity, id, field, plaintext string) (string, error) {
	return crypt.Seal(k.key, entity, id, field, plaintext)
}

// vaultConnect checks the token's scope and the encryption state before any
// sync request: a read or agent token exits 5 insufficient_scope, a locked or
// stale key exits 5 encryption_enabled.
func (a *App) vaultConnect(ctx context.Context, g *globalFlags, dir string) (*vaultSession, error) {
	c, t, err := a.connect(g)
	if err != nil {
		return nil, err
	}
	u, cred, err := c.meAuth(ctx)
	if err != nil {
		return nil, err
	}
	if cred.Scope == "read" || cred.Scope == "agent" {
		return nil, &exitError{code: ExitNotPermitted, jsonCode: "insufficient_scope",
			msg: fmt.Sprintf("the vault needs a full token; this one has scope %s. Nothing was sent.", cred.Scope)}
	}
	state, _, key, _, err := a.keyState(ctx, c, t.Profile)
	if err != nil {
		return nil, err
	}
	s := &vaultSession{target: t}
	switch state {
	case "locked", "stale":
		return nil, &exitError{code: ExitNotPermitted, jsonCode: "encryption_enabled",
			msg: "this account uses end-to-end encryption; run `ot encryption unlock` to store the account key on this machine, then sync the vault again"}
	case "unlocked":
		s.opts.Crypter = keyCrypter{key: key}
		s.locked = true
	}
	s.opts.Dir = dir
	s.opts.Transport = &vault.HTTPTransport{URL: t.URL, Token: t.Token}
	s.opts.UserID = u.ID
	s.opts.ReadOnly = g.readOnly
	s.opts.DryRun = g.dryRun
	return s, nil
}

// vaultErr maps the vault's errors to exit codes.
func vaultErr(dir string, err error) error {
	var le *vault.LimitError
	var ue *vault.UnreachableError
	var he *vault.HTTPError
	switch {
	case err == nil:
		return nil
	case errors.As(err, &le):
		return &exitError{code: ExitUsage, jsonCode: "vault_limit", msg: le.Msg + "; nothing was written or sent"}
	case errors.Is(err, vault.ErrNotVault):
		return usageErr("%s is not a vault; run `ot vault init %s` first", dir, dir)
	case errors.As(err, &ue):
		return &exitError{code: ExitUnreachable, msg: fmt.Sprintf("cannot reach %s: %v\nCheck that the server is running and that the URL is right. No file was changed.", ue.URL, ue.Err)}
	case errors.As(err, &he):
		code := ExitServer
		switch {
		case he.Status == 401:
			code = ExitAuth
		case he.Status == 403 || notPermittedCodes[he.Code]:
			code = ExitNotPermitted
		}
		return &exitError{code: code, jsonCode: he.Code, msg: he.Error()}
	}
	var ee *exitError
	if errors.As(err, &ee) {
		return ee
	}
	return serverErr("%v", err)
}

func vaultInit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	set := a.flagSet("vault init", g)
	adopt := set.Bool("adopt", false, "make the Markdown files already in the folder projects")
	dir, err := a.vaultParse(g, set, "vault init", args, true)
	if err != nil {
		return a.helpOr("vault", err)
	}
	switch err := vault.CheckInit(dir, *adopt); {
	case errors.Is(err, vault.ErrAlreadyVault):
		return usageErr("%s is already a vault (it holds %s); nothing was changed", dir, vault.StateDir)
	case errors.Is(err, vault.ErrHasNotes):
		return usageErr("%s holds Markdown files; use a new or empty folder, or --adopt to make those files projects", dir)
	case err != nil:
		return err
	}
	s, err := a.vaultConnect(ctx, g, dir)
	if err != nil {
		return err
	}
	_, statErr := os.Stat(dir)
	if !g.dryRun {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return usageErr("create %s: %v", dir, err)
		}
	}
	s.opts.State = vault.NewState(s.target.Profile, s.target.URL)
	rep, err := vault.Sync(ctx, s.opts)
	if err != nil {
		if errors.Is(statErr, fs.ErrNotExist) {
			_ = os.Remove(dir)
		}
		return vaultErr(dir, err)
	}
	if s.locked && !g.json {
		fmt.Fprintln(a.Stderr, VaultPlaintextNotice)
	}
	if g.json {
		return a.printJSON(rep)
	}
	a.printVaultReport(rep)
	if !g.dryRun {
		fmt.Fprintf(a.Stdout, "%s is a vault: %d projects and %d tasks written.\n", dir, rep.Projects, rep.Tasks)
	}
	return nil
}

// syncVault runs one sync of an existing vault with its profile.
func (a *App) syncVault(ctx context.Context, g *globalFlags, dir string) (*vault.Report, *vaultSession, error) {
	st, err := vault.LoadState(dir)
	if err != nil {
		return nil, nil, vaultErr(dir, err)
	}
	if g.profile == "" {
		g.profile = st.Profile
	}
	s, err := a.vaultConnect(ctx, g, dir)
	if err != nil {
		return nil, nil, err
	}
	if strings.TrimRight(s.target.URL, "/") != strings.TrimRight(st.Server, "/") {
		return nil, nil, usageErr("%s is a vault of %s, not %s; use --profile to pick its profile", dir, st.Server, s.target.URL)
	}
	rep, err := vault.Sync(ctx, s.opts)
	return rep, s, vaultErr(dir, err)
}

func vaultSync(a *App, ctx context.Context, g *globalFlags, args []string) error {
	set := a.flagSet("vault sync", g)
	dir, err := a.vaultParse(g, set, "vault sync", args, false)
	if err != nil {
		return a.helpOr("vault", err)
	}
	rep, _, err := a.syncVault(ctx, g, dir)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(rep)
	}
	a.printVaultReport(rep)
	return nil
}

// printVaultReport prints one line per event, warnings on stderr, and for a
// dry run the planned ops and files.
func (a *App) printVaultReport(rep *vault.Report) {
	for _, e := range rep.Events {
		fmt.Fprintln(a.Stdout, e.Text)
	}
	for _, w := range rep.Warnings {
		fmt.Fprintln(a.Stderr, "ot: "+w)
	}
	for _, op := range rep.Planned {
		fmt.Fprintf(a.Stdout, "would send %s %s %s = %s\n", op.Entity, op.EntityID, op.Field, string(op.Value))
	}
	for _, f := range rep.Files {
		fmt.Fprintf(a.Stdout, "would write %s\n", f)
	}
	if len(rep.Events) == 0 && len(rep.Planned) == 0 && len(rep.Files) == 0 {
		fmt.Fprintln(a.Stdout, "The vault is up to date.")
	}
}

func vaultStatus(a *App, _ context.Context, g *globalFlags, args []string) error {
	set := a.flagSet("vault status", g)
	dir, err := a.vaultParse(g, set, "vault status", args, false)
	if err != nil {
		return a.helpOr("vault", err)
	}
	st, err := vault.ReadStatus(dir)
	if err != nil {
		return vaultErr(dir, err)
	}
	if g.json {
		return a.printJSON(st)
	}
	fmt.Fprintf(a.Stdout, "Vault of %s (profile %s), device %s\n", st.Server, st.Profile, st.Device)
	for _, p := range st.Changed {
		fmt.Fprintf(a.Stdout, "changed  %s\n", p)
	}
	for _, p := range st.Missing {
		fmt.Fprintf(a.Stdout, "missing  %s\n", p)
	}
	for _, p := range st.Conflicts {
		fmt.Fprintf(a.Stdout, "conflict %s\n", p)
	}
	if len(st.Changed)+len(st.Missing)+len(st.Conflicts) == 0 {
		fmt.Fprintln(a.Stdout, "Nothing changed since the last sync.")
	}
	return nil
}

// snapshot is the modification time and size of every vault file.
func snapshot(dir string) map[string]string {
	out := map[string]string{}
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && p != dir && strings.HasPrefix(d.Name(), ".") {
			return filepath.SkipDir
		}
		if d.IsDir() || !strings.HasSuffix(p, ".md") || strings.HasSuffix(p, ".conflict.md") {
			return nil
		}
		if fi, err := d.Info(); err == nil {
			out[p] = fmt.Sprintf("%d/%d", fi.ModTime().UnixNano(), fi.Size())
		}
		return nil
	})
	return out
}

func sameSnapshot(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func vaultWatch(a *App, ctx context.Context, g *globalFlags, args []string) error {
	set := a.flagSet("vault watch", g)
	dir, err := a.vaultParse(g, set, "vault watch", args, false)
	if err != nil {
		return a.helpOr("vault", err)
	}
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	st, err := vault.LoadState(dir)
	if err != nil {
		return vaultErr(dir, err)
	}
	wake := make(chan struct{}, 1)
	streamUp := make(chan bool, 4)
	if g.profile == "" {
		g.profile = st.Profile
	}
	_, t, err := a.connect(g)
	if err != nil {
		return err
	}
	tr := &vault.HTTPTransport{URL: t.URL, Token: t.Token}
	go func() {
		backoff := time.Second
		for ctx.Err() == nil {
			streamUp <- true
			_ = tr.Events(ctx, st.Device, wake)
			streamUp <- false
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < watchMaxWait {
				backoff *= 2
			}
		}
	}()
	return a.watchLoop(ctx, g, dir, wake, streamUp)
}

// watchLoop syncs once, then on a wake from the live channel, on a changed
// file stable for watchStable, and every watchFallback while the channel is
// down; a failed sync is printed and retried with a growing wait.
func (a *App) watchLoop(ctx context.Context, g *globalFlags, dir string, wake <-chan struct{}, streamUp <-chan bool) error {
	up := false
	fail := 0
	var retryAt time.Time
	last := map[string]string{}
	run := func() {
		// Taken before the sync: a save that lands while it runs must still look
		// new afterwards. The sync's own writes cost one more sync, which writes nothing.
		before := snapshot(dir)
		rep, _, err := a.syncVault(ctx, g, dir)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			var ee *exitError
			if errors.As(err, &ee) && ee.code == ExitNotPermitted {
				fmt.Fprintln(a.Stderr, "ot: "+ee.msg)
			} else {
				fmt.Fprintln(a.Stderr, "ot: sync failed: "+err.Error())
			}
			fail++
			wait := watchPoll << min(fail, 5)
			if wait > watchMaxWait {
				wait = watchMaxWait
			}
			retryAt = time.Now().Add(wait)
			fmt.Fprintf(a.Stderr, "ot: retrying in %s\n", wait.Round(time.Second))
			return
		}
		fail, retryAt = 0, time.Time{}
		last = before
		if g.json {
			_ = a.printJSON(rep)
		} else if len(rep.Events) > 0 || len(rep.Warnings) > 0 {
			a.printVaultReport(rep)
		}
	}
	run()
	tick := time.NewTicker(watchPoll)
	defer tick.Stop()
	lastFull := time.Now()
	for {
		select {
		case <-ctx.Done():
			return nil
		case u := <-streamUp:
			up = u
		case <-wake:
			if retryAt.IsZero() {
				run()
				lastFull = time.Now()
			}
		case <-tick.C:
			now := time.Now()
			if !retryAt.IsZero() {
				if now.After(retryAt) {
					run()
					lastFull = now
				}
				continue
			}
			cur := snapshot(dir)
			if !sameSnapshot(cur, last) {
				// Editors save in steps: wait until the files hold still.
				select {
				case <-ctx.Done():
					return nil
				case <-time.After(watchStable):
				}
				if sameSnapshot(cur, snapshot(dir)) {
					run()
					lastFull = now
				}
				continue
			}
			if !up && now.Sub(lastFull) >= watchFallback {
				run()
				lastFull = now
			}
		}
	}
}
