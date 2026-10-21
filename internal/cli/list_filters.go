package cli

import "sort"

// filterTasks applies one view the way the web app does. Tasks of archived or
// missing projects stay out of cross-project views.
func filterTasks(all []task, projects []project, view string, selected *project, today string) []task {
	visible := map[string]bool{}
	for _, p := range projects {
		visible[p.ID] = !p.Archived && p.DeletedAt == nil
	}
	out := make([]task, 0, len(all))
	inInbox := inboxRule(all)
	for _, t := range all {
		if t.DeletedAt != nil {
			continue
		}
		if view == "project" {
			if t.ProjectID == nil || *t.ProjectID != selected.ID || t.CompletedAt != nil {
				continue
			}
			out = append(out, t)
			continue
		}
		if t.ProjectID != nil && !visible[*t.ProjectID] {
			continue
		}
		open := t.CompletedAt == nil
		switch view {
		case "inbox":
			if !inInbox(t) {
				continue
			}
		case "today":
			if !open || t.Due == nil || t.Due.Date > today {
				continue
			}
		case "upcoming":
			if !open || t.Due == nil || t.Due.Date <= today {
				continue
			}
		case "completed":
			if open {
				continue
			}
		case "all":
		default: // open
			if !open {
				continue
			}
		}
		out = append(out, t)
	}
	switch view {
	case "inbox", "project":
		sort.SliceStable(out, func(i, j int) bool { return byPosition(out[i], out[j]) })
	case "completed":
		sort.SliceStable(out, func(i, j int) bool { return *out[i].CompletedAt > *out[j].CompletedAt })
	default:
		sort.SliceStable(out, func(i, j int) bool { return byDueThenPriority(out[i], out[j]) })
	}
	return out
}

// completedBetween lists the tasks completed in [after, before) (0 = open end),
// most recent first: of the selected project, or of every visible one.
func completedBetween(all []task, projects []project, selected *project, after, before int64) []task {
	visible := map[string]bool{}
	for _, p := range projects {
		visible[p.ID] = !p.Archived && p.DeletedAt == nil
	}
	out := make([]task, 0)
	for _, t := range all {
		if t.DeletedAt != nil || t.CompletedAt == nil {
			continue
		}
		at := int64(*t.CompletedAt)
		if (after != 0 && at < after) || (before != 0 && at >= before) {
			continue
		}
		if selected != nil {
			if t.ProjectID == nil || *t.ProjectID != selected.ID {
				continue
			}
		} else if t.ProjectID != nil && !visible[*t.ProjectID] {
			continue
		}
		out = append(out, t)
	}
	sort.SliceStable(out, func(i, j int) bool { return *out[i].CompletedAt > *out[j].CompletedAt })
	return out
}
