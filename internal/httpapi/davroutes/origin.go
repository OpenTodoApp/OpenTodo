package davroutes

import (
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/origin"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// caldavProvider marks an origin a CalDAV URL set, so a later URL may update it.
const caldavProvider = "caldav"

// originWrite maps a VTODO URL that is a link into another app (OpenSpec change
// app-links, design D5; Tasks CalDAV Sync for Obsidian sends its backlink so) to
// the task's origin: it becomes the origin of a task that has none, and a later
// URL updates an origin CalDAV set. Any other origin, and any http(s) URL, is
// left alone: the URL line stays client data either way.
func originWrite(f map[string]json.RawMessage, in *caldav.Inbound, current opsync.Entity) {
	if !origin.IsAppLink(in.URL) {
		return
	}
	if cur, ok := current["origin"]; ok && string(cur) != "null" {
		o, err := origin.Decode(cur)
		if err != nil || o.Kind != origin.KindURL || o.Provider != caldavProvider || o.URL == in.URL {
			return
		}
	}
	f["origin"] = mustJSON(origin.Origin{Kind: origin.KindURL, Provider: caldavProvider, URL: in.URL})
}
