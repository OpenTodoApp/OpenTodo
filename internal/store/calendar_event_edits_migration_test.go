package store

import (
	"context"
	"testing"
)

// The calendar-event-edits migration runs twice without harm, keeps the
// existing calendar data and resets only the managed calendars' versions.
func TestCalendarEventEditsMigration(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u','u@example.org','u','x','owner',1)`,
		`INSERT INTO calendar_subscriptions(id,user_id,url,name,color,enabled,interval_seconds,next_fetch_at,created_at,updated_at,etag) VALUES('feed','u','https://x/a.ics','A','',1,3600,0,1,1,'"f1"')`,
		`INSERT INTO calendar_subscriptions(id,user_id,url,name,color,enabled,interval_seconds,next_fetch_at,created_at,updated_at,etag) VALUES('man','u','https://x/cal/','B','',1,3600,0,1,1,'st:1')`,
		`INSERT INTO calsync_connections(id,user_id,provider,name,server_url,username,principal_url,home_url,calendars,enabled,next_sync_at,created_at,updated_at) VALUES('c','u','caldav','C','https://x/','me','','','[]',1,0,1,1)`,
		`INSERT INTO calsync_calendars(subscription_id, connection_id, calendar_url) VALUES('man','c','https://x/cal/')`,
		`INSERT INTO calsync_event_edit(connection_id, assistants) VALUES('c', 1)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	m, err := migrations.ReadFile("migrations/0075_calendar_event_edits.sql")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := db.ExecContext(ctx, string(m)); err != nil {
			t.Fatalf("run %d: %v", i+1, err)
		}
	}
	var feed, man string
	_ = db.QueryRowContext(ctx, `SELECT etag FROM calendar_subscriptions WHERE id='feed'`).Scan(&feed)
	_ = db.QueryRowContext(ctx, `SELECT etag FROM calendar_subscriptions WHERE id='man'`).Scan(&man)
	if feed != `"f1"` || man != "" {
		t.Fatalf("etags feed=%q managed=%q, want the feed's kept and the managed one reset", feed, man)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM calsync_event_edit WHERE assistants = 1`).Scan(&n)
	if n != 1 {
		t.Fatalf("calsync_event_edit lost its row on the second run")
	}
	// Deleting the connection removes its settings, addresses and undo rows.
	for _, q := range []string{
		`INSERT INTO calsync_account_addresses(connection_id, address) VALUES('c','me@example.org')`,
		`INSERT INTO calendar_event_undo(connection_id,event_id,etag,token_id,created_at) VALUES('c','e1','"1"','t',1)`,
		`INSERT INTO calendar_event_remote(subscription_id,uid,instance,event_id,href) VALUES('man','u1','20261112T090000Z','e1','https://x/cal/u1.ics')`,
		`DELETE FROM calsync_connections WHERE id='c'`,
		`DELETE FROM calendar_subscriptions WHERE id='man'`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	for _, table := range []string{"calsync_event_edit", "calsync_account_addresses", "calendar_event_undo", "calendar_event_remote"} {
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table).Scan(&n)
		if n != 0 {
			t.Fatalf("%s kept %d rows after its parent was deleted", table, n)
		}
	}
}
