package sync

import (
	"encoding/json"
	"strings"
	"testing"
)

// Every kind has a check: a kind missing from kindChecks would accept any value.
func TestKindChecksCoverEveryKind(t *testing.T) {
	for k := kString; k <= kGeo; k++ {
		if _, ok := kindChecks[k]; !ok {
			t.Errorf("kind %d has no entry in kindChecks", k)
		}
	}
}

// TestCheckKindTable pins what each per-kind check accepts and the message it
// refuses with (server-code-structure: checkKind was split into per-kind checks).
func TestCheckKindTable(t *testing.T) {
	cases := []struct {
		name string
		k    kind
		raw  string
		want string // "" accepts; otherwise a substring of the error
	}{
		{"string", kString, `"x"`, ""},
		{"string number", kString, `1`, "must be a string"},
		{"string null", kString, `null`, ""}, // json.Unmarshal leaves "" on null
		{"nullable string null", kNullableString, `null`, ""},
		{"nullable string id", kNullableString, `"t1"`, ""},
		{"nullable string too long", kNullableString, `"` + strings.Repeat("a", MaxIDLen+1) + `"`, "must be null or an id string"},
		{"number", kNumber, `1.5`, ""},
		{"number string", kNumber, `"1"`, "must be a number"},
		{"nullable number null", kNullableNumber, `null`, ""},
		{"nullable number string", kNullableNumber, `"1"`, "must be null or a number"},
		{"bool", kBool, `true`, ""},
		{"bool null", kBool, `null`, "must be a boolean"},
		{"priority", kPriority, `4`, ""},
		{"priority zero", kPriority, `0`, "from 1 (highest) to 4 (lowest)"},
		{"start someday", kStart, `"someday"`, ""},
		{"start date", kStart, `"2026-02-28"`, ""},
		{"start null", kStart, `null`, ""},
		{"start missing date", kStart, `"2026-02-30"`, "that exists"},
		{"start word", kStart, `"later"`, `must be null, "someday" or a date`},
		{"date", kDate, `"2026-01-01"`, ""},
		{"date null", kDate, `null`, ""},
		{"date missing", kDate, `"2026-13-01"`, "that exists"},
		{"date shape", kDate, `"1/1/2026"`, `must be null or a date "YYYY-MM-DD"`},
		{"due", kDue, `{"date":"2026-01-01"}`, ""},
		{"due time", kDue, `{"date":"2026-01-01","time":"23:59"}`, ""},
		{"due null", kDue, `null`, ""},
		{"due bad date", kDue, `{"date":"2026-02-30"}`, "exists"},
		{"due bad time", kDue, `{"date":"2026-01-01","time":"24:00"}`, "between 00:00 and 23:59"},
		{"due tz without time", kDue, `{"date":"2026-01-01","tz":"Europe/Rome"}`, "tz requires time"},
		{"due tz unknown", kDue, `{"date":"2026-01-01","time":"10:00","tz":"Mars/Base"}`, "known IANA time zone"},
		{"due tz", kDue, `{"date":"2026-01-01","time":"10:00","tz":"Europe/Rome"}`, ""},
		{"string list", kStringList, `["a"]`, ""},
		{"string list null", kStringList, `null`, "must be an array of strings"},
		{"id list", kIDList, `["a","b"]`, ""},
		{"id list twice", kIDList, `["a","a"]`, "twice"},
		{"id list empty id", kIDList, `[""]`, "ids must be 1 to"},
		{"id list null", kIDList, `null`, "must be an array of task ids"},
		{"positive int", kPositiveInt, `3`, ""},
		{"positive int null", kPositiveInt, `null`, ""},
		{"positive int fraction", kPositiveInt, `1.5`, "must be null or an integer from 1"},
		{"recurrence null", kRecurrence, `null`, ""},
		{"recurrence number", kRecurrence, `1`, "must be null or a recurrence rule string"},
		{"id", kID, `"t1"`, ""},
		{"id empty", kID, `""`, "must be an id string"},
		{"reminder kind", kReminderKind, `"deadline"`, ""},
		{"reminder kind other", kReminderKind, `"soon"`, `must be "relative", "absolute" or "deadline"`},
		{"offset", kOffsetMinutes, `-30`, ""},
		{"offset null", kOffsetMinutes, `null`, ""},
		{"offset too far", kOffsetMinutes, `99999999`, "must be null or an integer from -"},
		{"instant", kInstant, `1700000000000`, ""},
		{"instant null", kInstant, `null`, ""},
		{"instant zero", kInstant, `0`, "positive unix millisecond"},
		{"location", kLocation, `{"name":"Gym","lat":45.46,"lon":9.19}`, ""},
		{"location null", kLocation, `null`, ""},
		{"location ciphertext", kLocation, `"enc:v1:AAAA"`, ""},
		{"location half coordinate", kLocation, `{"lat":45.46}`, "both"},
		{"location empty", kLocation, `{}`, "needs a name"},
		{"geo", kGeo, `{"lat":45.46,"lon":9.19}`, ""},
		{"geo out of range", kGeo, `{"lat":91,"lon":9}`, "from -90 to 90"},
		{"nullable text", kNullableText, `"x"`, ""},
		{"nullable text null", kNullableText, `null`, ""},
		{"nullable text number", kNullableText, `1`, "must be null or a string"},
		{"doc empty", kDoc, `""`, ""},
		{"doc null", kDoc, `null`, "document envelope"},
		{"doc garbage", kDoc, `"not a doc"`, "document envelope"},
		{"field value null", kFieldValue, `null`, ""},
		{"field value number", kFieldValue, `2`, ""},
		{"field value text", kFieldValue, `"x"`, ""},
		{"field value object", kFieldValue, `{}`, "must be null, a string, a number or a boolean"},
		// Task origin (OpenSpec change task-origin): the "Origin validation" and
		// "Origin lengths and required members" scenarios.
		{"origin null", kOrigin, `null`, ""},
		{"origin ciphertext", kOrigin, `"enc:v1:QUJDREVGR0hJSktM"`, ""},
		{"origin plain string", kOrigin, `"https://a.example"`, "must be null, an object or a ciphertext string"},
		{"origin page", kOrigin, `{"kind":"url","url":"https://example.org/post","title":"Interesting article"}`, ""},
		{"origin issue", kOrigin, `{"kind":"issue","provider":"github","id":"o/r#7","url":"https://github.com/o/r/issues/7"}`, ""},
		{"origin email", kOrigin, `{"kind":"email","id":"<a1@mail.example>"}`, ""},
		{"origin provider shape", kOrigin, `{"kind":"issue","provider":"My Tracker","id":"1"}`, "provider must be"},
		{"origin unsafe url", kOrigin, `{"kind":"url","url":"javascript:alert(1)"}`, "http or https"},
		{"origin unknown kind", kOrigin, `{"kind":"ticket","id":"1"}`, "kind must be one of"},
		{"origin unknown member", kOrigin, `{"kind":"url","url":"https://a.example","favicon":"x"}`, "only kind, provider, id, url and title"},
		{"origin url kind without url", kOrigin, `{"kind":"url","title":"A page"}`, "needs a url"},
		{"origin import without id", kOrigin, `{"kind":"import","provider":"todoist"}`, "needs an id"},
		{"origin long title", kOrigin, `{"kind":"email","id":"1","title":"` + strings.Repeat("t", 600) + `"}`, "title must be at most 500"},
		{"origin long id", kOrigin, `{"kind":"email","id":"` + strings.Repeat("i", 513) + `"}`, "id must be at most 512"},
		{"origin long url", kOrigin, `{"kind":"url","url":"https://a.example/` + strings.Repeat("u", 2048) + `"}`, "at most 2048"},
		// On-drop rule (OpenSpec change rule-boards, design D2).
		{"rule null", kRule, `null`, ""},
		{"rule empty", kRule, `{}`, ""},
		{"rule priority due", kRule, `{"priority":1,"due":"today"}`, ""},
		{"rule labels", kRule, `{"add_labels":["l1"],"remove_labels":["l2"]}`, ""},
		{"rule start someday", kRule, `{"start":"someday"}`, ""},
		{"rule start clear", kRule, `{"start":"clear","due":"clear"}`, ""},
		{"rule next week", kRule, `{"due":"next-week"}`, ""},
		{"rule section", kRule, `{"section":{"project_id":"p1","section_id":"s1"}}`, ""},
		{"rule section none", kRule, `{"section":{"project_id":"p1","section_id":null}}`, ""},
		{"rule state", kRule, `{"state":"complete"}`, ""},
		{"rule reopen", kRule, `{"state":"reopen"}`, ""},
		{"rule unknown key", kRule, `{"colour":"red"}`, "unknown rule key"},
		{"rule priority 5", kRule, `{"priority":5}`, "priority must be from 1"},
		{"rule due friday", kRule, `{"due":"friday"}`, "due must be one of"},
		{"rule state other", kRule, `{"state":"archive"}`, "state must be one of"},
		{"rule string", kRule, `"priority 1"`, "must be null or an object"},
		{"rule array", kRule, `[]`, "must be null or an object"},
		{"rule label type", kRule, `{"add_labels":"l1"}`, "wrong type"},
		{"rule label empty", kRule, `{"add_labels":[""]}`, "ids must be 1 to"},
		{"rule too many labels", kRule, `{"add_labels":[` + strings.TrimSuffix(strings.Repeat(`"l",`, MaxRuleLabels+1), ",") + `]}`, "at most 32"},
		{"rule section without project", kRule, `{"section":{"section_id":"s1"}}`, "project_id must be"},
		{"rule section extra", kRule, `{"section":{"project_id":"p1","x":1}}`, "only project_id and section_id"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := checkKind(c.k, json.RawMessage(c.raw))
			switch {
			case c.want == "" && err != nil:
				t.Fatalf("checkKind(%s) = %v, want ok", c.raw, err)
			case c.want != "" && (err == nil || !strings.Contains(err.Error(), c.want)):
				t.Fatalf("checkKind(%s) = %v, want an error containing %q", c.raw, err, c.want)
			}
		})
	}
}
