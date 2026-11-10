package sync

// kindNames are the stable names of the field kinds (OpenSpec change
// `stability-contract`): the v1 surface snapshot
// (internal/httpapi/testdata/v1_surface.json) records each op field by its
// kind's name, so a field that changes kind fails the surface test. A name is
// never reused for another kind.
var kindNames = map[kind]string{
	kString:          "string",
	kNullableString:  "nullable_string",
	kNumber:          "number",
	kNullableNumber:  "nullable_number",
	kBool:            "bool",
	kPriority:        "priority",
	kDue:             "due",
	kStringList:      "string_list",
	kPositiveInt:     "positive_int",
	kRecurrence:      "recurrence",
	kID:              "id",
	kReminderKind:    "reminder_kind",
	kOffsetMinutes:   "offset_minutes",
	kInstant:         "instant",
	kNullableText:    "nullable_text",
	kDoc:             "doc",
	kDate:            "date",
	kStart:           "start",
	kIDList:          "id_list",
	kFieldValue:      "field_value",
	kOrigin:          "origin",
	kRule:            "rule",
	kLocation:        "location",
	kGeo:             "geo",
	kRuleTrigger:     "rule_trigger",
	kRuleCondition:   "rule_condition",
	kRuleActions:     "rule_actions",
	kRoutineSteps:    "routine_steps",
	kReactions:       "reactions",
	kDayPart:         "day_part",
	kClock:           "clock",
	kWeekdays:        "weekdays",
	kEnergy:          "energy",
	kOrderList:       "order_list",
	kSplit:           "split",
	kFocusSession:    "focus_session",
	kThemeDoc:        "theme_doc",
	kSector:          "sector",
	kObjectiveTitle:  "objective_title",
	kMemoryText:      "memory_text",
	kObjectivePeriod: "objective_period",
	kRadius:          "radius",
}

// SchemaKinds is Schema as entity → field → kind name.
func SchemaKinds() map[string]map[string]string {
	out := make(map[string]map[string]string, len(Schema))
	for e, fields := range Schema {
		m := make(map[string]string, len(fields))
		for f, spec := range fields {
			m[f] = kindNames[spec.Kind]
		}
		out[e] = m
	}
	return out
}
