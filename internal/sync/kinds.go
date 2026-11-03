package sync

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/location"
	"github.com/OpenTodoApp/opentodo/internal/origin"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	"github.com/OpenTodoApp/opentodo/internal/sector"
	"github.com/OpenTodoApp/opentodo/internal/themes"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// kind is a field's value kind: what Validate accepts for it. Each kind has
// its check in kindChecks below.
type kind int

const (
	kString kind = iota
	kNullableString
	kNumber
	kNullableNumber
	kBool
	kPriority
	kDue
	kStringList
	// kPositiveInt is null or a positive integer no larger than MaxPositiveInt.
	kPositiveInt
	// kRecurrence is null or a rule accepted by internal/recurrence (at most
	// recurrence.MaxLen characters). Clients store the canonical form; any
	// parseable spelling is accepted so the op log is never rewritten.
	kRecurrence
	// kID is a non-empty id string of at most MaxIDLen characters (reminder.task_id).
	kID
	// kReminderKind is "relative", "absolute" (OpenSpec change reminders),
	// "deadline" (OpenSpec change deadlines) or the location kinds "arrive" and
	// "leave" (OpenSpec change location-reminders, design D1).
	kReminderKind
	// kOffsetMinutes is null or an integer within ±MaxReminderOffset minutes.
	kOffsetMinutes
	// kInstant is null or a positive Unix millisecond timestamp (reminder.fire_at).
	kInstant
	// kNullableText is null or any string, bounded by MaxValueBytes like every
	// value (task.ical_extra, OpenSpec change caldav).
	kNullableText
	// kDoc is an opaque, mergeable document (OpenSpec change
	// collaborative-rich-text, docs/sync.md "Mergeable documents"): "" (no
	// document) or an envelope "<format>:v<n>:<base64>" of at most MaxDocBytes
	// characters. The server checks only the envelope shape and that the payload
	// is base64 (standard or URL alphabet, padding optional); it never decodes
	// the document, so a client format (or an end-to-end encrypted value) can
	// change without a server change.
	kDoc
	// kDate is null or a bare calendar date "YYYY-MM-DD" with no time or zone
	// (task.deadline, OpenSpec change deadlines).
	kDate
	// kStart is null, the word "someday" or a calendar date "YYYY-MM-DD"
	// (task.start, OpenSpec change someday-and-evening).
	kStart
	// kIDList is an array of at most MaxBlockedBy distinct, non-empty ids of at
	// most MaxIDLen characters (task.blocked_by, OpenSpec change task-dependencies).
	kIDList
	// kFieldValue is a custom field value (OpenSpec change custom-fields, design
	// D2): null, a string (bounded by MaxValueBytes like every value), a finite
	// JSON number or a boolean. Objects and arrays are refused. The server never
	// checks a value against its definition: clients, REST and the assistant
	// tools do, so a value and its definition may arrive in any order.
	kFieldValue
	// kOrigin is a task's origin (OpenSpec change task-origin, design D1):
	// null, an encrypted account's ciphertext string, or the object
	// {kind, provider?, id?, url?, title?} validated by internal/origin
	// (closed kind list, http(s) URL only, bounded lengths, no unknown members).
	kOrigin
	// kRule is a saved list view's on-drop rule (OpenSpec change rule-boards,
	// design D2): null or an object of at most one choice per kind, checked in
	// rule.go (closed key set, enumerations, bounded label lists). Sync checks
	// the shape only; REST resolves the ids.
	kRule
	// kLocation is a task's location (OpenSpec change task-locations, design
	// D1): null, an encrypted account's ciphertext string, or the object
	// {name?, address?, lat?, lon?, place_id?} validated by internal/location.
	kLocation
	// kGeo is a place's coordinate pair (task-locations D1): null, a ciphertext
	// string, or {lat, lon} validated by internal/location.
	kGeo
	// kRuleTrigger, kRuleCondition and kRuleActions are an automation rule's
	// whole values (OpenSpec change automation-rules, design D1), checked by
	// internal/ruleval (closed key sets, enumerations, bounds). Sync checks the
	// shape only; REST resolves the ids. A condition may be null.
	kRuleTrigger
	kRuleCondition
	kRuleActions
	// kRoutineSteps is null or a routine's steps (OpenSpec change
	// routines-engine, design D3): one whole value, an ordered list of at most
	// 20 steps checked by internal/ruleval (known kinds, unique ids, inputs of
	// the declared names and literal shapes, references only to visible
	// outputs, at most 3 block levels, 32 KB encoded). Sync checks the shape
	// only; REST also type-checks and resolves the ids.
	kRoutineSteps
	// kReactions is one account's reactions on a comment (OpenSpec change
	// editor-everywhere, design D8): a list of distinct names from ReactionNames.
	kReactions
	// kDayPart is null, "morning" or "afternoon" (task.day_part, OpenSpec
	// change day-parts, design D1). Evening stays the task's evening flag; a
	// later part is a new value behind a schema note, read by older clients as
	// no part.
	kDayPart
	// kClock is a wall time "HH:MM" from "00:00" to "23:59" with no date or
	// zone (frame.start and frame.end, OpenSpec change calendar-frames, design D1).
	kClock
	// kWeekdays is "" or a comma list of distinct ISO weekdays "1" (Monday) to
	// "7" (Sunday), e.g. "1,2,3,4,5" (frame.weekdays, calendar-frames D1).
	kWeekdays
	// kEnergy is "" (none), "deep", "medium" or "low" (task.energy, OpenSpec
	// change task-energy, design D1). A later value is a spec change; older
	// clients read it as none and keep it.
	kEnergy
	// kOrderList is an array of at most MaxManualOrder distinct, non-empty ids of
	// at most MaxIDLen characters (label.manual_order and view.manual_order,
	// OpenSpec change view-manual-order, design D2). Unknown ids are accepted:
	// the order is a personal preference and a task may arrive later.
	kOrderList
	// kSplit is null or the series a piece was split from and the date it starts
	// (task.split_from, OpenSpec change series-split, design D2): one whole value
	// {series: id, date: "YYYY-MM-DD"} with no other members.
	kSplit
	// kFocusSession is an integer from 0 to MaxFocusSession: a Focus work
	// session's number in its Pomodoro cycle, 0 for the other modes and for
	// entries that are no Focus session (time_entry.focus_session, OpenSpec
	// change focus-session-readable, design D2).
	kFocusSession
	// kThemeDoc is null or one whole custom theme document (OpenSpec change
	// theme-editor, design D1): a JSON object of at most themes.MaxBytes bytes
	// that passes internal/themes.Validate (format 1: seeds, explicit tokens,
	// shape and type; colours only as #rrggbb or in-gamut oklch, never CSS).
	kThemeDoc
	// kSector is "" (none) or a time sector: an ISO week "YYYY-Www", a month
	// "YYYY-MM" or a quarter "YYYY-Qn" with a year from 2000 to 2999, checked by
	// internal/sector (task.sector, OpenSpec change time-sectors, design D1).
	kSector
	// kObjectiveTitle is an objective's title (OpenSpec change plan-objectives,
	// design D1): 1 to MaxObjectiveTitle characters after trimming, on one line,
	// or an encrypted account's ciphertext string in its place.
	kObjectiveTitle
	// kObjectivePeriod is an objective's period: a quarter "YYYY-Qn" or an ISO
	// week "YYYY-Www" checked by internal/sector. Months and "" are refused
	// (plan-objectives D1).
	kObjectivePeriod
	// kRadius is null or a whole number of metres from MinReminderRadius to
	// MaxReminderRadius (reminder.radius_m, OpenSpec change location-reminders,
	// design D1).
	kRadius
)

