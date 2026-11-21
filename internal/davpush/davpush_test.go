package davpush

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

func testStore(t *testing.T) (*Store, *time.Time) {
	s, now, _ := testStoreDir(t)
	return s, now
}

func testStoreDir(t *testing.T) (*Store, *time.Time, string) {
	t.Helper()
	db, dir := storetest.Open(t)
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','u1@example.com','x','owner',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO app_passwords(id,user_id,name,hash,created_at) VALUES('ap1','u1','Phone','h1',1)`); err != nil {
		t.Fatal(err)
	}
	now := time.UnixMilli(1_760_000_000_000)
	return NewStore(db, dir, func() time.Time { return now }), &now, dir
}

func reg(resource string) caldav.PushRegistration {
	return caldav.PushRegistration{PushResource: resource, P256DH: "key", Auth: "auth"}
}

func TestExpiryIsClampedBetweenThreeAndSevenDays(t *testing.T) {
	s, now := testStore(t)
	cases := []struct{ asked, want time.Time }{
		{time.Time{}, now.Add(MaxExpiry)},
		{now.Add(time.Hour), now.Add(MinExpiry)},
		{now.Add(30 * 24 * time.Hour), now.Add(MaxExpiry)},
		{now.Add(5 * 24 * time.Hour), now.Add(5 * 24 * time.Hour)},
	}
	for _, c := range cases {
		if got := s.Expiry(c.asked); !got.Equal(c.want) {
			t.Errorf("Expiry(%v) = %v, want %v", c.asked, got, c.want)
		}
	}
}

func TestTopicIsStableAndDistinct(t *testing.T) {
	s, _, dir := testStoreDir(t)
	a, err := s.Topic("u1", "inbox")
	b, _ := s.Topic("u1", "inbox")
	c, _ := s.Topic("u1", Home)
	if err != nil || a != b || a == c || len(a) != 22 {
		t.Fatalf("topics %q %q %q %v", a, b, c, err)
	}
	// The key is kept: a new store over the same data directory gives the same topic.
	again := NewStore(s.db, dir, s.now)
	if d, _ := again.Topic("u1", "inbox"); d != a {
		t.Fatalf("topic after reopening = %q, want %q", d, a)
	}
}

func TestRegisterLimitRenewAndExpire(t *testing.T) {
	s, now := testStore(t)
	ctx := context.Background()
	exp := s.Expiry(time.Time{})
	for i := range MaxPerUser {
		if _, created, err := s.Register(ctx, "u1", "ap1", "inbox", reg(fmt.Sprintf("https://up.example.net/%d", i)), exp, 5); err != nil || !created {
			t.Fatalf("register %d: %v %v", i, created, err)
		}
	}
	if _, _, err := s.Register(ctx, "u1", "ap1", "inbox", reg("https://up.example.net/over"), exp, 5); !errors.Is(err, ErrLimit) {
		t.Fatalf("21st: %v", err)
	}
	// The same push resource renews instead.
	sub, created, err := s.Register(ctx, "u1", "ap1", "inbox", reg("https://up.example.net/0"), exp.Add(time.Hour), 9)
	if err != nil || created || sub.ExpiresAt != exp.Add(time.Hour).UnixMilli() || sub.LastNotifiedSeq != 5 {
		t.Fatalf("renewal %+v %v %v", sub, created, err)
	}
	// A subscription failing for long enough is removed; expired ones too.
	if _, err := s.db.Exec(`UPDATE dav_push_subscriptions SET failures = ? WHERE push_resource = 'https://up.example.net/1'`, MaxFailures); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(FailureWindow + time.Minute)
	if err := s.expire(ctx); err != nil {
		t.Fatal(err)
	}
	live, _ := s.live(ctx)
	if len(live["u1"]) != MaxPerUser-1 {
		t.Fatalf("live = %d", len(live["u1"]))
	}
	*now = now.Add(MaxExpiry)
	if err := s.expire(ctx); err != nil {
		t.Fatal(err)
	}
	if live, _ := s.live(ctx); len(live["u1"]) != 0 {
		t.Fatalf("after expiry = %d", len(live["u1"]))
	}
}

// TestSilenceOnlyTheWritersOwn (security read of caldav-push): Push-Dont-Notify
// moves only the writing app password's subscriptions, and only past the
// write's own ops: another password's, another user's, and one with changes
// pending from before the write are left as they were.
func TestSilenceOnlyTheWritersOwn(t *testing.T) {
	s, _ := testStore(t)
	ctx := context.Background()
	if _, err := s.db.Exec(`INSERT INTO app_passwords(id,user_id,name,hash,created_at) VALUES('ap2','u1','Tablet','h2',1)`); err != nil {
		t.Fatal(err)
	}
	exp := s.Expiry(time.Time{})
	a, _, _ := s.Register(ctx, "u1", "ap1", "inbox", reg("https://up.example.net/a"), exp, 5)
	b, _, _ := s.Register(ctx, "u1", "ap1", "inbox", reg("https://up.example.net/b"), exp, 5)
	other, _, _ := s.Register(ctx, "u1", "ap2", "inbox", reg("https://up.example.net/other"), exp, 5)
	behind, _, _ := s.Register(ctx, "u1", "ap1", Home, reg("https://up.example.net/behind"), exp, 3)
	seq := func(id string) int64 { x, _ := s.get(ctx, id); return x.LastNotifiedSeq }
	// Another user's request matches nothing; a listed subscription moves, the rest wait.
	if err := s.Silence(ctx, "someone-else", "ap1", []string{a.ID}, false, 5, 9); err != nil {
		t.Fatal(err)
	}
	if err := s.Silence(ctx, "u1", "ap1", []string{a.ID}, false, 5, 9); err != nil {
		t.Fatal(err)
	}
	if seq(a.ID) != 9 || seq(b.ID) != 5 {
		t.Fatalf("listed: a %d b %d", seq(a.ID), seq(b.ID))
	}
	// "*" from ap1: its own up-to-date ones move; ap2's never; one behind keeps its pending changes.
	if err := s.Silence(ctx, "u1", "ap1", nil, true, 5, 12); err != nil {
		t.Fatal(err)
	}
	if seq(b.ID) != 12 || seq(other.ID) != 5 || seq(behind.ID) != 3 {
		t.Fatalf("all: b %d other %d behind %d", seq(b.ID), seq(other.ID), seq(behind.ID))
	}
	// A subscription of another password cannot be named either.
	if err := s.Silence(ctx, "u1", "ap1", []string{other.ID}, false, 5, 15); err != nil {
		t.Fatal(err)
	}
	if seq(other.ID) != 5 {
		t.Fatalf("named other password: %d", seq(other.ID))
	}
	// DELETE is the registering password's own too.
	if ok, _ := s.Delete(ctx, "u1", "ap1", other.ID); ok {
		t.Fatal("deleted another password's subscription")
	}
	if ok, _ := s.Delete(ctx, "u1", "ap2", other.ID); !ok {
		t.Fatal("could not delete its own")
	}
}

func TestDueByCollection(t *testing.T) {
	cal := &Subscription{Collection: "inbox"}
	home := &Subscription{Collection: Home}
	if due(cal, Changes{Calendars: map[string]bool{"work": true}}) || !due(cal, Changes{Calendars: map[string]bool{"inbox": true}}) || !due(cal, Changes{All: true}) {
		t.Fatal("calendar subscription")
	}
	if due(home, Changes{}) || !due(home, Changes{CalendarSet: true}) || !due(home, Changes{Calendars: map[string]bool{"work": true}}) {
		t.Fatal("home subscription")
	}
}
