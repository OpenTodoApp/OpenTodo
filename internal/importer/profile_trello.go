package importer

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Trello: a board's JSON export (board menu → Print and export → Export as JSON;
// OpenSpec change more-importers). The board becomes one project shown as a board,
// its lists sections in their order, cards tasks, checklist items subtasks,
// comment actions text under the description, links link attachments and custom
// field items custom field values.

const trelloFormat = "trello-json"

type trelloProfile struct{}

func (trelloProfile) Name() string        { return trelloFormat }
func (trelloProfile) Description() string { return "Trello: a board's JSON export" }

func (trelloProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	for _, k := range []string{"lists", "cards", "checklists"} {
		if !isArray(top[k]) {
			return false
		}
	}
	var id, name string
	return json.Unmarshal(top["id"], &id) == nil && id != "" && json.Unmarshal(top["name"], &name) == nil
}

type trelloField struct {
	name, typ string
	options   map[string]string // option id → text
}

type trelloComment struct{ author, date, text string }

func (trelloProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	b := asObj(v)
	if b == nil {
		return nil, &FileError{"expected a JSON object"}
	}
	out := &Parsed{}
	tb := newTrelloBoard(b, opts, out)
	n := 1
	for ci, c := range asList(b["cards"]) {
		n++
		o := asObj(c)
		if o == nil {
			row := Row{Line: n, Kind: KindTask, ProjectSourceID: tb.source}
			row.fail("card #%d is not an object", ci+1)
			out.Rows = append(out.Rows, row)
			continue
		}
		row := tb.card(o, n, ci)
		out.Rows = append(out.Rows, row)
		for _, cl := range tb.checklists[o.str("id")] {
			for ii, it := range asList(cl["checkItems"]) {
				item := asObj(it)
				if item == nil {
					continue
				}
				n++
				sub := Row{Line: n, Kind: KindTask, ProjectSourceID: tb.source, ParentSourceID: row.SourceID,
					SourceID: "trello:check:" + firstNonEmpty(item.str("id"), fmt.Sprintf("%s:%d", cl.str("id"), ii)), Title: item.str("name"),
					Completed: item.str("state") == "complete"}
				if sub.Title == "" {
					sub.fail("checklist item %d of %q has no name", ii+1, row.Title)
				}
				out.Rows = append(out.Rows, sub)
			}
		}
		if len(out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	return out, nil
}

// trelloBoard holds one board's lookups: its lists, labels, members, custom
// fields, checklists and comments by card.
type trelloBoard struct {
	source     string
	loc        *time.Location
	me         string // the importing account's name, lower case
	lists      map[string]trelloList
	labelName  map[string]string
	member     map[string]obj
	fields     map[string]trelloField
	checklists map[string][]obj
	comments   map[string][]trelloComment
}

type trelloList struct {
	id, name string
	closed   bool
	pos      float64
}

// newTrelloBoard reads the board's lookups and appends its project row and, in
// the board's order, one section per list (a closed list's cards are completed).
func newTrelloBoard(b obj, opts Options, out *Parsed) *trelloBoard {
	tb := &trelloBoard{
		source: "trello:board:" + b.str("id"), loc: opts.Location(),
		me:    strings.ToLower(strings.TrimSpace(opts.importerName)),
		lists: map[string]trelloList{}, labelName: map[string]string{}, member: map[string]obj{},
		fields: map[string]trelloField{}, checklists: map[string][]obj{}, comments: map[string][]trelloComment{},
	}
	board := Row{Line: 1, Kind: KindProject, SourceID: tb.source, Title: b.str("name"), Description: b.str("desc")}
	if board.Title == "" {
		board.fail("the board has no name")
	}
	out.Rows = append(out.Rows, board)
	out.ViewHints = append(out.ViewHints, ViewHint{ProjectSourceID: tb.source, View: "board"})

	var lists []trelloList
	for _, l := range asList(b["lists"]) {
		o := asObj(l)
		if o == nil {
			continue
		}
		pos, _ := strconv.ParseFloat(o.str("pos"), 64)
		li := trelloList{id: o.str("id"), name: o.str("name"), closed: o.boolean("closed"), pos: pos}
		lists = append(lists, li)
		tb.lists[li.id] = li
	}
	sort.SliceStable(lists, func(i, j int) bool { return lists[i].pos < lists[j].pos })
	for i, li := range lists {
		if li.name == "" {
			continue
		}
		out.Rows = append(out.Rows, Row{Line: i + 1, Kind: KindSection, SourceID: "trello:list:" + li.id, Title: li.name, ProjectSourceID: tb.source})
	}

	for _, l := range asList(b["labels"]) {
		if o := asObj(l); o != nil {
			tb.labelName[o.str("id")] = firstNonEmpty(o.str("name"), o.str("color"))
		}
	}
	for _, m := range asList(b["members"]) {
		if o := asObj(m); o != nil {
			tb.member[o.str("id")] = o
		}
	}
	for _, f := range asList(b["customFields"]) {
		o := asObj(f)
		if o == nil {
			continue
		}
		tf := trelloField{name: o.str("name"), typ: o.str("type"), options: map[string]string{}}
		for _, opt := range asList(o["options"]) {
			if oo := asObj(opt); oo != nil {
				tf.options[oo.str("id")] = asObj(oo["value"]).str("text")
			}
		}
		tb.fields[o.str("id")] = tf
	}
	for _, c := range asList(b["checklists"]) {
		if o := asObj(c); o != nil {
			tb.checklists[o.str("idCard")] = append(tb.checklists[o.str("idCard")], o)
		}
	}
	for _, a := range asList(b["actions"]) {
		o := asObj(a)
		if o == nil || o.str("type") != "commentCard" {
			continue
		}
		data := asObj(o["data"])
		card := asObj(data["card"]).str("id")
		creator := asObj(o["memberCreator"])
		tb.comments[card] = append(tb.comments[card], trelloComment{
			author: firstNonEmpty(creator.str("fullName"), creator.str("username")),
			date:   o.str("date"),
			text:   data.str("text"),
		})
	}
	return tb
}

// card maps one card to a task row (its checklist items are read by Read).
func (tb *trelloBoard) card(o obj, n, ci int) Row {
	row := Row{Line: n, Kind: KindTask, ProjectSourceID: tb.source}
	id := o.str("id")
	row.SourceID = "trello:" + firstNonEmpty(id, fmt.Sprintf("line:%d", n))
	row.Origin = importedOrigin("trello", row.SourceID)
	if row.Origin != nil {
		if u := o.str("shortUrl", "url"); u != "" {
			withURL := *row.Origin
			withURL.URL = u
			if withURL.Validate() == nil {
				row.Origin = &withURL
			}
		}
	}
	row.Title = o.str("name")
	if row.Title == "" {
		row.fail("card #%d has no name", ci+1)
	}
	row.Description = o.str("desc")
	list := tb.lists[o.str("idList")]
	row.SectionName = list.name
	var labels []string
	if ls := asList(o["labels"]); len(ls) > 0 {
		for _, l := range ls {
			if lo := asObj(l); lo != nil {
				labels = append(labels, firstNonEmpty(lo.str("name"), lo.str("color")))
			}
		}
	} else {
		for _, id := range asList(o["idLabels"]) {
			if s, _ := id.(string); tb.labelName[s] != "" {
				labels = append(labels, tb.labelName[s])
			}
		}
	}
	row.Labels = dedupeNames(labels)
	if d := o.str("due"); d != "" {
		due, err := parseDue(d, tb.loc)
		if err != nil {
			row.warn("due date %q not understood; imported without a due date", d)
		} else {
			row.Due = due
		}
	}
	if s := o.str("start"); s != "" {
		if d, err := parseDue(s, tb.loc); err == nil && d != nil {
			row.Start = d.Date
		}
	}
	if o.boolean("dueComplete") || o.boolean("closed") || list.closed {
		row.Completed = true
		if at, err := parseTimestamp(o.str("dateLastActivity"), tb.loc); err == nil && (o.boolean("closed") || list.closed) {
			row.CompletedAt = at
		}
	}
	for _, a := range asList(o["attachments"]) {
		ao := asObj(a)
		if ao == nil {
			continue
		}
		if ao.boolean("isUpload") {
			row.warn("attachment %q dropped (uploaded files are not in the export; only links are imported)", firstNonEmpty(ao.str("name"), ao.str("fileName")))
			continue
		}
		row.addLink(ao.str("name"), ao.str("url"))
	}
	trelloMembers(&row, o, tb.member, tb.me)
	tb.addComments(&row, tb.comments[id])
	trelloCustomFields(&row, o, tb.fields)
	return row
}

// addComments appends a card's comments to the description under "Comments",
// oldest first, with author and day; their authors cannot be kept.
func (tb *trelloBoard) addComments(row *Row, cs []trelloComment) {
	if len(cs) == 0 {
		return
	}
	var b strings.Builder
	b.WriteString(strings.TrimSpace(row.Description))
	if b.Len() > 0 {
		b.WriteString("\n\n")
	}
	b.WriteString("Comments")
	for i := len(cs) - 1; i >= 0; i-- { // the export lists the newest first
		c := cs[i]
		day := c.date
		if t, err := time.Parse(time.RFC3339Nano, c.date); err == nil {
			day = t.In(tb.loc).Format("2006-01-02")
		}
		fmt.Fprintf(&b, "\n- %s, %s: %s", firstNonEmpty(c.author, "Someone"), day, strings.TrimSpace(c.text))
	}
	row.Description = b.String()
	row.warn("comment authors cannot be kept; %d %s added to the description", len(cs), plural(len(cs), "comment", "comments"))
}

func trelloMembers(row *Row, card obj, member map[string]obj, me string) {
	others := 0
	for _, id := range asList(card["idMembers"]) {
		s, _ := id.(string)
		m := member[s]
		if me != "" && m != nil && (strings.ToLower(m.str("fullName")) == me || strings.ToLower(m.str("username")) == me) {
			row.AssignSelf = true
			continue
		}
		others++
	}
	if others > 0 {
		row.warn("%d %s dropped (only your own account can be assigned by an import)", others, plural(others, "member", "members"))
	}
}

// trelloCustomFields reads a card's custom field items (number, text, checkbox,
// date and list values) as field values.
func trelloCustomFields(row *Row, card obj, fields map[string]trelloField) {
	for _, it := range asList(card["customFieldItems"]) {
		o := asObj(it)
		if o == nil {
			continue
		}
		f, ok := fields[o.str("idCustomField")]
		if !ok || f.name == "" {
			continue
		}
		val := asObj(o["value"])
		switch f.typ {
		case "number":
			if n, err := strconv.ParseFloat(val.str("number"), 64); err == nil {
				row.Fields = append(row.Fields, FieldValue{f.name, FieldNumber, n})
			}
		case "text":
			if s := val.str("text"); s != "" {
				row.Fields = append(row.Fields, FieldValue{f.name, FieldText, s})
			}
		case "checkbox":
			row.Fields = append(row.Fields, FieldValue{f.name, FieldCheckbox, val.str("checked") == "true"})
		case "date":
			if s := val.str("date"); len(s) >= 10 && validDate(s[:10]) {
				row.Fields = append(row.Fields, FieldValue{f.name, FieldDate, s[:10]})
			}
		case "list":
			if s := f.options[o.str("idValue")]; s != "" {
				row.Fields = append(row.Fields, FieldValue{f.name, FieldChoice, s})
			}
		}
	}
}
