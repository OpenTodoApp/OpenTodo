package quickadd

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Project is the slice of a project #name matching needs.
type Project struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Archived bool   `json:"archived,omitempty"`
	Deleted  bool   `json:"deleted,omitempty"`
	ParentID string `json:"parent_id,omitempty"`
}

// MaxEstimateMinutes mirrors the server's bound (one week).
const MaxEstimateMinutes = 10080

var foldSep = regexp.MustCompile(`[\s_-]+`)

func foldName(s string) string { return foldSep.ReplaceAllString(normalize(s), "") }

func depthOf(p Project, byID map[string]Project) int {
	depth := 0
	seen := map[string]bool{p.ID: true}
	cur := p
	for cur.ParentID != "" {
		parent, ok := byID[cur.ParentID]
		if !ok || seen[parent.ID] {
			break
		}
		seen[parent.ID] = true
		depth++
		cur = parent
	}
	return depth
}

func matchProject(token string, projects []Project) *Project {
	if !strings.HasPrefix(token, "#") || len(token) < 2 {
		return nil
	}
	if strings.Contains(token, "/") {
		return matchProjectPath(token, projects)
	}
	want := foldName(token[1:])
	if want == "" {
		return nil
	}
	var live, exact, prefix []Project
	for _, p := range projects {
		if !p.Archived && !p.Deleted {
			live = append(live, p)
		}
	}
	for _, p := range live {
		f := foldName(p.Name)
		if f == want {
			exact = append(exact, p)
		}
		if strings.HasPrefix(f, want) {
			prefix = append(prefix, p)
		}
	}
	if len(exact) == 1 {
		return &exact[0]
	}
	if len(exact) > 1 {
		byID := map[string]Project{}
		for _, p := range live {
			byID[p.ID] = p
		}
		sort.SliceStable(exact, func(i, j int) bool {
			di, dj := depthOf(exact[i], byID), depthOf(exact[j], byID)
			if di != dj {
				return di < dj
			}
			return exact[i].ID < exact[j].ID
		})
		return &exact[0]
	}
	if len(prefix) == 1 {
		return &prefix[0]
	}
	return nil
}

func trimPunct(s string) string { return strings.TrimRight(s, ",;") }

func matchLabel(token string) (string, bool) {
	if !strings.HasPrefix(token, "@") || len(token) < 2 {
		return "", false
	}
	name := trimPunct(token[1:])
	if name == "" || strings.ContainsAny(name, " \t\n") {
		return "", false
	}
	return name, true
}

var priorityRE = regexp.MustCompile(`(?i)^p([1-4])$`)

func matchPriority(token string) int {
	if m := priorityRE.FindStringSubmatch(trimPunct(token)); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n
	}
	return 0
}

var (
	durHRE   = regexp.MustCompile(`^(\d+(?:[.,]\d+)?)h(?:(\d{1,2})(?:m|min)?)?$`)
	durMRE   = regexp.MustCompile(`^(\d+)(m|min|mins|minutes)$`)
	durNumRE = regexp.MustCompile(`^(\d+)$`)
)

// matchDuration mirrors attributes.ts: +30, +30m, +2h, +1h30, 45min, 2h.
func matchDuration(token string, bareHourIsTime bool) int {
	t := strings.ToLower(trimPunct(token))
	plus := strings.HasPrefix(t, "+")
	body := strings.TrimPrefix(t, "+")
	if body == "" {
		return 0
	}
	minutes := -1.0
	if m := durHRE.FindStringSubmatch(body); m != nil {
		hours, _ := strconv.ParseFloat(strings.Replace(m[1], ",", ".", 1), 64)
		mins := 0.0
		if m[2] != "" {
			v, _ := strconv.Atoi(m[2])
			mins = float64(v)
		}
		if mins > 59 {
			return 0
		}
		if !plus && (bareHourIsTime || m[2] != "") {
			return 0
		}
		minutes = math.Round(hours*60 + mins)
	} else if m := durMRE.FindStringSubmatch(body); m != nil {
		if !plus && m[2] == "m" {
			return 0
		}
		v, _ := strconv.Atoi(m[1])
		minutes = float64(v)
	} else if m := durNumRE.FindStringSubmatch(body); plus && m != nil {
		v, _ := strconv.Atoi(m[1])
		minutes = float64(v)
	}
	if minutes < 1 || minutes > MaxEstimateMinutes || minutes != math.Trunc(minutes) {
		return 0
	}
	return int(minutes)
}

