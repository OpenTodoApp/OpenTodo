package sync

import "strings"

// Field families: op field names that are not listed in Schema one by one but
// share a prefix and an id (custom field values, reactions, pending appends).

// FieldValuePrefix starts the name of a task's custom field value op
// (`fields.<definition id>`, OpenSpec change custom-fields, design D2). It is the
// only family of op field names not listed in Schema one by one.
const FieldValuePrefix = "fields."

// MaxFieldIDLen bounds the definition id inside a `fields.<id>` name.
const MaxFieldIDLen = 64

// MaxFieldsPerProject is the number of live field definitions a project may
// have; the dialog, REST and the assistant tools enforce it (Validate sees one
// op and no other entity).
const MaxFieldsPerProject = 30

// ReactionPrefix starts the name of a comment's per-account reactions field
// (`reactions.<account id>`, OpenSpec change editor-everywhere, design D8): one
// field per reacting account, so concurrent reactions never overwrite each other.
const ReactionPrefix = "reactions."

// ReactionNames is the closed set of reaction names a comment accepts.
var ReactionNames = []string{"thumbs_up", "heart", "check", "eyes", "party", "question"}

// ReactionAccount returns the account id of a comment op field named
// `reactions.<account id>`, where the id is 1–64 characters of [A-Za-z0-9_-].
func ReactionAccount(field string) (string, bool) {
	return familyID(field, ReactionPrefix)
}

// FieldValueID returns the definition id of a task op field named
// `fields.<id>`, where id is 1–64 characters of [A-Za-z0-9_-].
func FieldValueID(field string) (string, bool) {
	return familyID(field, FieldValuePrefix)
}

// familyID returns the id after prefix in a field family name, when it is 1–64
// characters of [A-Za-z0-9_-].
func familyID(field, prefix string) (string, bool) {
	id, ok := strings.CutPrefix(field, prefix)
	if !ok || id == "" || len(id) > MaxFieldIDLen {
		return "", false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return "", false
		}
	}
	return id, true
}

// AppendPrefix starts the name of a pending append (`appends.<append id>`,
// OpenSpec change notes-overview, design D13): Markdown text a plain-text
// writer (the CLI, MCP, the append routes) adds at the end of a note without
// replacing it. A non-empty value is pending; a device that holds the note
// inserts it at the end of the document, every inserted block carrying the
// append's id, and writes "" in the same batch as the document and projection
// (docs/sync.md "Mergeable documents" rule 5). User-written text, so content
// (e2ee.ContentPrefixes). A string, default "".
const AppendPrefix = "appends."

// FieldPrefixes lists each entity's field families by prefix: the schema
// contract (testdata/schema_fixture.json) and the web row keys (a family's
// values live in one row map named after its prefix) are generated from it.
var FieldPrefixes = map[string][]string{
	"task":    {FieldValuePrefix, AppendPrefix},
	"comment": {ReactionPrefix},
	"note":    {AppendPrefix},
}

// AppendEntities are the entities whose note takes pending appends.
var AppendEntities = map[string]bool{"task": true, "note": true}

// MaxPendingAppends caps the pending appends of one entity (too_many_appends).
const MaxPendingAppends = 100

// AppendID returns the append id of an op field named `appends.<id>`, where id
// is 1–64 characters of [A-Za-z0-9_-].
func AppendID(field string) (string, bool) {
	return familyID(field, AppendPrefix)
}

// fieldKind resolves an op field name: exact Schema entries first, then the
// field families (`fields.<id>`, `reactions.<account>`, `appends.<id>`).
func fieldKind(entity, field string) (kind, bool) {
	fields, ok := Schema[entity]
	if !ok {
		return 0, false
	}
	if f, ok := fields[field]; ok {
		return f.Kind, true
	}
	if entity == "task" {
		if _, ok := FieldValueID(field); ok {
			return kFieldValue, true
		}
	}
	if entity == "comment" {
		if _, ok := ReactionAccount(field); ok {
			return kReactions, true
		}
	}
	if AppendEntities[entity] {
		if _, ok := AppendID(field); ok {
			return kString, true
		}
	}
	return 0, false
}

// KnownField reports whether entity.field may be written: a Schema entry or a
// task's custom field value (`fields.<id>`) or a comment's reactions
// (`reactions.<account id>`). Readers that ask "is this a field
// of the schema" use it instead of indexing Schema.
func KnownField(entity, field string) bool {
	_, ok := fieldKind(entity, field)
	return ok
}
