package importer

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Comments of a foreign file (OpenSpec change todoist-notes-comments). Each
// becomes a comment of its task authored by the importing account; its body
// starts with the original author's name and time, so nothing reads as the
// importer's own words. An import creates at most MaxComments comments; a
// comment past the cap goes into the task's description under "Comments" as
// before. A note too long for a comment body keeps that first line and has its
// text cut to fit, ending in "…". The preview says once how many were added to
// descriptions or cut.

// commentPlan is the outcome of one task's comments.
type commentPlan struct {
	changes       []change
	folded        []string // texts that go into the description instead
	capped, large int
}

// taskComments plans the comments of the created task taskID. The planner's
// count only grows once the task is known to be created (commitComments).
func (pl *planner) taskComments(taskID string, list []Comment) commentPlan {
	var cp commentPlan
	for _, c := range list {
		if pl.commentCount+len(cp.changes) >= MaxComments {
			cp.folded = append(cp.folded, c.Text)
			cp.capped++
			continue
		}
		id := pl.newID()
		fields := func(body string) []field {
			return []field{
				{"task_id", raw(taskID)}, {"author_id", raw(pl.st.UserID)}, {"parent_id", json.RawMessage("null")},
				{"body", raw(body)}, {"mentions", raw([]string{})},
				// One millisecond apart, so the comments keep the file's order.
				{"created_at", raw(pl.now + int64(pl.commentCount+len(cp.changes)))},
				{"edited_at", json.RawMessage("null")}, {"deleted_at", json.RawMessage("null")},
			}
		}
		// The description has the same bound as a comment body, so a long note is never
		// folded into it: it keeps its first line, and its text is cut to fit.
		fs := fields(commentBody(c))
		if validateFields(KindComment, id, fs) != nil {
			cut := cutToFit(c.Text, func(text string) bool {
				return validateFields(KindComment, id, fields(commentBody(Comment{Author: c.Author, At: c.At, Text: text}))) == nil
			})
			fs = fields(commentBody(Comment{Author: c.Author, At: c.At, Text: cut}))
			cp.large++
		}
		cp.changes = append(cp.changes, change{entity: KindComment, id: id, fields: fs, created: true})
	}
	return cp
}

// cutToFit is the longest proper prefix of text, cut at a rune boundary and
// ending in "…", that fits (text does not).
func cutToFit(text string, fits func(string) bool) string {
	lo, hi := 0, len(text)-1
	for lo < hi { // the longest byte length below len(text) whose cut fits
		mid := (lo + hi + 1) / 2
		if fits(cutAt(text, mid)) {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return cutAt(text, lo)
}

func cutAt(text string, n int) string {
	for n > 0 && n < len(text) && !utf8.RuneStart(text[n]) {
		n--
	}
	return text[:n] + "…"
}

// commitComments counts the comments of a task that is created.
func (pl *planner) commitComments(cp commentPlan) {
	pl.commentCount += len(cp.changes)
	pl.commentsCapped += cp.capped
	pl.commentsLarge += cp.large
}

// foldComments appends texts to a description under "Comments", one line each,
// as notes were imported before they became comments.
func foldComments(description string, texts []string) string {
	if len(texts) == 0 {
		return description
	}
	d := strings.TrimSpace(description+"\n\nComments") + "\n"
	for _, t := range texts {
		d += "\n- " + t
	}
	return d
}

// commentBody is an imported comment's body: a first line with the original
// author in bold and the time in UTC, each left out when the file does not give
// it (and the line too when neither is known), a blank line, then the text.
func commentBody(c Comment) string {
	var head []string
	if c.Author != "" {
		head = append(head, "**"+markdownEscaper.Replace(c.Author)+"**")
	}
	if !c.At.IsZero() {
		head = append(head, c.At.UTC().Format("2006-01-02 15:04")+" UTC")
	}
	if len(head) == 0 {
		return c.Text
	}
	return strings.Join(head, " · ") + "\n\n" + c.Text
}

// The name is the file's, so nothing in it may read as markup, a mention or a link.
var markdownEscaper = strings.NewReplacer(`\`, `\\`, `*`, `\*`, `_`, `\_`, "`", "\\`", `[`, `\[`, `]`, `\]`, `<`, `\<`, `>`, `\>`, `~`, `\~`, `@`, `\@`, `:`, `\:`)

// commentsNote is the file-level note for comments that went into descriptions
// or were cut to fit.
func (pl *planner) commentsNote() string {
	var parts []string
	if n := pl.commentsCapped; n > 0 {
		parts = append(parts, fmt.Sprintf("%d %s added to %s description instead, as an import creates at most %s comments",
			n, plural(n, "note was", "notes were"), plural(n, "its task's", "their tasks'"), thousands(MaxComments)))
	}
	if n := pl.commentsLarge; n > 0 {
		parts = append(parts, fmt.Sprintf("%d %s cut to fit, as %s too long for a comment", n, plural(n, "comment was", "comments were"), plural(n, "it was", "they were")))
	}
	return strings.Join(parts, "; ")
}

// thousands writes n with a comma between each group of three digits (5000 is "5,000").
func thousands(n int) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}
