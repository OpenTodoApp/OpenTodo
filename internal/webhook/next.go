package webhook

import (
	"context"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/deliveryq"
)

// NextDue is the earliest queued delivery of an enabled webhook; ok is false
// when nothing is queued (a host's "next due" index, OpenSpec
// `multi-tenant-host`).
func (s *Service) NextDue(ctx context.Context) (time.Time, bool, error) {
	return deliveryq.NextDue(ctx, s.db, table)
}

// NextPrune is when the oldest delivery leaves the log (LogRetention).
func (s *Service) NextPrune(ctx context.Context) (time.Time, bool, error) {
	return deliveryq.NextPrune(ctx, s.db, table)
}