// MaxObjectiveTitle is the longest objective title in characters (plan-objectives D2).
const MaxObjectiveTitle = 140

// kindChecks validates an op value per field kind (see the kind constants
// above). checkKind looks the check up; kinds_test.go keeps the table whole.
var kindChecks = map[kind]func(raw json.RawMessage) error{
	kString:          checkString,
	kNullableString:  orNull(checkIDString),
	kNumber:          checkNumber,
	kNullableNumber:  orNull(checkNullableNumber),
	kBool:            checkBool,
	kPriority:        checkPriority,
	kStart:           orNull(checkStart),
	kDate:            orNull(checkDate),
	kDue:             orNull(checkDue),
	kStringList:      checkStringList,
	kIDList:          checkIDList,
	kPositiveInt:     orNull(checkPositiveInt),
	kRecurrence:      orNull(checkRecurrence),
	kID:              checkID,
	kReminderKind:    checkReminderKind,
	kOffsetMinutes:   orNull(checkOffsetMinutes),
	kNullableText:    orNull(checkNullableText),
	kDoc:             checkDoc,
	kFieldValue:      checkFieldValue,
	kInstant:         orNull(checkInstant),
	kOrigin:          origin.CheckValue,
	kRule:            orNull(checkRule),
	kLocation:        location.CheckValue,
	kGeo:             location.CheckGeo,
	kRuleTrigger:     ruleval.CheckTrigger,
	kRuleCondition:   orNull(ruleval.CheckCondition),
	kRuleActions:     orNull(ruleval.CheckActions),
	kRoutineSteps:    orNull(ruleval.CheckSteps),
	kReactions:       checkReactions,
	kDayPart:         orNull(checkDayPart),
	kClock:           checkClock,
	kWeekdays:        checkWeekdays,
	kEnergy:          checkEnergy,
	kOrderList:       checkOrderList,
	kSplit:           orNull(checkSplit),
	kFocusSession:    checkFocusSession,
	kThemeDoc:        orNull(checkThemeDoc),
	kSector:          checkSector,
	kObjectiveTitle:  checkObjectiveTitle,
	kObjectivePeriod: checkObjectivePeriod,
	kRadius:          orNull(checkRadius),
}

