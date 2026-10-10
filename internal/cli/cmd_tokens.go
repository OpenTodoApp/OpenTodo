package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

func cmdToken(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot token list|create <name>|revoke <id-or-name>")
	}
	sub, rest := args[0], args[1:]
	switch sub {
	case "list", "ls":
		return tokenList(a, ctx, g, rest)
	case "create", "add":
		return tokenCreate(a, ctx, g, rest)
	case "revoke", "rm", "delete":
		return tokenRevoke(a, ctx, g, rest)
	}
	return usageErr("unknown token command %q (expected list, create or revoke)", sub)
}

func tokenList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("token list", g)
	if _, err := parseArgs(fs, "token list", args); err != nil {
		return a.helpOr("token", err)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	tokens, err := c.tokens(ctx)
	if err != nil {
		return err
	}
	if g.json {
		raws := make([]json.RawMessage, 0, len(tokens))
		for _, t := range tokens {
			raws = append(raws, t.Raw)
		}
		return a.printRawList(raws)
	}
	if len(tokens) == 0 {
		fmt.Fprintln(a.Stdout, "No tokens.")
		return nil
	}
	cur := currentToken(tokens)
	tbl := newTable("ID", "NAME", "CREATED", "LAST USED", "")
	for _, t := range tokens {
		last := "never"
		if t.LastUsedAt != nil {
			last = formatMillis(float64(*t.LastUsedAt))
		}
		mark := ""
		if cur != nil && cur.ID == t.ID {
			mark = "(this client)"
		}
		tbl.add(cell{text: shortID(t.ID), style: styleCyan}, plain(t.Name), plain(formatMillis(float64(t.CreatedAt))), plain(last), cell{text: mark, style: styleDim})
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func tokenCreate(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("token create", g)
	pos, err := parseArgs(fs, "token create", args)
	if err != nil {
		return a.helpOr("token", err)
	}
	name := strings.TrimSpace(strings.Join(pos, " "))
	if name == "" {
		return usageErr("usage: ot token create <name>")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	var raw json.RawMessage
	if err := c.postJSON(ctx, "/tokens", map[string]string{"name": name}, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var created struct {
		Token  token  `json:"token"`
		Secret string `json:"secret"`
	}
	_ = json.Unmarshal(raw, &created)
	fmt.Fprintf(a.Stdout, "%s\n", created.Secret)
	fmt.Fprintf(a.Stderr, "Token %q (%s) created. This secret is shown only once; store it now.\n", created.Token.Name, shortID(created.Token.ID))
	return nil
}

func tokenRevoke(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("token revoke", g)
	pos, err := parseArgs(fs, "token revoke", args)
	if err != nil {
		return a.helpOr("token", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot token revoke <id-or-name>")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	tokens, err := c.tokens(ctx)
	if err != nil {
		return err
	}
	var match *token
	var candidates []*token
	for i := range tokens {
		t := &tokens[i]
		if t.ID == pos[0] {
			match = t
			break
		}
		if strings.HasPrefix(t.ID, pos[0]) || t.Name == pos[0] {
			candidates = append(candidates, t)
		}
	}
	if match == nil {
		switch len(candidates) {
		case 0:
			return usageErr("no token %q (see `ot token list`)", pos[0])
		case 1:
			match = candidates[0]
		default:
			return usageErr("%q matches %d tokens; use the id", pos[0], len(candidates))
		}
	}
	if err := c.delete(ctx, "/tokens/"+match.ID); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(match.Raw)
	}
	fmt.Fprintf(a.Stdout, "revoked  %s  %s\n", shortID(match.ID), match.Name)
	if cur := currentToken(tokens); cur != nil && cur.ID == match.ID {
		fmt.Fprintln(a.Stderr, "That was this client's own token; run `ot login` before the next command.")
	}
	return nil
}

func cmdExport(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("export", g)
	out := fs.String("out", "", "write to this file instead of stdout")
	fs.StringVar(out, "o", "", "write to this file instead of stdout")
	if _, err := parseArgs(fs, "export", args); err != nil {
		return a.helpOr("export", err)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodGet, "/export", nil, nil)
	if err != nil {
		return err
	}
	if *out == "" {
		_, err := a.Stdout.Write(raw)
		return err
	}
	if err := os.WriteFile(*out, raw, 0o600); err != nil {
		return usageErr("write %s: %v", *out, err)
	}
	if g.json {
		return a.printJSON(map[string]any{"file": *out, "bytes": len(raw), "exportedAt": time.Now().UTC().Format(time.RFC3339)})
	}
	fmt.Fprintf(a.Stdout, "Wrote %d bytes to %s\n", len(raw), *out)
	return nil
}
