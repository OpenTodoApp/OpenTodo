package rules

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
)

// Email project members (OpenSpec change routines-shared-email): one routine
// email to each member of a shared routine's project, each with a stop link of
// its own. Who receives is read when the step plans and again when it sends
// (design D1); every message counts toward the daily email limits (D2).

// StopLinkPrefix marks the secret of a routine email's stop link.
const StopLinkPrefix = "ots_"

// StopLinkAge is how long a stop link stays usable (design D4).
const StopLinkAge = 365 * 24 * time.Hour

// ErrStopLinkInvalid covers every unusable stop link: unknown, expired or malformed.
var ErrStopLinkInvalid = errors.New("this link is no longer valid")

func stopHash(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// MintStopLink stores a new stop link for one message of a routine to a
// member and returns its secret. Only the secret's hash is kept; links past
// their age are removed on the way.
func (s *Store) MintStopLink(ctx context.Context, ruleID, userID string, now time.Time) (string, error) {
	secret := StopLinkPrefix + ids.Secret(32)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `INSERT INTO routine_email_links (hash, rule_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
		stopHash(secret), ruleID, userID, now.UnixMilli()); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM routine_email_links WHERE created_at < ?`, now.Add(-StopLinkAge).UnixMilli()); err != nil {
		return "", err
	}
	return secret, tx.Commit()
}

// StopLink resolves a stop link's secret to its routine and member.
func (s *Store) StopLink(ctx context.Context, secret string, now time.Time) (ruleID, userID string, err error) {
	if !strings.HasPrefix(secret, StopLinkPrefix) || len(secret) > 128 {
		return "", "", ErrStopLinkInvalid
	}
	var created int64
	err = s.db.QueryRowContext(ctx, `SELECT rule_id, user_id, created_at FROM routine_email_links WHERE hash = ?`, stopHash(secret)).Scan(&ruleID, &userID, &created)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && created < now.Add(-StopLinkAge).UnixMilli()) {
		return "", "", ErrStopLinkInvalid
	}
	return ruleID, userID, err
}

// StopEmails records that a member gets no more emails from a routine. It
// reports whether this call stopped them (false: they had already).
func (s *Store) StopEmails(ctx context.Context, ruleID, userID string, now time.Time) (bool, error) {
	res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO routine_email_stops (rule_id, user_id, stopped_at) VALUES (?, ?, ?)`,
		ruleID, userID, now.UnixMilli())
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// EmailsStopped reports whether a member stopped a routine's emails.
func (s *Store) EmailsStopped(ctx context.Context, ruleID, userID string) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM routine_email_stops WHERE rule_id = ? AND user_id = ?`, ruleID, userID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// RoutineName is a routine's name for its stop page, from whichever scope
// holds it ("" when the routine is gone). The page shows nothing else.
func (e *Engine) RoutineName(ctx context.Context, ruleID string) string {
	var raw, name string
	_ = e.db.QueryRowContext(ctx, `SELECT value FROM scope_fields WHERE entity = 'rule' AND entity_id = ? AND field = 'name' LIMIT 1`, ruleID).Scan(&raw)
	_ = json.Unmarshal([]byte(raw), &name)
	return e2ee.Display(name)
}

// memberRecipients are the members of a project an Email project members step
// of a routine reaches now (design D1): every role, with a verified address,
// not deactivated, not encrypted, and not stopped for this routine. Sorted.
func (e *Engine) memberRecipients(ctx context.Context, projectID, ruleID string) ([]string, error) {
	rows, err := e.db.QueryContext(ctx, `SELECT DISTINCT m.user_id FROM project_members m
		JOIN users u ON u.id = m.user_id
		LEFT JOIN user_status us ON us.user_id = m.user_id
		WHERE m.project_id = ? AND u.email != '' AND u.email_verified_at IS NOT NULL AND us.deactivated_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM routine_email_stops x WHERE x.rule_id = ? AND x.user_id = m.user_id)
		ORDER BY m.user_id`, projectID, ruleID)
	if err != nil {
		return nil, err
	}
	var all []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		all = append(all, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := all[:0]
	for _, id := range all {
		// A routine message is never built for an encrypted account (outgoing-email).
		if on, err := e.keys.Enabled(ctx, id); err != nil {
			return nil, err
		} else if !on {
			out = append(out, id)
		}
	}
	return out, nil
}

// routineMail is an email step's message with its subject and text cut to
// the step's limits.
func (st *runState) routineMail(s *ruleval.Step, in map[string]ruleval.Value) RoutineMail {
	subject, _ := st.textIn(s, in, "subject")
	text, _ := st.textIn(s, in, "text")
	if r := []rune(subject); len(r) > ruleval.MaxSubject {
		subject = string(r[:ruleval.MaxSubject])
	}
	if r := []rune(text); len(r) > ruleval.MaxEmailText {
		text = string(r[:ruleval.MaxEmailText])
	}
	return RoutineMail{RuleID: st.r.ID, RuleName: st.r.Name, RunID: st.runID, Subject: subject, Text: text}
}

// takeEmails counts n more emails of the run against the daily limits; past
// them the step fails with rate_limited and the refusal is recorded.
func (st *runState) takeEmails(n int, m RoutineMail, day string) error {
	mine, all, err := st.e.Store.emailCounts(st.ctx, st.r.ID, st.w.uid, day)
	if err != nil {
		return err
	}
	if st.emails += n; mine+st.emails > EmailsPerRoutine || all+st.emails > EmailsPerAccount {
		if !st.test && st.e.Mail != nil {
			st.e.Mail.RefuseRoutine(st.ctx, st.w.uid, m, "rate_limited")
		}
		return failf("rate_limited", "at most %d emails per routine and %d per account a day", EmailsPerRoutine, EmailsPerAccount)
	}
	return nil
}

// emailMembersStep queues one email per member of the routine's project,
// each counted toward the daily limits. Without a recipient it sends nothing.
func (st *runState) emailMembersStep(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	if st.w.project == "" {
		return none(), "", failf(ruleval.ReasonNotShared, "%s", ruleval.ReasonText(ruleval.ReasonNotShared))
	}
	m := st.routineMail(s, in)
	to, err := st.e.memberRecipients(st.ctx, st.w.project, st.r.ID)
	if err != nil || len(to) == 0 {
		return none(), "", err
	}
	day := time.UnixMilli(st.nowMs).UTC().Format("2006-01-02")
	if err := st.takeEmails(len(to), m, day); err != nil {
		return none(), "", err
	}
	st.sides = append(st.sides, st.side(sideSpec{Kind: "email", Mail: &m, Day: day, Project: st.w.project, Members: to}))
	return none(), "", nil
}

// sendMembers is the side effect of an Email project members step: the
// planned members who still receive it now, one message each, every message
// taking its daily count first.
func (e *Engine) sendMembers(ctx context.Context, runAs string, sp sideSpec) error {
	m := *sp.Mail
	now, err := e.memberRecipients(ctx, sp.Project, m.RuleID)
	if err != nil {
		return err
	}
	var errs []error
	for _, to := range sp.Members {
		if !slices.Contains(now, to) {
			continue
		}
		ok, err := e.Store.TakeEmail(ctx, m.RuleID, runAs, sp.Day)
		if err != nil {
			return errors.Join(append(errs, err)...)
		}
		if !ok {
			e.Mail.RefuseRoutineMember(ctx, runAs, to, m, "rate_limited")
			continue
		}
		if err := e.Mail.SendRoutineMember(ctx, runAs, to, m); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
