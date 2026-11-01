package sync

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// Schema is the one declaration of an op field (OpenSpec change
// test-integrity, audit M3). TestGeneratedOpSchema writes everything that
// follows from it and fails when a written file is out of date:
//   - web/src/generated/opSchema.ts: each entity's field types, its row
//     defaults (checked against the hand-written entity types with
//     `satisfies`) and its content fields;
//   - internal/e2ee/contentfields.go: e2ee.ContentFields;
//   - testdata/schema_fixture.json: the contract both test suites read.
//
// UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema
// rewrites them.

const (
	opSchemaTS       = "../../web/src/generated/opSchema.ts"
	contentFieldsGo  = "../e2ee/contentfields.go"
	schemaFixtureOut = "testdata/schema_fixture.json"
)

// tsEntity names an entity's hand-written web type (web/src/lib/types.ts).
var tsEntity = map[string]string{
	"project": "Project", "task": "Task", "label": "Label", "view": "View", "reminder": "Reminder", "section": "Section",
	"comment": "Comment", "project_prefs": "ProjectPrefs", "user_prefs": "UserPrefs", "attachment": "Attachment",
	"field": "FieldDef", "review": "Review", "time_entry": "TimeEntry", "place": "Place", "rule": "Rule", "frame": "Frame", "slot": "Slot", "note": "Note", "theme": "CustomTheme",
}

// tsKind is the web type of a field of each kind. A hand-written entity type
// may narrow it (a literal union, a required field).
func tsKind(k kind) string {
	switch k {
	case kString, kID, kDoc, kClock, kWeekdays, kEnergy:
		return "string"
	case kNullableString, kRecurrence, kNullableText, kDate, kStart, kDayPart:
		return "string | null"
	case kNumber, kFocusSession:
		return "number"
	case kNullableNumber, kPositiveInt, kOffsetMinutes, kInstant:
		return "number | null"
	case kBool:
		return "boolean"
	case kPriority:
		return "Priority"
	case kDue:
		return "Due | null"
	case kStringList, kIDList, kOrderList:
		return "string[]"
	case kReminderKind:
		return "ReminderKind"
	case kOrigin:
		return "Origin | string | null"
	case kLocation:
		return "TaskLocation | string | null"
	case kSplit:
		return "SplitFrom | null"
	case kGeo:
		return "Geo | string | null"
	case kRule:
		return "OnDropRule | null"
	case kRuleTrigger:
		return "RuleTrigger | null"
	case kRuleCondition:
		return "RuleCondition | null"
	case kRuleActions:
		return "RuleActions | null"
	case kRoutineSteps:
		return "RoutineStep[] | null"
	case kThemeDoc:
		return "ThemeDocument | null"
	}
	panic(fmt.Sprintf("tsKind: no web type for kind %d", k))
}

// schemaDecl is Schema as written in ops.go: entities and fields in source
// order with their comments.
type schemaDecl struct {
	entities []string
	fields   map[string][]string
	docs     map[string]string // "entity" or "entity.field" -> comment text
}

