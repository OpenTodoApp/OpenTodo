package httpapi

import "testing"

// TestStorageRoute (op-log-compaction 3.3): only the owner reads the database
// storage; members and admins are refused, as is the public demo.
func TestStorageRoute(t *testing.T) {
	e := ownerEnv(t)
	out := e.expect("GET", "/api/v1/settings/storage", nil, 200, "")
	for _, k := range []string{"database_bytes", "free_bytes", "wal_bytes", "conversion", "last_compaction"} {
		if _, ok := out[k]; !ok {
			t.Fatalf("missing %s in %v", k, out)
		}
	}
	if out["database_bytes"].(float64) <= 0 || out["conversion"] != "done" || out["last_compaction"] != nil {
		t.Fatalf("storage = %v", out)
	}
	admin, adminID := e.joinAs("admin@example.com")
	member, _ := e.joinAs("member@example.com")
	e.expect("PUT", "/api/v1/users/"+adminID+"/role", map[string]string{"role": "admin"}, 200, "")
	admin.expect("GET", "/api/v1/settings/storage", nil, 403, "forbidden")
	member.expect("GET", "/api/v1/settings/storage", nil, 403, "forbidden")
	newClientAt(e, "10.9.9.8").expect("GET", "/api/v1/settings/storage", nil, 401, "unauthorized")

	d := newDemoServer(t)
	v, _ := d.visitor()
	v.expect("GET", "/api/v1/settings/storage", nil, 403, "demo_restricted")
}
