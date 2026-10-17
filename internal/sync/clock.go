package sync

import (
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
// service issued before.
func (s *Service) ServerTSAt(ms int64) int64 {
	s.clockMu.Lock()
	defer s.clockMu.Unlock()
	s.lastTS = max(ms, s.lastTS+1)
	return s.lastTS
}
