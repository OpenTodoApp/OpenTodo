package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Audit log commands (OpenSpec change audit-hash-chain): `ot audit verify`
// asks the server to recompute the audit log's hash chain. Owner only, like
// every audit route; a broken chain exits 1 with audit_chain_broken.

// auditVerification is GET /api/v1/audit/verify.
type auditVerification struct {
	OK         bool           `json:"ok"`
	Checked    int64          `json:"checked"`
	Uncovered  int64          `json:"uncovered"`
	Checkpoint auditChainHead `json:"checkpoint"`
	Head       auditChainHead `json:"head"`
	Break      *struct {
		ID     int64  `json:"id"`
		Reason string `json:"reason"`
	} `json:"break"`
}

type auditChainHead struct {
	ID   int64  `json:"id"`
	Hash string `json:"hash"`
}

func cmdAudit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot audit verify")
	}
	switch args[0] {
	case "verify":
		return auditVerify(a, ctx, g, args[1:])
	}
	return usageErr("unknown audit command %q (expected verify)", args[0])
}

func auditVerify(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("audit verify", g)
	pos, err := a.parse(g, fs, "audit verify", args)
	if err != nil {
		return a.helpOr("audit", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot audit verify")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodGet, "/audit/verify", nil, nil)
	if err != nil {
		return err
	}
	var v auditVerification
	if err := json.Unmarshal(raw, &v); err != nil {
		return fmt.Errorf("decode verification: %w", err)
	}
	if g.json {
		if err := a.printJSON(json.RawMessage(raw)); err != nil {
			return err
		}
	}
	if v.Break != nil {
		msg := fmt.Sprintf("the audit log's hash chain is broken at event %d (%s): it was changed outside OpenTodo", v.Break.ID, v.Break.Reason)
		return &exitError{code: ExitServer, jsonCode: "audit_chain_broken", msg: msg, printed: g.json}
	}
	if g.json {
		return nil
	}
	fmt.Fprintf(a.Stdout, "Audit chain intact: %d events checked", v.Checked)
	if v.Checked > 0 {
		fmt.Fprintf(a.Stdout, ", newest %d", v.Head.ID)
	}
	fmt.Fprintln(a.Stdout, ".")
	fmt.Fprintf(a.Stdout, "Head: %d %s\n", v.Head.ID, v.Head.Hash)
	if v.Checkpoint.ID > 0 {
		fmt.Fprintf(a.Stdout, "Checked from event %d (events up to it were pruned or recorded before the chain).\n", v.Checkpoint.ID)
	}
	if v.Uncovered > 0 {
		fmt.Fprintf(a.Stdout, "%d older events are from before the chain and not covered.\n", v.Uncovered)
	}
	return nil
}
