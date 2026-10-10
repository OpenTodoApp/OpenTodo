package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// cmdLogin signs in with email and password, mints an API token named
// cli@<hostname>, drops the session and stores only the token.
func cmdLogin(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("login", g)
	email := fs.String("email", "", "account email (prompted when omitted)")
	pos, err := parseArgs(fs, "login", args)
	if err != nil {
		return a.helpOr("login", err)
	}
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return authErr("%v", err)
	}
	name := profileName(g.profile, a.Getenv, cfg)
	serverURL := g.server
	if len(pos) > 0 {
		serverURL = pos[0]
	}
	if serverURL == "" {
		if p, ok := cfg.Profiles[name]; ok {
			serverURL = p.URL
		} else if v := a.Getenv("OPENTODO_URL"); v != "" {
			serverURL = v
		}
	}
	if serverURL == "" {
		return usageErr("usage: ot login <server-url>")
	}
	serverURL, err = normalizeURL(serverURL)
	if err != nil {
		return err
	}
	if *email == "" {
		if *email, err = a.readLine("Email: "); err != nil {
			return usageErr("reading email: %v", err)
		}
	}
	*email = strings.TrimSpace(*email)
	if *email == "" {
		return usageErr("email is required")
	}
	password, err := a.ReadPassword("Password: ")
	if err != nil {
		return usageErr("reading password: %v", err)
	}
	if password == "" {
		return usageErr("password is required")
	}

	c := newClient(serverURL, "")
	var login struct {
		User user `json:"user"`
	}
	if err := c.postJSON(ctx, "/auth/login", map[string]string{"email": *email, "password": password}, &login); err != nil {
		return err
	}
	if c.cookie == nil {
		return serverErr("server did not start a session (is %s an OpenTodo server?)", serverURL)
	}
	var created struct {
		Token  json.RawMessage `json:"token"`
		Secret string          `json:"secret"`
	}
	tokenName := "cli@" + a.Hostname
	if err := c.postJSON(ctx, "/tokens", map[string]string{"name": tokenName}, &created); err != nil {
		_ = c.postJSON(ctx, "/auth/logout", nil, nil)
		return err
	}
	// The session is only a vehicle for minting the token.
	_ = c.postJSON(ctx, "/auth/logout", nil, nil)
	c.cookie = nil
	if created.Secret == "" {
		return serverErr("server returned no token secret")
	}

	p := cfg.Profiles[name]
	p.URL, p.Token = serverURL, created.Secret
	cfg.Profiles[name] = p
	if cfg.Default == "" {
		cfg.Default = name
	}
	if err := saveConfig(a.ConfigPath, cfg); err != nil {
		return authErr("token created but could not be saved: %v", err)
	}
	if g.json {
		return a.printJSON(map[string]any{"server": serverURL, "profile": name, "user": login.User, "token": created.Token})
	}
	fmt.Fprintf(a.Stdout, "Signed in to %s as %s (profile %q).\nToken %q stored in %s.\n", serverURL, login.User.Email, name, tokenName, a.ConfigPath)
	return nil
}

func cmdAuth(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot auth set-token <token> | status | logout")
	}
	switch args[0] {
	case "set-token":
		return authSetToken(a, ctx, g, args[1:])
	case "status":
		return authStatus(a, ctx, g, args[1:])
	case "logout":
		return authLogout(a, ctx, g, args[1:])
	}
	return usageErr("unknown auth command %q (expected set-token, status or logout)", args[0])
}

