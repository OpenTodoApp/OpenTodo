// Package calsync is calendar sync (OpenSpec change calendar-two-way): the
// server as a CalDAV client of a user's own calendar account (any CalDAV server
// with an app password, or Google Calendar through OAuth). It writes the user's
// dated tasks into one calendar as events and reads back what the user changed
// there, applying it to the tasks through the op log with device
// calsync:<connection-id>. Other calendars of the account are read into the
// calendar subscription event store, so Day and Week show them.
package calsync

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Providers.
const (
	ProviderCalDAV = "caldav"
	ProviderGoogle = "google"
)

// GoogleCalDAV is where Google's CalDAV API starts (design D13).
const GoogleCalDAV = "https://apidata.googleusercontent.com/caldav/v2/"

// Limits and pacing (design D2, D7, D9, D11).
const (
	MaxConnections   = 3
	SyncInterval     = 5 * time.Minute
	BackoffStart     = 5 * time.Minute
	BackoffMax       = 6 * time.Hour
	Debounce         = 20 * time.Second
	TickInterval     = 15 * time.Second
	InFlight         = 2
	MaxWritesPerRun  = 200
	MultigetBatch    = 50
	RequestTimeout   = 20 * time.Second
	CycleTimeout     = 2 * time.Minute
	MaxBody          = 4 << 20
	MaxRedirects     = 3
	MaxCalendars     = 50
	MaxReadCalendars = 10
	sweepEvery       = time.Hour
)

// Reasons stored on a connection (design D11).
const (
	ReasonUnauthorized    = "unauthorized"
	ReasonPrivateTarget   = "private_target"
	ReasonCalendarMissing = "calendar_missing"
	ReasonTimeout         = "timeout"
	ReasonConnection      = "connection_failed"
	ReasonRedirect        = "redirect_refused"
	ReasonTooLarge        = "too_large"
	ReasonInvalid         = "invalid_response"
	ReasonRateLimited     = "rate_limited"
	ReasonNoCalendars     = "no_calendars"
	ReasonSecretMissing   = "secret_missing"
	ReasonGoogleMissing   = "google_not_configured"
)

// stops are the reasons that stop a connection until the user acts.
var stops = map[string]bool{ReasonUnauthorized: true, ReasonPrivateTarget: true, ReasonCalendarMissing: true,
	ReasonSecretMissing: true, ReasonGoogleMissing: true}

// Stops reports whether a reason stops the connection.
func Stops(reason string) bool { return stops[reason] }

var (
	// ErrNotFound: no connection with this id belongs to the user.
	ErrNotFound = errors.New("calendar connection not found")
	// ErrLimit: the user already has MaxConnections connections.
	ErrLimit = errors.New("limit_reached")
)

// Error is a failed request or cycle with the reason stored on the connection.
type Error struct {
	Reason string
	// Until is set for a server's rate limit (Retry-After).
	Until time.Time
}

func (e *Error) Error() string { return "calendar sync: " + e.Reason }

// reasonOf returns the stored reason of an error ("internal_error" for one
// that is not a calendar's answer).
func reasonOf(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Reason
	}
	var rej *opsync.RejectedError
	if errors.As(err, &rej) {
		return rej.Reason
	}
	return "internal_error"
}

// DevicePrefix marks the ops a connection's cycles write: calsync:<connection-id>.
const DevicePrefix = opsync.CalsyncDevicePrefix

// Device is the op device of one connection.
func Device(connID string) string { return DevicePrefix + connID }

// Calendar is one calendar of the account, as discovery found it.
type Calendar struct {
	URL      string `json:"url"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	TimeZone string `json:"time_zone,omitempty"`
	ReadOnly bool   `json:"read_only"`
}

// RunCounts is what one cycle did.
type RunCounts struct {
	// Moved counts tasks whose date, time or length followed their event;
	// Renamed tasks whose title did; Unscheduled tasks whose event was deleted.
	Moved       int `json:"moved"`
	Renamed     int `json:"renamed"`
	Unscheduled int `json:"unscheduled"`
	// Written and Removed count events created or changed, and deleted.
	Written int `json:"written"`
	Removed int `json:"removed"`
	// Conflicts counts changes on both sides that the task won.
	Conflicts int  `json:"conflicts"`
	Refused   int  `json:"refused"`
	Partial   bool `json:"partial"`
}

// Connection is one calendar account of a user (design D2). The secret (an app
// password or a Google refresh token) is never part of it.
type Connection struct {
	ID              string     `json:"id"`
	UserID          string     `json:"-"`
	Provider        string     `json:"provider"`
	Name            string     `json:"name"`
	ServerURL       string     `json:"server_url"`
	Username        string     `json:"username"`
	PrincipalURL    string     `json:"-"`
	HomeURL         string     `json:"-"`
	Calendars       []Calendar `json:"calendars"`
	TargetURL       string     `json:"target"`
	ReadURLs        []string   `json:"read"`
	IncludeDateOnly bool       `json:"include_date_only"`
	SyncToken       string     `json:"-"`
	CTag            string     `json:"-"`
	Enabled         bool       `json:"enabled"`
	NextSyncAt      int64      `json:"next_sync_at"`
	BackoffSeconds  int64      `json:"-"`
	LastSyncAt      *int64     `json:"last_sync_at"`
	LastSuccessAt   *int64     `json:"last_success_at"`
	LastError       string     `json:"last_error"`
	LastErrorAt     *int64     `json:"last_error_at"`
	StoppedReason   string     `json:"stopped_reason"`
	LastRun         *RunCounts `json:"last_run"`
	CreatedAt       int64      `json:"created_at"`
	UpdatedAt       int64      `json:"updated_at"`
}

// States served to the client (design D2).
const (
	StateOff       = "off"
	StateChoose    = "choose_calendar"
	StatePending   = "pending"
	StateOK        = "ok"
	StateFailed    = "failed"
	StateReconnect = "reconnect"
	StateStopped   = "stopped"
)

// State is the connection's state in one word.
func (c *Connection) State() string {
	switch {
	case !c.Enabled:
		return StateOff
	case c.StoppedReason == ReasonUnauthorized || c.StoppedReason == ReasonSecretMissing:
		return StateReconnect
	case c.StoppedReason != "":
		return StateStopped
	case c.TargetURL == "":
		return StateChoose
	case c.LastError != "":
		return StateFailed
	case c.LastSuccessAt == nil:
		return StatePending
	}
	return StateOK
}

// Calendar returns the discovered calendar with url, or nil.
func (c *Connection) Calendar(url string) *Calendar {
	for i := range c.Calendars {
		if c.Calendars[i].URL == url {
			return &c.Calendars[i]
		}
	}
	return nil
}

// hash16 is the first 16 hex characters of SHA-256 (titles in snapshots).
func hash16(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:8])
}
