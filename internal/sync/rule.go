package sync

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/pixari/opentodo/internal/ruleval"
)

// MaxRuleLabels caps each label list of an on-drop rule.
const MaxRuleLabels = 32

// RuleKeys are the members an on-drop rule may carry (OpenSpec change
// rule-boards, design D2). A new key is a schema addition, server first.
var RuleKeys = []string{"add_labels", "remove_labels", "priority", "due", "start", "section", "state"}

// Rule is the decoded shape of a view's on_drop value.
type Rule struct {
	AddLabels    []string     `json:"add_labels,omitempty"`
	RemoveLabels []string     `json:"remove_labels,omitempty"`
	Priority     *int         `json:"priority,omitempty"`
	Due          *string      `json:"due,omitempty"`
	Start        *string      `json:"start,omitempty"`
	Section      *RuleSection `json:"section,omitempty"`
	State        *string      `json:"state,omitempty"`
}

// RuleSection moves a dropped task into a project and one of its sections (or none).
type RuleSection struct {
	ProjectID string  `json:"project_id"`
	SectionID *string `json:"section_id"`
}

var (
	ruleDue   = []string{"today", "tomorrow", "next-week", "clear"}
	ruleStart = []string{"someday", "clear"}
	ruleState = []string{"complete", "reopen"}
)

// ParseRule decodes and checks a non-null on_drop value.
func ParseRule(raw json.RawMessage) (Rule, error) {
	var r Rule
	var members map[string]json.RawMessage
	if err := json.Unmarshal(raw, &members); err != nil || members == nil {
		return r, errors.New("must be null or an object")
	}
	// The key check is shared with automation rules' actions (automation-rules
	// D4), whose set extends this one; on_drop keeps its own closed set.
	if err := ruleval.CheckKeys(members, RuleKeys, "rule"); err != nil {
		return r, err
	}
	if sec, ok := members["section"]; ok {
		if err := checkRuleSection(sec); err != nil {
			return r, err
		}
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	if err := dec.Decode(&r); err != nil {
		return r, fmt.Errorf("has a member of the wrong type: %v", err)
	}
	for name, l := range map[string][]string{"add_labels": r.AddLabels, "remove_labels": r.RemoveLabels} {
		if err := checkRuleLabels(name, l); err != nil {
			return r, err
		}
	}
	if r.Priority != nil && (*r.Priority < 1 || *r.Priority > 4) {
		return r, errors.New("priority must be from 1 (highest) to 4 (lowest)")
	}
	for name, v := range map[string]struct {
		val     *string
		allowed []string
	}{"due": {r.Due, ruleDue}, "start": {r.Start, ruleStart}, "state": {r.State, ruleState}} {
		if v.val != nil && !slices.Contains(v.allowed, *v.val) {
			return r, fmt.Errorf("%s must be one of %v", name, v.allowed)
		}
	}
	return r, nil
}

func checkRuleLabels(name string, l []string) error {
	if len(l) > MaxRuleLabels {
		return fmt.Errorf("%s may hold at most %d label ids", name, MaxRuleLabels)
	}
	for _, id := range l {
		if id == "" || len(id) > MaxIDLen {
			return fmt.Errorf("%s ids must be 1 to %d characters", name, MaxIDLen)
		}
	}
	return nil
}

func checkRuleSection(raw json.RawMessage) error {
	var members map[string]json.RawMessage
	if err := json.Unmarshal(raw, &members); err != nil || members == nil {
		return errors.New(`section must be {"project_id":"…","section_id":"…"|null}`)
	}
	for k := range members {
		if k != "project_id" && k != "section_id" {
			return fmt.Errorf("section allows only project_id and section_id, not %q", k)
		}
	}
	var s RuleSection
	if err := json.Unmarshal(raw, &s); err != nil {
		return errors.New(`section must be {"project_id":"…","section_id":"…"|null}`)
	}
	if s.ProjectID == "" || len(s.ProjectID) > MaxIDLen {
		return fmt.Errorf("section.project_id must be 1 to %d characters", MaxIDLen)
	}
	if s.SectionID != nil && (*s.SectionID == "" || len(*s.SectionID) > MaxIDLen) {
		return fmt.Errorf("section.section_id must be null or 1 to %d characters", MaxIDLen)
	}
	return nil
}

func checkRule(raw json.RawMessage) error {
	_, err := ParseRule(raw)
	return err
}
