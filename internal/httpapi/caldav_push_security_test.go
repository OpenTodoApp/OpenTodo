package httpapi

import (
	"context"
	"testing"
	"time"
)

// Security read of caldav-push, finding 3: deactivating an account, signing
// out everywhere and deleting the account each remove its calendar apps' push
// subscriptions at once, not at their expiry.
func TestCaldavPushSubscriptionsEndWithTheAccount(t *testing.T) {
	ctx := context.Background()
	for _, c := range []struct {
		name string
		end  func(se *shareEnv) error
	}{
		{"deactivate", func(se *shareEnv) error {
			_, err := se.alice.server.auth.Deactivate(ctx, se.ids["alice"], se.ids["bob"])
			return err
		}},
		{"sign out everywhere", func(se *shareEnv) error { return se.alice.server.auth.SignOutEverywhere(ctx, se.ids["bob"]) }},
		{"delete the account", func(se *shareEnv) error {
			_, err := se.alice.server.auth.DeleteUser(ctx, se.ids["alice"], se.ids["bob"], "bob@example.com")
			return err
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			se := newShareEnv(t)
			for _, p := range []string{"/api/v1/settings/caldav", "/api/v1/settings/caldav/push"} {
				resp, out := se.alice.do("PUT", p, map[string]any{"enabled": true})
				se.alice.mustStatus(resp, 200, out)
			}
			alice := newDavClient(se.alice, "alice@example.com", se.ids["alice"])
			bob := newDavClient(se.bob, "bob@example.com", se.ids["bob"])
			alice.must("POST", alice.cal("inbox"), pushRegisterBody("https://up.example.net/alice"), 201)
			bob.must("POST", bob.cal("inbox"), pushRegisterBody("https://up.example.net/bob"), 201)
			if err := c.end(se); err != nil {
				t.Fatal(err)
			}
			count := func(uid string) (n int) {
				if err := se.alice.db.QueryRow(`SELECT COUNT(*) FROM dav_push_subscriptions WHERE user_id = ?`, uid).Scan(&n); err != nil {
					t.Fatal(err)
				}
				return n
			}
			if count(se.ids["bob"]) != 0 || count(se.ids["alice"]) != 1 {
				t.Fatalf("bob %d alice %d", count(se.ids["bob"]), count(se.ids["alice"]))
			}
		})
	}
}

// Security read of caldav-push, finding 4: Push-Dont-Notify silences only the
// writing app password's own subscriptions, and only past the write's own ops,
// so a narrowly scoped password cannot silence the user's other devices and a
// change made before the write is still pushed.
func TestCaldavPushDontNotifyOnlyTheWritersOwn(t *testing.T) {
	e, phone, job, fake, now := pushSetup(t)
	tablet := newDavClient(e, "owner@example.com", phone.uid)
	phone.must("POST", phone.cal("inbox"), pushRegisterBody("https://up.example.net/phone"), 201)
	tablet.must("POST", tablet.cal("inbox"), pushRegisterBody("https://up.example.net/tablet"), 201)

	// "*" from the phone leaves the tablet's subscription alone.
	phone.must("PUT", phone.cal("inbox")+"dav-a.ics", vtodoBody("dav-a", "SUMMARY:From the phone"), 201, "Push-Dont-Notify", "*")
	*now = now.Add(time.Second)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/phone") != 0 || fake.count("https://up.example.net/tablet") != 1 {
		t.Fatalf("phone %d tablet %d", fake.count("https://up.example.net/phone"), fake.count("https://up.example.net/tablet"))
	}

	// A change from the web, then the phone's own write with "*": the web change is still pushed to the phone.
	pushTask(t, e, "From the web")
	phone.must("PUT", phone.cal("inbox")+"dav-b.ics", vtodoBody("dav-b", "SUMMARY:Again from the phone"), 201, "Push-Dont-Notify", "*")
	*now = now.Add(time.Minute)
	job.RunOnce(context.Background())
	if fake.count("https://up.example.net/phone") != 1 {
		t.Fatalf("a change before the write was skipped: phone %d", fake.count("https://up.example.net/phone"))
	}
}
