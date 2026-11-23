package importer

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Comments of a foreign file (OpenSpec change todoist-notes-comments). Each
// becomes a comment of its task authored by the importing account; its body
// starts with the original author's name and time, so nothing reads as the
// importer's own words. An import creates at most MaxComments comments; a
// comment past the cap, or too long for a comment body, goes into the task's
// description under "Comments" as before, and the preview says so once.

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
		fields := []field{
			{"task_id", raw(taskID)}, {"author_id", raw(pl.st.UserID)}, {"parent_id", json.RawMessage("null")},
			{"body", raw(commentBody(c))}, {"mentions", raw([]string{})},
			// One millisecond apart, so the comments keep the file's order.
			{"created_at", raw(pl.now + int64(pl.commentCount+len(cp.changes)))},
			{"edited_at", json.RawMessage("null")}, {"deleted_at", json.RawMessage("null")},
		}
		if validateFields(KindComment, id, fields) != nil {
			cp.folded = append(cp.folded, c.Text)
			cp.large++
			continue
		}
		cp.changes = append(cp.changes, change{entity: KindComment, id: id, fields: fields, created: true})
	}
	return cp
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

var markdownEscaper = strings.NewReplacer(`\`, `\\`, `*`, `\*`, `_`, `\_`, "`", "\\`", `[`, `\[`, `]`, `\]`, `<`, `\<`, `>`, `\>`, `~`, `\~`)

// commentsNote is the file-level note for comments that went into descriptions.
func (pl *planner) commentsNote() string {
	n := pl.commentsCapped + pl.commentsLarge
	if n == 0 {
		return ""
	}
	why := fmt.Sprintf("an import creates at most %d comments", MaxComments)
	switch {
	case pl.commentsCapped == 0:
		why = "they are too long for a comment"
	case pl.commentsLarge > 0:
		why += ", and some are too long for a comment"
	}
	return fmt.Sprintf("%d %s added to the task's description instead: %s", n, plural(n, "comment is", "comments are"), why)
}