// spentRE is `<spent>/<estimate>` (OpenSpec change time-tracking, design D10):
// both parts carry a unit (h with optional minutes, or m/min/mins/minutes), so
// a day-month date such as 30/12 never matches, and there is no "+".
var (
	spentPart = `(\d+(?:[.,]\d+)?h(?:\d{1,2}(?:m|min)?)?|\d+(?:m|min|mins|minutes))`
	spentRE   = regexp.MustCompile(`^` + spentPart + `/` + spentPart + `$`)
	spentHRE  = regexp.MustCompile(`^(\d+(?:[.,]\d+)?)h(?:(\d{1,2})(?:m|min)?)?$`)
	spentMRE  = regexp.MustCompile(`^(\d+)(?:m|min|mins|minutes)$`)
)

// spentPartMinutes reads one part of a spent token in minutes (0 when invalid).
func spentPartMinutes(s string) int {
	if m := spentHRE.FindStringSubmatch(s); m != nil {
		hours, _ := strconv.ParseFloat(strings.Replace(m[1], ",", ".", 1), 64)
		mins := 0
		if m[2] != "" {
			mins, _ = strconv.Atoi(m[2])
		}
		if mins > 59 {
			return 0
		}
		v := math.Round(hours*60 + float64(mins))
		if v < 1 || v > MaxEstimateMinutes {
			return 0
		}
		return int(v)
	}
	if m := spentMRE.FindStringSubmatch(s); m != nil {
		v, _ := strconv.Atoi(m[1])
		if v < 1 || v > MaxEstimateMinutes {
			return 0
		}
		return v
	}
	return 0
}

// matchSpent mirrors attributes.ts: 30m/2h is 30 minutes already spent and a
// two-hour estimate. ok is false unless both parts are valid durations.
func matchSpent(token string) (spent, estimate int, ok bool) {
	m := spentRE.FindStringSubmatch(strings.ToLower(trimPunct(token)))
	if m == nil {
		return 0, 0, false
	}
	spent, estimate = spentPartMinutes(m[1]), spentPartMinutes(m[2])
	return spent, estimate, spent > 0 && estimate > 0
}

// matchProjectPath resolves a "#Parent/Child" token (smart-title-tokens D2): every
// segment matches a project name exactly (folded) and each is the parent of the next.
// No prefix matching. Mirrors matchProjectPath in web/src/lib/nlp/attributes.ts.
func matchProjectPath(token string, projects []Project) *Project {
	raw := strings.Split(token[1:], "/")
	parts := make([]string, len(raw))
	for i, r := range raw {
		parts[i] = foldName(r)
		if parts[i] == "" {
			return nil
		}
	}
	if len(parts) < 2 {
		return nil
	}
	byID := map[string]Project{}
	var live []Project
	for _, p := range projects {
		if !p.Archived && !p.Deleted {
			live = append(live, p)
			byID[p.ID] = p
		}
	}
	fits := func(p Project) bool {
		cur, ok := p, true
		for i := len(parts) - 1; i >= 0; i-- {
			if !ok || foldName(cur.Name) != parts[i] {
				return false
			}
			if i > 0 {
				cur, ok = byID[cur.ParentID]
			}
		}
		return true
	}
	var found []Project
	for _, p := range live {
		if fits(p) {
			found = append(found, p)
		}
	}
	if len(found) == 0 {
		return nil
	}
	sort.SliceStable(found, func(i, j int) bool {
		di, dj := depthOf(found[i], byID), depthOf(found[j], byID)
		if di != dj {
			return di < dj
		}
		return found[i].ID < found[j].ID
	})
	return &found[0]
}
