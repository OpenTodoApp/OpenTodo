package httpapi

import "time"

// now is the time the request path uses for timestamps it writes or compares
// (created, edited, deleted and completed times, expiries, serverTime). Timing
// of the request itself (latency logs, write deadlines) stays on time.Now.
func (s *Server) now() time.Time { return s.clock() }

// WithClock replaces the time source of the server and of the auth and sync
// services it was built with, so a test can pin or step time instead of
// sleeping. Production never sets it.
func WithClock(now func() time.Time) Option {
	return func(s *Server) {
		s.clock = now
		s.auth.SetClock(now)
		s.sync.SetClock(now)
	}
}
