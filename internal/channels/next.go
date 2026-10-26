package channels

import (
	"context"
	"time"

	"github.com/pixari/opentodo/internal/deliveryq"
)

// NextDue is the earliest queued message of an enabled channel while the owner
// switch is on; ok is false when nothing is queued (a host's "next due" index,
// OpenSpec multi-tenant-host).
func (s *Service) NextDue(ctx context.Context) (time.Time, bool, error) {
	if !s.enabled(ctx) {
		return time.Time{}, false, nil
	}
	return deliveryq.NextDue(ctx, s.db, table)
}

// NextPrune is when the oldest message leaves the log (LogRetention).
func (s *Service) NextPrune(ctx context.Context) (time.Time, bool, error) {
	return deliveryq.NextPrune(ctx, s.db, table)
}
