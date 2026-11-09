package rules

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ruleval"
)

// Email project members (OpenSpec change routines-shared-email).

const emailMembers = `[{"id":"a","kind":"email_members","in":{"subject":{"literal":"This week"},"text":{"literal":"3 chores left"}}}]`

// membersHarness: Household shared by alice with bob (editor) and carol
// (viewer); alice and bob have verified addresses, carol has none.
func membersHarness(t *testing.T) (*harness, *fakeMailer) {
	h, _ := sharedHarness(t)
	env := h.e.Env(h.ctx, "alice")
	env.EmailConfigured, env.EmailVerified = true, true
	h.e.Env = func(context.Context, string) ruleval.Env { return env }
	if _, err := h.e.db.Exec(`UPDATE users SET email_verified_at = 1 WHERE id IN ('alice', 'bob')`); err != nil {
		t.Fatal(err)
	}
	mailer := &fakeMailer{}
	h.e.Mail = mailer
	return h, mailer
}

// "Weekly summary to the household": one message per member with a verified
// address, the run-as person included; carol has none and gets nothing. A
// test sends nothing.
func TestEmailMembersReachesVerifiedMembers(t *testing.T) {
	h, mailer := membersHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, emailMembers)
	if res := h.runNow("alice", "r1", "", true); len(mailer.sent) != 0 || res.Run.Outcome == OutcomeFailed {
		t.Fatalf("a test sent %d (%+v)", len(mailer.sent), res.Run)
	}
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	if !slices.Equal(mailer.members, []string{"alice>alice", "alice>bob"}) {
		t.Fatalf("members %v", mailer.members)
	}
	if m := mailer.sent[0]; m.Subject != "This week" || m.Text != "3 chores left" || m.RuleName != "Weekly chores" || m.RunID != res.Run.RunID {
		t.Fatalf("mail %+v", m)
	}
	// Each message counts toward the routine's daily emails.
	mine, all, err := h.e.Store.emailCounts(h.ctx, "r1", "alice", h.clock.UTC().Format("2006-01-02"))
	if err != nil || mine != 2 || all != 2 {
		t.Fatalf("counts %d %d %v", mine, all, err)
	}
}

// "Bob stops the emails": his link resolves to the routine and him, stopping
// is recorded once, and the next run emails alice only. A wrong, malformed or
// expired secret is refused.
func TestEmailMembersStopLink(t *testing.T) {
	h, mailer := membersHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, emailMembers)
	secret, err := h.e.Store.MintStopLink(h.ctx, "r1", "bob", h.clock)
	if err != nil || len(secret) < 40 || secret[:4] != StopLinkPrefix {
		t.Fatalf("secret %q %v", secret, err)
	}
	var stored string
	if err := h.e.db.QueryRow(`SELECT hash FROM routine_email_links`).Scan(&stored); err != nil || stored == secret {
		t.Fatalf("the secret is stored as it is (%v)", err)
	}
	rule, user, err := h.e.Store.StopLink(h.ctx, secret, h.clock)
	if err != nil || rule != "r1" || user != "bob" {
		t.Fatalf("link %q %q %v", rule, user, err)
	}
	for _, bad := range []string{secret + "x", "otl_" + secret[4:], ""} {
		if _, _, err := h.e.Store.StopLink(h.ctx, bad, h.clock); !errors.Is(err, ErrStopLinkInvalid) {
			t.Fatalf("%q: %v", bad, err)
		}
	}
	if _, _, err := h.e.Store.StopLink(h.ctx, secret, h.clock.Add(StopLinkAge+time.Hour)); !errors.Is(err, ErrStopLinkInvalid) {
		t.Fatalf("expired: %v", err)
	}
	if name := h.e.RoutineName(h.ctx, "r1"); name != "Weekly chores" {
		t.Fatalf("name %q", name)
	}
	for i, want := range []bool{true, false} {
		if changed, err := h.e.Store.StopEmails(h.ctx, "r1", "bob", h.clock); err != nil || changed != want {
			t.Fatalf("stop %d: %v %v", i, changed, err)
		}
	}
	if stopped, _ := h.e.Store.EmailsStopped(h.ctx, "r1", "bob"); !stopped {
		t.Fatal("not stopped")
	}
	h.runNow("alice", "r1", "", false)
	if !slices.Equal(mailer.members, []string{"alice>alice"}) {
		t.Fatalf("members %v", mailer.members)
	}
	// A link older than a year is removed when the next one is minted.
	if _, err := h.e.Store.MintStopLink(h.ctx, "r1", "alice", h.clock.Add(StopLinkAge+time.Hour)); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := h.e.db.QueryRow(`SELECT COUNT(*) FROM routine_email_links`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("%d links %v", n, err)
	}
}