func readSchemaDecl(t *testing.T) schemaDecl {
	t.Helper()
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "ops.go", nil, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	cmap := ast.NewCommentMap(fset, f, f.Comments)
	d := schemaDecl{fields: map[string][]string{}, docs: map[string]string{}}
	doc := func(n ast.Node) string {
		var parts []string
		for _, g := range cmap[n] {
			if fset.Position(g.End()).Line < fset.Position(n.Pos()).Line {
				parts = append(parts, strings.TrimSpace(g.Text()))
			}
		}
		return strings.Join(parts, "\n")
	}
	var lit *ast.CompositeLit
	ast.Inspect(f, func(n ast.Node) bool {
		if vs, ok := n.(*ast.ValueSpec); ok && len(vs.Names) == 1 && vs.Names[0].Name == "Schema" {
			lit = vs.Values[0].(*ast.CompositeLit)
			return false
		}
		return true
	})
	if lit == nil {
		t.Fatal("Schema not found in ops.go")
	}
	unquote := func(e ast.Expr) string {
		s, err := strconv.Unquote(e.(*ast.BasicLit).Value)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	for _, el := range lit.Elts {
		kv := el.(*ast.KeyValueExpr)
		entity := unquote(kv.Key)
		d.entities = append(d.entities, entity)
		d.docs[entity] = doc(kv)
		for _, fel := range kv.Value.(*ast.CompositeLit).Elts {
			fkv := fel.(*ast.KeyValueExpr)
			name := unquote(fkv.Key)
			d.fields[entity] = append(d.fields[entity], name)
			d.docs[entity+"."+name] = doc(fkv)
		}
	}
	return d
}

func jsdoc(b *strings.Builder, indent, text string) {
	if text == "" {
		return
	}
	lines := strings.Split(text, "\n")
	if len(lines) == 1 {
		fmt.Fprintf(b, "%s/** %s */\n", indent, strings.ReplaceAll(lines[0], "*/", "* /"))
		return
	}
	fmt.Fprintf(b, "%s/**\n", indent)
	for _, l := range lines {
		fmt.Fprintf(b, "%s * %s\n", indent, strings.TrimRight(strings.ReplaceAll(l, "*/", "* /"), " "))
	}
	fmt.Fprintf(b, "%s */\n", indent)
}

// tsValue renders a JSON default as a TypeScript literal in the web app's style.
func tsValue(t *testing.T, raw string) string {
	var v any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("default %s: %v", raw, err)
	}
	switch v := v.(type) {
	case string:
		return "'" + strings.NewReplacer(`\`, `\\`, `'`, `\'`, "\n", `\n`).Replace(v) + "'"
	case []any:
		if len(v) == 0 {
			return "[]"
		}
	case map[string]any:
		if len(v) == 0 {
			return "{}"
		}
	}
	return raw
}

func contentFields(d schemaDecl) map[string][]string {
	out := map[string][]string{}
	for _, e := range d.entities {
		for _, f := range d.fields[e] {
			if Schema[e][f].Content {
				out[e] = append(out[e], f)
			}
		}
	}
	return out
}

func genOpSchemaTS(t *testing.T, d schemaDecl) string {
	var b strings.Builder
	b.WriteString("// Code generated by internal/sync TestGeneratedOpSchema from sync.Schema; DO NOT EDIT.\n")
	b.WriteString("// Declare a field in internal/sync/ops.go, then run\n")
	b.WriteString("// UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema\n")
	names := []string{"Due", "Entity", "Geo", "OnDropRule", "Origin", "Priority", "ReminderKind", "RoutineStep", "RuleActions", "RuleCondition", "RuleTrigger", "SplitFrom", "TaskLocation", "ThemeDocument"}
	for _, e := range d.entities {
		names = append(names, tsEntity[e])
	}
	slices.Sort(names)
	fmt.Fprintf(&b, "import type {\n  %s,\n} from '../lib/types'\n", strings.Join(names, ", "))
	for _, e := range d.entities {
		b.WriteString("\n")
		doc := d.docs[e]
		if doc == "" {
			doc = "The op fields of a " + strings.ReplaceAll(e, "_", " ") + " (sync.Schema)."
		}
		jsdoc(&b, "", doc+"\nA row written before a field existed lacks it, so every field is optional here; the entity type may require it.")
		fmt.Fprintf(&b, "export interface %sFields {\n", tsEntity[e])
		for _, f := range d.fields[e] {
			jsdoc(&b, "  ", d.docs[e+"."+f])
			fmt.Fprintf(&b, "  %s?: %s\n", f, tsKind(Schema[e][f].Kind))
		}
		b.WriteString("}\n")
	}
	b.WriteString("\n/** The row a field op creates when its entity is new: one key per op field, a family (`fields.<id>`) in one key named after its prefix. */\n")
	b.WriteString("export const OP_DEFAULTS = {\n")
	for _, e := range d.entities {
		var parts []string
		for _, f := range d.fields[e] {
			parts = append(parts, f+": "+tsValue(t, Schema[e][f].Default))
		}
		for _, p := range FieldPrefixes[e] {
			parts = append(parts, strings.TrimSuffix(p, ".")+": {}")
		}
		fmt.Fprintf(&b, "  %s: {\n    %s,\n  } satisfies Omit<%s, 'id' | '_clock'>,\n", e, strings.Join(parts, ", "), tsEntity[e])
	}
	b.WriteString("}\n")
	b.WriteString("\n/** User-written fields a device encrypts for an account with end-to-end encryption (e2ee D2). */\n")
	b.WriteString("export const OP_CONTENT_FIELDS: Partial<Record<Entity, readonly string[]>> = {\n")
	cf := contentFields(d)
	for _, e := range d.entities {
		if fs := cf[e]; len(fs) > 0 {
			fmt.Fprintf(&b, "  %s: ['%s'],\n", e, strings.Join(fs, "', '"))
		}
	}
	b.WriteString("}\n")
	return b.String()
}

func genContentFieldsGo(t *testing.T, d schemaDecl) string {
	var b strings.Builder
	b.WriteString("// Code generated by internal/sync TestGeneratedOpSchema from sync.Schema; DO NOT EDIT.\n\n")
	b.WriteString("package e2ee\n\n")
	b.WriteString("// ContentFields are the fields a device encrypts for an account with\n")
	b.WriteString("// encryption enabled, inside the account's personal scope only (shared\n")
	b.WriteString("// projects are never encrypted; sharing is refused for encrypted accounts):\n")
	b.WriteString("// the fields sync.Schema marks Content. Everything else stays plaintext so\n")
	b.WriteString("// scheduling, ordering and structure keep working everywhere (design D2).\n")
	b.WriteString("var ContentFields = map[string][]string{\n")
	cf := contentFields(d)
	for _, e := range d.entities {
		if fs := cf[e]; len(fs) > 0 {
			q := make([]string, len(fs))
			for i, f := range fs {
				q[i] = strconv.Quote(f)
			}
			fmt.Fprintf(&b, "\t%q: {%s},\n", e, strings.Join(q, ", "))
		}
	}
	b.WriteString("}\n")
	src := b.String()
	out, err := format.Source([]byte(src))
	if err != nil {
		t.Fatalf("format e2ee/contentfields.go: %v\n%s", err, src)
	}
	return string(out)
}

func genSchemaFixture(t *testing.T, d schemaDecl) string {
	f := struct {
		About           string              `json:"about"`
		Entities        map[string][]string `json:"entities"`
		FieldPrefixes   map[string][]string `json:"field_prefixes"`
		ContentFields   map[string][]string `json:"content_fields"`
		ContentPrefixes map[string][]string `json:"content_prefixes"`
	}{
		About: "The op schema contract between the server and the web client (OpenSpec change test-integrity), generated from sync.Schema " +
			"by internal/sync TestGeneratedOpSchema. internal/sync/schema_fixture_test.go checks it against sync.Schema and e2ee; " +
			"web/src/lib/schemaFixture.test.ts against ENTITIES, the row defaults in ops.ts and CONTENT_FIELDS/CONTENT_PREFIXES in e2ee.ts.",
		Entities:        map[string][]string{},
		FieldPrefixes:   FieldPrefixes,
		ContentFields:   map[string][]string{},
		ContentPrefixes: e2ee.ContentPrefixes,
	}
	for _, e := range d.entities {
		f.Entities[e] = slices.Sorted(slices.Values(d.fields[e]))
	}
	for e, fs := range contentFields(d) {
		f.ContentFields[e] = slices.Sorted(slices.Values(fs))
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(f); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

func TestGeneratedOpSchema(t *testing.T) {
	d := readSchemaDecl(t)
	for _, e := range d.entities {
		if tsEntity[e] == "" {
			t.Fatalf("entity %s has no web type in tsEntity", e)
		}
		for _, f := range d.fields[e] {
			if Schema[e][f].Default == "" {
				t.Errorf("%s.%s has no Default", e, f)
			}
		}
	}
	files := map[string]string{
		opSchemaTS:       genOpSchemaTS(t, d),
		contentFieldsGo:  genContentFieldsGo(t, d),
		schemaFixtureOut: genSchemaFixture(t, d),
	}
	update := os.Getenv("UPDATE_OP_SCHEMA") == "1"
	for path, want := range files {
		got, err := os.ReadFile(path)
		if update {
			if err != nil || string(got) != want {
				if err := os.WriteFile(path, []byte(want), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			continue
		}
		if err != nil || string(got) != want {
			t.Errorf("%s is out of date: run UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema", path)
		}
	}
}
