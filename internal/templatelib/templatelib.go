// Package templatelib reads the template library (OpenSpec change
// template-library) on the server, for a routine's Create a project from a
// template step (routines-engine). library.json is the same compiled file the
// web app loads (web/src/generated/templates.json), written by
// scripts/templates-build.mjs; reading it here follows
// web/src/lib/templateLibrary.ts libraryTree.
package templatelib

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"sync"
	"time"
)

//go:embed library.json
var libraryJSON []byte

// Localized is a text per language; a missing language falls back to English.
type Localized map[string]string

// Pick is the text in lang, else English.
func (l Localized) Pick(lang string) string {
	if v, ok := l[lang]; ok {
		return v
	}
	return l["en"]
}

// Task is a library task.
type Task struct {
	Title       Localized `json:"title"`
	Description Localized `json:"description"`
	Priority    int       `json:"priority"`
	Due         string    `json:"due"`
	Time        string    `json:"time"`
	Recurrence  string    `json:"recurrence"`
	Estimate    int       `json:"estimate"`
	Labels      []int     `json:"labels"`
	Subtasks    []Task    `json:"subtasks"`
}

// Section is a library section.
type Section struct {
	Name  Localized `json:"name"`
	Color string    `json:"color"`
	Icon  string    `json:"icon"`
	Tasks []Task    `json:"tasks"`
}

// Project is a library project.
type Project struct {
	Name     Localized `json:"name"`
	Color    string    `json:"color"`
	Icon     string    `json:"icon"`
	Tasks    []Task    `json:"tasks"`
	Sections []Section `json:"sections"`
}

// Template is one library template.
type Template struct {
	Slug   string `json:"slug"`
	Icon   string `json:"icon"`
	Layout string `json:"layout"`
	Labels []struct {
		Name  Localized `json:"name"`
		Color string    `json:"color"`
	} `json:"labels"`
	Projects []Project `json:"projects"`
	Counts   struct {
		Projects, Sections, Tasks, Labels int
	} `json:"counts"`
}

type library struct {
	Schema    int        `json:"schema"`
	Templates []Template `json:"templates"`
}

var (
	once sync.Once
	lib  library
	err  error
)

// All lists the library's templates.
func All() ([]Template, error) {
	once.Do(func() { err = json.Unmarshal(libraryJSON, &lib) })
	return lib.Templates, err
}

// Find returns the template with this slug.
func Find(slug string) (*Template, bool) {
	list, err := All()
	if err != nil {
		return nil, false
	}
	for i := range list {
		if list[i].Slug == slug {
			return &list[i], true
		}
	}
	return nil, false
}

var offsetRe = regexp.MustCompile(`^\+(\d+)([dwm])$`)

// ResolveOffset is the date an offset lands on from startDay, as
// resolveOffset: +0d the start day, +1w seven days later, +1m the same day of
// the next month or its last day when that month is shorter.
func ResolveOffset(offset, startDay string) (string, error) {
	m := offsetRe.FindStringSubmatch(offset)
	start, perr := time.Parse("2006-01-02", startDay)
	if m == nil || perr != nil {
		return "", fmt.Errorf("invalid offset %s", offset)
	}
	n, _ := strconv.Atoi(m[1])
	switch m[2] {
	case "d":
		return start.AddDate(0, 0, n).Format("2006-01-02"), nil
	case "w":
		return start.AddDate(0, 0, 7*n).Format("2006-01-02"), nil
	}
	first := time.Date(start.Year(), start.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1).Day()
	day := min(start.Day(), last)
	return time.Date(first.Year(), first.Month(), day, 0, 0, 0, 0, time.UTC).Format("2006-01-02"), nil
}

// Palette colours the projects that name none, as the web planner does.
var Palette = []string{"#059669", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#0891b2"}