// checkRadius accepts a whole number of metres from MinReminderRadius to
// MaxReminderRadius (location-reminders D1).
func checkRadius(raw json.RawMessage) error {
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil || n < MinReminderRadius || n > MaxReminderRadius {
		return fmt.Errorf("must be null or a whole number of metres from %d to %d", MinReminderRadius, MaxReminderRadius)
	}
	return nil
}

// checkObjectiveTitle accepts a one-line title of 1 to MaxObjectiveTitle
// characters after trimming, or ciphertext (plan-objectives D1).
func checkObjectiveTitle(raw json.RawMessage) error {
	var v string
	if err := json.Unmarshal(raw, &v); err != nil || isNullValue(raw) {
		return errors.New("must be a string")
	}
	if e2ee.IsCiphertext(v) {
		return nil
	}
	v = strings.TrimSpace(v)
	if v == "" || utf8.RuneCountInString(v) > MaxObjectiveTitle || strings.ContainsAny(v, "\r\n") {
		return fmt.Errorf("must be one line of 1 to %d characters", MaxObjectiveTitle)
	}
	return nil
}

// checkObjectivePeriod accepts a quarter or an ISO week, never a month or ""
// (plan-objectives D1).
func checkObjectivePeriod(raw json.RawMessage) error {
	var v string
	_ = json.Unmarshal(raw, &v)
	if p, ok := sector.Parse(v); !ok || isNullValue(raw) || p.Kind == sector.Month {
		return errors.New(`must be a quarter "YYYY-Qn" or an ISO week "YYYY-Www"`)
	}
	return nil
}

// checkSector accepts "" or a valid time sector (time-sectors D1); null is refused.
func checkSector(raw json.RawMessage) error {
	var v string
	if err := json.Unmarshal(raw, &v); err != nil || isNullValue(raw) || sector.Check(v) != nil {
		return errors.New(`must be "" or a time sector "YYYY-Www", "YYYY-MM" or "YYYY-Qn"`)
	}
	return nil
}

