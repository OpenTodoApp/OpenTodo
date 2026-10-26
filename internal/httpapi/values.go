package httpapi

import (
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Op values and due values under the short names this package's handlers use.

// due is a task's due value (zoned.Due).
type due = zoned.Due

var (
	idOf           = opsync.StringOf
	numberOf       = opsync.NumberOf
	isNullish      = opsync.IsNull
	mustJSON       = opsync.JSONOf
	decodeDue      = zoned.DecodeDue
	dueInstantMs   = zoned.DueInstantMs
	relativeFireAt = zoned.RelativeFireAt
	deadlineFireAt = zoned.DeadlineFireAt
	localToday     = zoned.LocalToday
)
