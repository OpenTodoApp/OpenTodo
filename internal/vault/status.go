package vault

// A project's status in its file (OpenSpec change project-review-cadence):
// `opentodo-status: maintenance` while the project is in maintenance, the key
// left out while it is active. A value the vault does not know stays in the
// file as written and is never synced; a stored value the vault does not know
// is not written to the file.

const keyStatus = "opentodo-status"

// fileStatus maps a project status onto the opentodo-status value: "" for
// active (the key is left out), maintenance, and "?" for a value the vault
// does not know.
func fileStatus(v string) string {
	switch v {
	case "", "active":
		return ""
	case "maintenance":
		return v
	}
	return "?"
}

// renderedStatus is the opentodo-status a project file gets: none while active
// and for a stored value the vault does not know, and none while the file holds
// an unknown value of its own, which stays as written.
func renderedStatus(stored string, tmpl *Doc) string {
	if s := fileStatus(stored); s != "?" && (tmpl == nil || tmpl.UnknownStatus == "") {
		return s
	}
	return ""
}

// statusEdit pushes an edited opentodo-status as the project's status, merged
// per key like the colour.
func (e *engine) statusEdit(p string, d *Doc, baseStored, appStored string, body func() map[string]any) {
	base := fileStatus(baseStored)
	if base == "?" {
		base = "" // an unknown stored status is not in the file
	}
	if d.UnknownStatus != "" {
		e.rep.warn("%s: %s %q is not a status (maintenance); it is left as it is", p, keyStatus, d.UnknownStatus)
		return
	}
	if d.Status != base && appStored == baseStored {
		v := d.Status
		if v == "" {
			v = "active"
		}
		body()["status"] = v
	}
}