// "Member who left": who receives is checked again when sending, so bob,
// planned but removed in between, gets nothing.
func TestEmailMembersLeftBeforeSend(t *testing.T) {
	h, mailer := membersHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, emailMembers)
	if _, err := h.sync.RemoveMember(h.ctx, "alice", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	m := RoutineMail{RuleID: "r1", RuleName: "Weekly chores", Subject: "s", Text: "t"}
	sp := sideSpec{Kind: "email", Mail: &m, Day: h.clock.UTC().Format("2006-01-02"), Project: "p", Members: []string{"alice", "bob"}}
	if err := h.e.sendMembers(h.ctx, "alice", sp); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(mailer.members, []string{"alice>alice"}) {
		t.Fatalf("members %v", mailer.members)
	}
}

// "Over the daily limit": 9 sent today and 2 recipients fail the step before
// anything is written or sent; the refusal is recorded.
func TestEmailMembersOverTheLimit(t *testing.T) {
	h, mailer := membersHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, `[
		{"id":"a","kind":"create_tasks","in":{"text":{"literal":"Sweep"}}},
		{"id":"b","kind":"email_members","in":{"subject":{"literal":"This week"},"text":{"literal":"3 chores left"}}}]`)
	if _, err := h.e.db.Exec(`INSERT INTO routine_emails (rule_id, user_id, day, sent) VALUES ('r1', 'alice', ?, 9)`, h.clock.UTC().Format("2006-01-02")); err != nil {
		t.Fatal(err)
	}
	res := h.runNow("alice", "r1", "", false)
	if got := statuses(res); res.Run.Outcome != OutcomeFailed || got[len(got)-1] != "b:failed:rate_limited" {
		t.Fatalf("run %+v %v", res.Run, got)
	}
	if len(mailer.sent) != 0 || !slices.Equal(mailer.refused, []string{"rate_limited"}) {
		t.Fatalf("sent %d refused %v", len(mailer.sent), mailer.refused)
	}
	if n := len(h.live("alice", inProject("p"))); n != 0 {
		t.Fatalf("%d tasks written", n)
	}
}

// Sending takes each message's count: when another run used the allowance
// meanwhile, the rest are refused, not sent.
func TestEmailMembersCountsAtSend(t *testing.T) {
	h, mailer := membersHarness(t)
	day := h.clock.UTC().Format("2006-01-02")
	if _, err := h.e.db.Exec(`INSERT INTO routine_emails (rule_id, user_id, day, sent) VALUES ('r1', 'alice', ?, 9)`, day); err != nil {
		t.Fatal(err)
	}
	m := RoutineMail{RuleID: "r1", RuleName: "Weekly chores", Subject: "s", Text: "t"}
	if err := h.e.sendMembers(h.ctx, "alice", sideSpec{Kind: "email", Mail: &m, Day: day, Project: "p", Members: []string{"alice", "bob"}}); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(mailer.members, []string{"alice>alice"}) || !slices.Equal(mailer.refused, []string{"bob:rate_limited"}) {
		t.Fatalf("members %v refused %v", mailer.members, mailer.refused)
	}
}

// A personal routine's Email project members is not shared: the run fails at the step.
func TestEmailMembersPersonalRoutine(t *testing.T) {
	h, mailer := membersHarness(t)
	h.routine("alice", "r1", "Mine", `{"kind":"manual"}`, "", emailMembers)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeFailed || len(mailer.sent) != 0 {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
}
