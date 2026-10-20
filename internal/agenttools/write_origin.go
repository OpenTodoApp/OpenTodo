package agenttools

import (
	"encoding/json"

	"github.com/pixari/opentodo/internal/origin"
)

// Task origins in the write tools (OpenSpec change task-origin, design D4).
// `origin_url` is the assistant-facing argument: an http(s) URL from which the
// origin is derived through internal/origin, never requested. `origin` is the
// whole object as REST sends it (the agent token bridge in
// internal/httpapi/agent_rest.go), validated exactly as the sync path does.

var originURLProp = map[string]any{"type": "string", "maxLength": origin.MaxURL,
	"description": "Optional http(s) URL of the page or issue the task comes from. The server recognises GitHub, GitLab, Jira and Linear issue links (provider and id) and never opens the URL."}

var originURLClearProp = map[string]any{"type": []string{"string", "null"}, "maxLength": origin.MaxURL,
	"description": originURLProp["description"].(string) + " null removes the task's origin."}

// originPatch reads an item's origin_url or origin. It reports the value to
// write and whether one was given; allowNull lets null clear the origin
// (update_tasks), otherwise null means "not given" (create_tasks).
func originPatch(p string, it args, allowNull bool) (json.RawMessage, bool, error) {
	rawURL, hasURL := it["origin_url"]
	rawObj, hasObj := it["origin"]
	if hasURL && hasObj {
		return nil, false, argErr(p + "origin_url: give origin_url or origin, not both")
	}
	switch {
	case hasURL && string(rawURL) == "null", hasObj && string(rawObj) == "null":
		if !allowNull {
			return nil, false, nil
		}
		return nullRaw, true, nil
	case hasURL:
		var s string
		if json.Unmarshal(rawURL, &s) != nil {
			return nil, false, argErr(p + "origin_url: must be a string")
		}
		o, err := origin.FromURL(s, "")
		if err != nil {
			return nil, false, argErr(p + "origin_url: must be an http or https URL")
		}
		return raw(o), true, nil
	case hasObj:
		o, err := origin.Decode(rawObj)
		if err != nil {
			return nil, false, argErr(p + err.Error())
		}
		return raw(o), true, nil
	}
	return nil, false, nil
}
