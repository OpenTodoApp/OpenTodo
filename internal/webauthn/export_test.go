package webauthn

import "time"

// SetNow replaces the clock of a challenge store (tests only).
func SetNow(c *Challenges, now func() time.Time) { c.now = now }
