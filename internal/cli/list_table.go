package cli

import (
	"fmt"
	"strings"
)

// renderTasks prints tasks as the list table: ID, priority, due, the deadline
// and origin columns when a listed task has one, project and title.
func (a *App) renderTasks(tasks []task, projects []project, all []task, today string) {
	byID := map[string]project{}
	for _, p := range projects {
		byID[p.ID] = p
	}
	// The origin's id or host as a column, only when a listed task has one (task-origin).
	// The deadline as a BY column, likewise only when one is set (agent-planning-fields).
	// The energy likewise (task-energy).
	showOrigin, showBy, showEnergy := false, false, false
	for _, t := range tasks {
		showOrigin = showOrigin || t.originLabel() != ""
		showBy = showBy || (t.Deadline != nil && *t.Deadline != "")
		showEnergy = showEnergy || t.Energy != ""
	}
	headers := []string{"ID", "P", "DUE"}
	if showBy {
		headers = append(headers, "BY")
	}
	if showEnergy {
		headers = append(headers, "ENERGY")
	}
	headers = append(headers, "PROJECT")
	if showOrigin {
		headers = append(headers, "ORIGIN")
	}
	headers = append(headers, "TITLE")
	blocked := blockedRule(all)
	tbl := newTable(headers...)
	for _, t := range tasks {
		dueText, overdue := describeDue(t.Due, today)
		if sfx := planningSuffix(t, today, t.CompletedAt == nil && blocked(t)); sfx != "" {
			dueText = strings.TrimSpace(dueText + " " + sfx)
		}
		dueCell := plain(dueText)
		if overdue {
			dueCell.style = styleRed
		} else if t.Due != nil && t.Due.Date == today {
			dueCell.style = styleBold
		}
		pr := plain(fmt.Sprintf("P%d", t.Priority))
		if t.Priority == 1 {
			pr.style = styleRed
		}
		projName := ""
		if t.ProjectID != nil {
			if p, ok := byID[*t.ProjectID]; ok {
				projName = p.Name
			}
		}
		title := t.Title
		if t.CompletedAt != nil {
			title = "[done] " + title
		}
		cells := []cell{{text: shortID(t.ID), style: styleCyan}, pr, dueCell}
		if showBy {
			cells = append(cells, deadlineCell(t, today))
		}
		if showEnergy {
			cells = append(cells, plain(t.Energy))
		}
		cells = append(cells, plain(projName))
		if showOrigin {
			cells = append(cells, plain(t.originLabel()))
		}
		tbl.add(append(cells, plain(title))...)
	}
	tbl.render(a.Stdout, a.color())
}
