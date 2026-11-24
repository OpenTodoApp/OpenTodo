package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
)

// Feature switches per workspace (OpenSpec change workspace-feature-switches,
// design D1, D2). A workspace's `features` column holds a JSON object of
// booleans; NULL and a missing key read as on. The map is directory data like the
// name: it changes only through UpdateWorkspace, never through the op log, and
// only hides things on devices (no read or write path here checks it).

// WorkspaceFeatures are the switchable feature ids, in Settings order. The web's
// web/src/lib/features.ts lists the same ids (TestWorkspaceFeaturesMatchWeb).
var WorkspaceFeatures = []string{"notes", "calendar", "habits", "time-tracking", "focus", "routines", "weekly-review", "locations"}

// ValidWorkspaceFeature reports whether id is a known feature id.
func ValidWorkspaceFeature(id string) bool { return slices.Contains(WorkspaceFeatures, id) }

// checkFeatures refuses keys that are not known ids, naming the first one in
// sorted order, so a typo never stores silently.
func checkFeatures(in map[string]bool) error {
	keys := make([]string, 0, len(in))
	for k := range in {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	for _, k := range keys {
		if !ValidWorkspaceFeature(k) {
			return fmt.Errorf("%w: features: unknown feature %q", ErrInvalidInput, k)
		}
	}
	return nil
}

// parseFeatures reads a stored column: NULL, empty or unreadable is the empty
// map (every feature on). Stored keys this server does not know are kept.
func parseFeatures(raw sql.NullString) map[string]bool {
	out := map[string]bool{}
	if raw.Valid && raw.String != "" {
		_ = json.Unmarshal([]byte(raw.String), &out)
	}
	return out
}

// mergeFeatures writes the changed keys into the workspace's stored map in the
// caller's transaction: per key, so two managers switching different features
// both keep their change, and keys the server does not know stay.
func mergeFeatures(ctx context.Context, tx *sql.Tx, wsID string, change map[string]bool) error {
	if len(change) == 0 {
		return nil
	}
	var raw sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT features FROM workspaces WHERE id = ?`, wsID).Scan(&raw); err != nil {
		return err
	}
	stored := parseFeatures(raw)
	for k, v := range change {
		stored[k] = v
	}
	b, err := json.Marshal(stored)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE workspaces SET features = ? WHERE id = ?`, string(b), wsID)
	return err
}