// checkThemeDoc accepts a JSON object that is a valid theme document of at most
// themes.MaxBytes bytes (theme-editor D1). A document of a newer format is
// refused like any other invalid one: the server and its web app ship together.
func checkThemeDoc(raw json.RawMessage) error {
	if len(raw) == 0 || raw[0] != '{' {
		return errors.New("must be a theme document object")
	}
	if err := themes.Validate(raw); err != nil {
		return fmt.Errorf("is not a valid theme document (%s)", themes.Code(err))
	}
	return nil
}

func isNullValue(raw json.RawMessage) bool { return string(raw) == "null" }

// orNull accepts JSON null and otherwise runs check.
func orNull(check func(json.RawMessage) error) func(json.RawMessage) error {
	return func(raw json.RawMessage) error {
		if isNullValue(raw) {
			return nil
		}
		return check(raw)
	}
}

func checkString(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || !utf8.ValidString(s) {
		return errors.New("must be a string")
	}
	return nil
}

func checkIDString(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || len(s) > MaxIDLen {
		return errors.New("must be null or an id string")
	}
	return nil
}

func checkNumber(raw json.RawMessage) error {
	var f float64
	if err := json.Unmarshal(raw, &f); err != nil {
		return errors.New("must be a number")
	}
	return nil
}

func checkNullableNumber(raw json.RawMessage) error {
	var f float64
	if err := json.Unmarshal(raw, &f); err != nil {
		return errors.New("must be null or a number")
	}
	return nil
}

// checkBool refuses null explicitly: json.Unmarshal leaves a bool untouched on
// null (OpenSpec change habits: a non-boolean flag is invalid).
func checkBool(raw json.RawMessage) error {
	var b bool
	if err := json.Unmarshal(raw, &b); err != nil || isNullValue(raw) {
		return errors.New("must be a boolean")
	}
	return nil
}

func checkPriority(raw json.RawMessage) error {
	var p int
	if err := json.Unmarshal(raw, &p); err != nil || p < 1 || p > 4 {
		return errors.New("must be an integer from 1 (highest) to 4 (lowest)")
	}
	return nil
}

func checkStart(raw json.RawMessage) error {
	var d string
	if err := json.Unmarshal(raw, &d); err != nil || (d != "someday" && !isDate(d)) {
		return errors.New(`must be null, "someday" or a date "YYYY-MM-DD"`)
	}
	if d != "someday" {
		if _, err := time.Parse("2006-01-02", d); err != nil {
			return errors.New(`must be null, "someday" or a date "YYYY-MM-DD" that exists`)
		}
	}
	return nil
}

// DayParts are the stored values of task.day_part (OpenSpec change day-parts).
var DayParts = []string{"morning", "afternoon"}

func checkDayPart(raw json.RawMessage) error {
	var d string
	if err := json.Unmarshal(raw, &d); err != nil || !slices.Contains(DayParts, d) {
		return errors.New(`must be null, "morning" or "afternoon"`)
	}
	return nil
}

// EnergyLevels are the stored values of task.energy besides "" for none
// (OpenSpec change task-energy, design D1).
var EnergyLevels = []string{"deep", "medium", "low"}

func checkEnergy(raw json.RawMessage) error {
	var e string
	if err := json.Unmarshal(raw, &e); err != nil || isNullValue(raw) || (e != "" && !slices.Contains(EnergyLevels, e)) {
		return errors.New(`must be "", "deep", "medium" or "low"`)
	}
	return nil
}

// checkClock accepts a wall time "HH:MM" from "00:00" to "23:59" (calendar-frames D1).
func checkClock(raw json.RawMessage) error {
	var c string
	if err := json.Unmarshal(raw, &c); err != nil || !isClock(c) || c[:2] > "23" || c[3:] > "59" {
		return errors.New(`must be a time "HH:MM" between 00:00 and 23:59`)
	}
	return nil
}

