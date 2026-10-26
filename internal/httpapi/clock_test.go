package httpapi

import (
	"testing"
	"time"
)

// TestServerClockDrivesTimestampsAndExpiry: with WithClock the request path, the
// auth service and the sync service read one clock, so a test moves time instead
// of sleeping or backdating rows (improvement plan T2, G9).
func TestServerClockDrivesTimestampsAndExpiry(t *testing.T) {
	t.Parallel()
	e := newEnv(t, false)
	start := time.Date(2031, 3, 30, 1, 30, 0, 0, time.UTC)
	e.now.Freeze(start)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	// A REST write stamps created_at, and the sync answer reports serverTime, from the server clock.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Pinned in time"})
	e.mustStatus(resp, 201, out)
	if got := int64(out["created_at"].(float64)); got < start.UnixMilli() || got > start.Add(time.Second).UnixMilli() {
		t.Fatalf("created_at = %d, want the frozen clock %d", got, start.UnixMilli())
	}
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, 200, out)
	if got := int64(out["serverTime"].(float64)); got < start.UnixMilli() || got > start.Add(time.Second).UnixMilli() {
		t.Fatalf("serverTime = %d, want the frozen clock", got)
	}

	// An invitation for one hour: valid now, expired once the clock moves past it.
	_, secret, inv := e.invite(map[string]any{"expiresInHours": 1})
	if created := int64(inv["createdAt"].(float64)); created < start.UnixMilli() || created > start.Add(time.Second).UnixMilli() {
		t.Fatalf("invitation createdAt = %d, want the frozen clock", created)
	}
	anon := newClientAt(e, "10.0.0.9")
	resp, out = anon.do("GET", "/api/v1/invitations/"+secret, nil)
	anon.mustStatus(resp, 200, out)
	e.now.Advance(61 * time.Minute)
	resp, out = anon.do("GET", "/api/v1/invitations/"+secret, nil)
	anon.mustStatus(resp, 404, out)
	if errCode(out) != "invitation_invalid" {
		t.Fatalf("code = %s", errCode(out))
	}
}
