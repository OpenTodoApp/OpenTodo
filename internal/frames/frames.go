// Package frames derives the occurrences of calendar frames (OpenSpec change
// calendar-frames, design D2): recurring background windows such as "Deep work"
// on weekdays from 09:00 to 11:00. Occurrences are never stored; the web client
// computes the same ones in web/src/lib/frames.ts, pinned by the shared vectors
// web/src/lib/frames.vectors.json.
package frames

import (
	"sort"
	"strings"
	"time"
)

// MaxLive is the number of live frames one user may keep (design D5).
const MaxLive = 50

// MaxTitle is the longest frame title in characters (design D1).
const MaxTitle = 200

// Frame is the part of a frame row its occurrences depend on.
type Frame struct {
	ID        string   `json:"id"`
	Weekdays  string   `json:"weekdays"`
	Start     string   `json:"start"`
	End       string   `json:"end"`
	FromDate  *string  `json:"from_date"`
	UntilDate *string  `json:"until_date"`
	Position  float64  `json:"position"`
	DeletedAt *float64 `json:"deleted_at"`
}

// Occurrence is one frame on one date, in floating wall times.
type Occurrence struct {
	ID    string `json:"id"`
	Date  string `json:"date"`
	Start string `json:"start"`
	End   string `json:"end"`
}

// Clock returns the minutes after midnight of a wall time "HH:MM" from 00:00
// to 23:59, or -1 when s is not one.
func Clock(s string) int {
	if len(s) != 5 || s[2] != ':' {
		return -1
	}
	for i, c := range s {
		if i != 2 && (c < '0' || c > '9') {
			return -1
		}
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	if h > 23 || m > 59 {
		return -1
	}
	return h*60 + m
}

// Weekdays reads a weekday list into a set of ISO weekdays (1 = Monday …
// 7 = Sunday); entries other than a single digit 1-7 are ignored.
func Weekdays(s string) [8]bool {
	var out [8]bool
	if s == "" {
		return out
	}
	for _, p := range strings.Split(s, ",") {
		if len(p) == 1 && p[0] >= '1' && p[0] <= '7' {
			out[p[0]-'0'] = true
		}
	}
	return out
}

// TimesValid reports whether a frame's times are two wall times with the end
// after the start. A frame without valid times is kept and not drawn ("Times
// need fixing", design D1).
func TimesValid(start, end string) bool {
	s, e := Clock(start), Clock(end)
	return s >= 0 && e >= 0 && e > s
}

// Occurrences lists the occurrences of frames on the dates from..to
// (inclusive, "YYYY-MM-DD"), ordered by date, then start, then position, then
// id. Deleted frames and frames without valid times have none.
func Occurrences(list []Frame, from, to string) []Occurrence {
	first, err1 := time.Parse(time.DateOnly, from)
	last, err2 := time.Parse(time.DateOnly, to)
	if err1 != nil || err2 != nil {
		return nil
	}
	type live struct {
		f     Frame
		start int
		days  [8]bool
	}
	var lives []live
	for _, f := range list {
		if f.DeletedAt != nil || !TimesValid(f.Start, f.End) {
			continue
		}
		lives = append(lives, live{f, Clock(f.Start), Weekdays(f.Weekdays)})
	}
	sort.SliceStable(lives, func(i, j int) bool {
		a, b := lives[i], lives[j]
		if a.start != b.start {
			return a.start < b.start
		}
		if a.f.Position != b.f.Position {
			return a.f.Position < b.f.Position
		}
		return a.f.ID < b.f.ID
	})
	out := []Occurrence{}
	for d := first; !d.After(last); d = d.AddDate(0, 0, 1) {
		iso := d.Format(time.DateOnly)
		wd := int(d.Weekday())
		if wd == 0 {
			wd = 7
		}
		for _, l := range lives {
			if !l.days[wd] || (l.f.FromDate != nil && iso < *l.f.FromDate) || (l.f.UntilDate != nil && iso > *l.f.UntilDate) {
				continue
			}
			out = append(out, Occurrence{ID: l.f.ID, Date: iso, Start: l.f.Start, End: l.f.End})
		}
	}
	return out
}