// checkFocusSession accepts an integer from 0 to MaxFocusSession
// (focus-session-readable D2).
func checkFocusSession(raw json.RawMessage) error {
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil || isNullValue(raw) || n < 0 || n > MaxFocusSession {
		return fmt.Errorf("must be an integer from 0 to %d", MaxFocusSession)
	}
	return nil
}

// checkWeekdays accepts "" or a comma list of distinct ISO weekdays 1-7 (calendar-frames D1).
func checkWeekdays(raw json.RawMessage) error {
	var w string
	if err := json.Unmarshal(raw, &w); err != nil {
		return errors.New(`must be "" or a comma list of distinct weekdays 1 to 7`)
	}
	if w == "" {
		return nil
	}
	seen := map[string]bool{}
	for _, d := range strings.Split(w, ",") {
		if len(d) != 1 || d[0] < '1' || d[0] > '7' || seen[d] {
			return errors.New(`must be "" or a comma list of distinct weekdays 1 to 7`)
		}
		seen[d] = true
	}
	return nil
}

func checkDate(raw json.RawMessage) error {
	var d string
	if err := json.Unmarshal(raw, &d); err != nil || !isDate(d) {
		return errors.New(`must be null or a date "YYYY-MM-DD"`)
	}
	if _, err := time.Parse("2006-01-02", d); err != nil {
		return errors.New(`must be null or a date "YYYY-MM-DD" that exists`)
	}
	return nil
}

func checkDue(raw json.RawMessage) error {
	var d struct {
		Date string  `json:"date"`
		Time *string `json:"time"`
		TZ   *string `json:"tz"`
	}
	if err := json.Unmarshal(raw, &d); err != nil || !isDate(d.Date) || (d.Time != nil && !isClock(*d.Time)) {
		return errors.New(`must be null or {"date":"YYYY-MM-DD","time":"HH:MM"?,"tz":"Area/City"?}`)
	}
	// The date must exist and the time be a clock reading 00:00-23:59
	// (sync-convergence): recurrence and reminders compute from them.
	if _, err := time.Parse("2006-01-02", d.Date); err != nil {
		return errors.New(`must be null or a due whose date "YYYY-MM-DD" exists`)
	}
	if d.Time != nil {
		if _, err := time.Parse("15:04", *d.Time); err != nil {
			return errors.New(`must be null or a due whose time "HH:MM" is between 00:00 and 23:59`)
		}
	}
	// A zoned due (OpenSpec change absolute-datetimes) names a known IANA
	// zone and always has a time.
	if d.TZ != nil {
		if d.Time == nil {
			return errors.New("tz requires time")
		}
		if !zoned.Valid(*d.TZ) {
			return fmt.Errorf("tz must be a known IANA time zone of at most %d characters", zoned.MaxZoneLen)
		}
	}
	return nil
}

func checkStringList(raw json.RawMessage) error {
	var l []string
	if err := json.Unmarshal(raw, &l); err != nil || l == nil {
		return errors.New("must be an array of strings")
	}
	return nil
}

func checkIDList(raw json.RawMessage) error { return checkIDs(raw, MaxBlockedBy) }

// checkOrderList accepts a manual order (view-manual-order D2): at most
// MaxManualOrder distinct ids of 1 to MaxIDLen characters.
func checkOrderList(raw json.RawMessage) error { return checkIDs(raw, MaxManualOrder) }

// checkIDs accepts an array of at most limit distinct ids of 1 to MaxIDLen characters.
func checkIDs(raw json.RawMessage, limit int) error {
	var l []string
	if err := json.Unmarshal(raw, &l); err != nil || l == nil {
		return errors.New("must be an array of task ids")
	}
	if len(l) > limit {
		return fmt.Errorf("may hold at most %d ids", limit)
	}
	seen := make(map[string]bool, len(l))
	for _, id := range l {
		if id == "" || len(id) > MaxIDLen {
			return fmt.Errorf("ids must be 1 to %d characters", MaxIDLen)
		}
		if seen[id] {
			return fmt.Errorf("lists %q twice", id)
		}
		seen[id] = true
	}
	return nil
}

