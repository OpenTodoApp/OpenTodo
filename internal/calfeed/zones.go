// Package calfeed reads other people's calendars into read-only events and
// writes the user's tasks as a calendar (OpenSpec change calendar-feeds).
package calfeed

import (
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/zoned"
)

// Resolve finds the time zone a TZID names: an IANA name, a vendor path that
// ends in one (/mozilla.org/20050126_1/Europe/Berlin), or a Windows name
// (W. Europe Standard Time) through the CLDR table in windows_zones.go. ok is
// false when nothing matches; the caller then reads the times as floating.
func Resolve(tzid string) (*time.Location, bool) {
	tzid = strings.Trim(strings.TrimSpace(tzid), "\"")
	if tzid == "" {
		return nil, false
	}
	if strings.EqualFold(tzid, "UTC") || strings.EqualFold(tzid, "GMT") || tzid == "Z" {
		return time.UTC, true
	}
	if loc, err := zoned.Load(strings.Trim(tzid, "/")); err == nil {
		return loc, true
	}
	parts := strings.Split(strings.Trim(tzid, "/"), "/")
	for i := 1; i < len(parts); i++ {
		if loc, err := zoned.Load(strings.Join(parts[i:], "/")); err == nil {
			return loc, true
		}
	}
	if iana, ok := windowsZones[tzid]; ok {
		if loc, err := zoned.Load(iana); err == nil {
			return loc, true
		}
	}
	return nil, false
}