func authSetToken(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("auth set-token", g)
	pos, err := parseArgs(fs, "auth set-token", args)
	if err != nil {
		return a.helpOr("auth", err)
	}
	if len(pos) != 1 || pos[0] == "" {
		return usageErr("usage: ot auth set-token <token> [--server <url>]")
	}
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return authErr("%v", err)
	}
	name := profileName(g.profile, a.Getenv, cfg)
	t := resolveTarget(g, a.Getenv, cfg)
	if t.URL == "" {
		return usageErr("no server known for profile %q; pass --server <url>", name)
	}
	serverURL, err := normalizeURL(t.URL)
	if err != nil {
		return err
	}
	c := newClient(serverURL, pos[0])
	u, err := c.me(ctx)
	if err != nil {
		return err
	}
	p := cfg.Profiles[name]
	p.URL, p.Token = serverURL, pos[0]
	cfg.Profiles[name] = p
	if cfg.Default == "" {
		cfg.Default = name
	}
	if err := saveConfig(a.ConfigPath, cfg); err != nil {
		return authErr("could not save config: %v", err)
	}
	if g.json {
		return a.printJSON(map[string]any{"server": serverURL, "profile": name, "user": u})
	}
	fmt.Fprintf(a.Stdout, "Token for %s stored in profile %q (%s).\n", u.Email, name, a.ConfigPath)
	return nil
}

// currentToken picks the token the client is using: authentication just updated
// its last-use time, so it is the most recently used one.
func currentToken(list []token) *token {
	var best *token
	for i := range list {
		t := &list[i]
		if t.LastUsedAt == nil {
			continue
		}
		if best == nil || *t.LastUsedAt > *best.LastUsedAt {
			best = t
		}
	}
	return best
}

func authStatus(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("auth status", g)
	if _, err := parseArgs(fs, "auth status", args); err != nil {
		return a.helpOr("auth", err)
	}
	c, t, err := a.connect(g)
	if err != nil {
		return err
	}
	u, err := c.me(ctx)
	if err != nil {
		return err
	}
	tokens, err := c.tokens(ctx)
	if err != nil {
		return err
	}
	cur := currentToken(tokens)
	if g.json {
		var raw json.RawMessage
		if cur != nil {
			raw = cur.Raw
		}
		return a.printJSON(map[string]any{"server": t.URL, "profile": t.Profile, "user": u, "token": raw})
	}
	tokenName := "(unknown)"
	if cur != nil {
		tokenName = cur.Name
	}
	source := "profile " + t.Profile
	if a.Getenv("OPENTODO_TOKEN") != "" {
		source = "OPENTODO_TOKEN"
	}
	fmt.Fprintf(a.Stdout, "Server:   %s\nAccount:  %s (%s)\nToken:    %s\nSource:   %s\nConfig:   %s\n", t.URL, u.Email, u.Role, tokenName, source, a.ConfigPath)
	return nil
}

func authLogout(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("auth logout", g)
	if _, err := parseArgs(fs, "auth logout", args); err != nil {
		return a.helpOr("auth", err)
	}
	c, t, err := a.connect(g)
	if err != nil {
		return err
	}
	revoked := ""
	tokens, err := c.tokens(ctx)
	var ee *exitError
	switch {
	case err == nil:
		if cur := currentToken(tokens); cur != nil {
			if err := c.delete(ctx, "/tokens/"+cur.ID); err != nil {
				return err
			}
			revoked = cur.Name
		}
	case errors.As(err, &ee) && ee.code == ExitAuth:
		// Already revoked on the server; still forget it locally.
	default:
		return err
	}
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return authErr("%v", err)
	}
	removedLocally := false
	if p, ok := cfg.Profiles[t.Profile]; ok && p.Token != "" && a.Getenv("OPENTODO_TOKEN") == "" {
		p.Token = ""
		cfg.Profiles[t.Profile] = p
		if err := saveConfig(a.ConfigPath, cfg); err != nil {
			return authErr("could not update config: %v", err)
		}
		removedLocally = true
	}
	if g.json {
		return a.printJSON(map[string]any{"server": t.URL, "profile": t.Profile, "revoked": revoked, "removedLocally": removedLocally})
	}
	switch {
	case revoked != "":
		fmt.Fprintf(a.Stdout, "Revoked token %q on %s", revoked, t.URL)
	default:
		fmt.Fprintf(a.Stdout, "Token was already invalid on %s", t.URL)
	}
	if removedLocally {
		fmt.Fprintf(a.Stdout, " and removed it from profile %q.\n", t.Profile)
	} else {
		fmt.Fprintln(a.Stdout, ". Nothing stored locally for this profile (token came from the environment).")
	}
	return nil
}