// checkReactions accepts a list of distinct names from ReactionNames
// (editor-everywhere D8); an empty list removes the account's reactions.
func checkReactions(raw json.RawMessage) error {
	var l []string
	if err := json.Unmarshal(raw, &l); err != nil || l == nil {
		return errors.New("must be an array of reaction names")
	}
	seen := make(map[string]bool, len(l))
	for _, name := range l {
		if !slices.Contains(ReactionNames, name) {
			return fmt.Errorf("%q is not a reaction (one of %s)", name, strings.Join(ReactionNames, ", "))
		}
		if seen[name] {
			return fmt.Errorf("lists %q twice", name)
		}
		seen[name] = true
	}
	return nil
}

// checkPositiveInt unmarshals into an integer, which rejects fractions,
// exponents and strings.
func checkPositiveInt(raw json.RawMessage) error {
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil || n < 1 || n > MaxPositiveInt {
		return fmt.Errorf("must be null or an integer from 1 to %d", MaxPositiveInt)
	}
	return nil
}

func checkRecurrence(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return errors.New("must be null or a recurrence rule string")
	}
	if _, err := recurrence.Parse(s); err != nil {
		return err
	}
	return nil
}

func checkID(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || s == "" || len(s) > MaxIDLen {
		return errors.New("must be an id string")
	}
	return nil
}

func checkReminderKind(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || (s != "relative" && s != "absolute" && s != "deadline" && !IsLocationKind(s)) {
		return errors.New(`must be "relative", "absolute", "deadline", "arrive" or "leave"`)
	}
	return nil
}

func checkOffsetMinutes(raw json.RawMessage) error {
	var n int64
	if err := json.Unmarshal(raw, &n); err != nil || n < -MaxReminderOffset || n > MaxReminderOffset {
		return fmt.Errorf("must be null or an integer from -%d to %d", MaxReminderOffset, MaxReminderOffset)
	}
	return nil
}

func checkNullableText(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || !utf8.ValidString(s) {
		return errors.New("must be null or a string")
	}
	return nil
}

func checkDoc(raw json.RawMessage) error {
	var s string
	if err := json.Unmarshal(raw, &s); isNullValue(raw) || err != nil || !ValidDoc(s) {
		return fmt.Errorf(`must be "" or a document envelope "<format>:v<n>:<base64>" of at most %d characters`, MaxDocBytes)
	}
	return nil
}

func checkFieldValue(raw json.RawMessage) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return errors.New("must be null, a string, a number or a boolean")
	}
	switch x := v.(type) {
	case nil, bool, float64:
	case string:
		if !utf8.ValidString(x) {
			return errors.New("must be valid text")
		}
	default:
		return errors.New("must be null, a string, a number or a boolean")
	}
	return nil
}

func checkInstant(raw json.RawMessage) error {
	var f float64
	if err := json.Unmarshal(raw, &f); err != nil || f <= 0 {
		return errors.New("must be null or a positive unix millisecond timestamp")
	}
	return nil
}

// isDate and isClock check the shape of "YYYY-MM-DD" and "HH:MM" (digits and separators).
func isDate(s string) bool {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return false
	}
	for i, c := range s {
		if i == 4 || i == 7 {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func isClock(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	for i, c := range s {
		if i == 2 {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// checkKind checks an op value against its field's kind; the per-kind checks
// are in kinds.go. A kind without a check accepts any value.
func checkKind(k kind, raw json.RawMessage) error {
	check, ok := kindChecks[k]
	if !ok {
		return nil
	}
	return check(raw)
}

// idList reads a kIDList value (nil when it is not one).
func idList(raw json.RawMessage) []string {
	var l []string
	_ = json.Unmarshal(raw, &l)
	return l
}
