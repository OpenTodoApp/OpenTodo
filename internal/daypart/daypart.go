// Package daypart is a task's part of the day (OpenSpec change day-parts): the
// one reading of the two stored fields and the one pairing every writer uses.
//
// Morning and Afternoon are task.day_part; Evening stays the evening flag, so
// clients and integrations that only know This Evening keep working. A task's
// part is Evening when the flag is set, else its day_part (design D1). Setting
// a part writes both fields together (design D2), so per-field last-writer-wins
// converges on one part:
//
//	Morning   day_part "morning",   evening false
//	Afternoon day_part "afternoon", evening false
//	Evening   day_part null,        evening true
//	Any time  day_part null,        evening false
//
// The web client has the same helpers in web/src/lib/dayParts.ts.
package daypart

import (
	"encoding/json"
	"strings"
)

// The parts. None is a task without a part ("Any time").
const (
	None      = ""
	Morning   = "morning"
	Afternoon = "afternoon"
	Evening   = "evening"
)

// Stored reports whether v is a value task.day_part may hold.
func Stored(v string) bool { return v == Morning || v == Afternoon }

// Parse reads a part a person or a client named: morning, afternoon, evening,
// or none / "" for Any time (case-insensitive). ok is false for anything else.
func Parse(s string) (part string, ok bool) {
	switch p := strings.ToLower(strings.TrimSpace(s)); p {
	case Morning, Afternoon, Evening:
		return p, true
	case "", "none", "any", "anytime":
		return None, true
	}
	return "", false
}

// Of is a task's part from its stored fields: Evening when the flag is set,
// else day_part when it is a known value, else None (an unknown value, from a
// newer client, reads as no part).
func Of(dayPart string, evening bool) string {
	if evening {
		return Evening
	}
	if Stored(dayPart) {
		return dayPart
	}
	return None
}

// OfRow is Of over a materialized row's raw fields.
func OfRow(row map[string]json.RawMessage) string {
	var dp string
	if raw, ok := row["day_part"]; ok && string(raw) != "null" {
		_ = json.Unmarshal(raw, &dp)
	}
	return Of(dp, string(row["evening"]) == "true")
}

// Fields is the pair of field values that sets part (one of the constants):
// day_part as raw JSON (null or a string) and the evening flag.
func Fields(part string) map[string]json.RawMessage {
	dp := json.RawMessage("null")
	if Stored(part) {
		dp = json.RawMessage(`"` + part + `"`)
	}
	ev := json.RawMessage("false")
	if part == Evening {
		ev = json.RawMessage("true")
	}
	return map[string]json.RawMessage{"day_part": dp, "evening": ev}
}
