package sync

import (
	"context"
	"database/sql"
	"strings"

	"github.com/pixari/opentodo/internal/ids"
)

// ServerDevicePrefix starts the device id of every op the server writes itself
// (REST writes, imports, email, push delivery records, unassignments after a
// departure). Older releases wrote the bare "server"; IsServerDevice accepts both.
const ServerDevicePrefix = "server"

// ServerDevice is this process's device id for its own writes: "server:" plus a
// boot id (OpenSpec change sync-convergence). Two server processes writing the
// same field in the same millisecond (a restart with a clock step back, a second
// process on the same database) then never tie on (ts, device), which would
// silently drop the second write.
var ServerDevice = ServerDevicePrefix + ":" + ids.New()[:8]

// IsServerDevice reports whether device is the server's: "server" (older
// releases) or "server:<boot id>".
func IsServerDevice(device string) bool {
	return device == ServerDevicePrefix || strings.HasPrefix(device, ServerDevicePrefix+":")
}

// ServerTS issues the timestamp of a server-side write: strictly increasing for
// this service, so two writes to one field within one millisecond never tie, and
// never behind the wall clock. Every server writer (REST, assistant tools, push,
// importer, email, membership) uses it (sync-convergence).
func (s *Service) ServerTS() int64 { return s.ServerTSAt(s.now().UnixMilli()) }

// ServerTSAt is ServerTS for a writer that reads its own clock or must beat a
// stored value: the result is at least ms and greater than every timestamp this
// service issued before or saw on a stored op (observeTS).
func (s *Service) ServerTSAt(ms int64) int64 {
	s.clockMu.Lock()
	defer s.clockMu.Unlock()
	s.lastTS = max(ms, s.lastTS+1)
	return s.lastTS
}

// observeTS is the receive rule of the server's hybrid clock: every stored op,
// a device's included, moves lastTS up to its timestamp, so a later server
// write (REST, rules, email, ...) is stamped after it and wins last-writer-wins
// even when the device's clock ran ahead of the server's (up to MaxFutureSkewMs).
func (s *Service) observeTS(ts int64) {
	s.clockMu.Lock()
	defer s.clockMu.Unlock()
	s.lastTS = max(s.lastTS, ts)
}

// seedClock applies the receive rule across a restart: the newest stored ops
// can still be ahead of the wall clock (by up to MaxFutureSkewMs). Only ops
// received in the last few minutes can be, so the most recent ones by seq are
// enough, read through the primary key. A database without the ops table (not
// migrated yet) leaves the clock at zero.
func (s *Service) seedClock() {
	if s.db == nil {
		return
	}
	var ts sql.NullInt64
	err := s.db.QueryRowContext(context.Background(),
		`SELECT MAX(ts) FROM (SELECT ts FROM ops ORDER BY seq DESC LIMIT 10000)`).Scan(&ts)
	if err == nil && ts.Valid {
		s.observeTS(ts.Int64)
	}
}
