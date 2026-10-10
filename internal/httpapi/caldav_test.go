package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"
)

// davClient is a calendar app configured with an app password.
type davClient struct {
	e      *env
	email  string
	secret string
	uid    string
	ip     string
}

const davPassword = "correct horse battery"

// davSetup registers the owner, enables CalDAV and creates an app password.
func davSetup(t *testing.T) (*env, *davClient) {
	t.Helper()
	e := newEnv(t, true)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": davPassword})
	e.mustStatus(resp, 201, out)
	uid := out["user"].(map[string]any)["id"].(string)
	resp, out = e.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	e.mustStatus(resp, 200, out)
	return e, newDavClient(e, "owner@example.com", uid)
}

func newDavClient(e *env, email, uid string) *davClient {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/app-passwords", map[string]any{"name": "iPhone"})
	e.mustStatus(resp, 201, out)
	return &davClient{e: e, email: email, secret: out["secret"].(string), uid: uid}
}

func (c *davClient) req(method, path, body string, headers ...string) (*http.Response, string) {
	c.e.t.Helper()
	req, _ := http.NewRequest(method, c.e.srv.URL+path, strings.NewReader(body))
	req.SetBasicAuth(c.email, c.secret)
	if c.ip != "" {
		req.Header.Set("X-Forwarded-For", c.ip)
	}
	if strings.HasPrefix(body, "<?xml") || strings.HasPrefix(body, "<") {
		req.Header.Set("Content-Type", "application/xml; charset=utf-8")
	}
	if strings.HasPrefix(body, "BEGIN:VCALENDAR") {
		req.Header.Set("Content-Type", "text/calendar; charset=utf-8")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp, string(raw)
}

func (c *davClient) must(method, path, body string, want int, headers ...string) (*http.Response, string) {
	c.e.t.Helper()
	resp, out := c.req(method, path, body, headers...)
	if resp.StatusCode != want {
		c.e.t.Fatalf("%s %s: status %d, want %d\n%s", method, path, resp.StatusCode, want, out)
	}
	return resp, out
}

func (c *davClient) cal(cal string) string { return "/dav/calendars/" + c.uid + "/" + cal + "/" }

const propfindCalendars = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/">
  <d:prop><d:resourcetype/><d:displayname/><ic:calendar-color/><c:supported-calendar-component-set/><cs:getctag/><d:sync-token/><d:current-user-privilege-set/></d:prop>
</d:propfind>`

func vtodoBody(uid string, lines ...string) string {
	return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VTODO\r\nUID:" + uid + "\r\nDTSTAMP:20261010T080000Z\r\n" +
		strings.Join(lines, "\r\n") + "\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"
}

func (e *env) task(id string) map[string]any {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, 200, out)
	return out
}

func (e *env) caldavOps(id string) map[string]int {
	e.t.Helper()
	rows, err := e.db.Query(`SELECT field, device FROM ops WHERE entity_id = ?`, id)
	if err != nil {
		e.t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var f, dev string
		_ = rows.Scan(&f, &dev)
		if strings.HasPrefix(dev, "caldav:") {
			out[f]++
		}
	}
	return out
}

var etagRe = regexp.MustCompile(`<d:getetag>([^<]*)</d:getetag>`)

func TestAppPasswordRoutesRequireAuth(t *testing.T) {
	e := newEnv(t, true)
	for _, m := range []string{"GET", "POST"} {
		resp, out := e.do(m, "/api/v1/app-passwords", map[string]any{"name": "x"})
		e.mustStatus(resp, 401, out)
	}
	resp, out := e.do("DELETE", "/api/v1/app-passwords/x", nil)
	e.mustStatus(resp, 401, out)
	resp, out = e.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	e.mustStatus(resp, 401, out)
}

func TestAppPasswordRoutes(t *testing.T) {
	e, c := davSetup(t)
	if !strings.HasPrefix(c.secret, "otap_") {
		t.Fatalf("secret %q", c.secret)
	}
	resp, out := e.do("GET", "/api/v1/app-passwords", nil)
	e.mustStatus(resp, 200, out)
	list := out["appPasswords"].([]any)
	raw, _ := json.Marshal(list)
	if len(list) != 1 || strings.Contains(string(raw), c.secret) {
		t.Fatalf("list %s", raw)
	}
	id := list[0].(map[string]any)["id"].(string)
	// Using it updates the last-use time.
	c.must("PROPFIND", "/dav/", "", 207, "Depth", "0")
	_, out = e.do("GET", "/api/v1/app-passwords", nil)
	if out["appPasswords"].([]any)[0].(map[string]any)["lastUsedAt"] == nil {
		t.Fatal("last use not recorded")
	}
	resp, out = e.do("DELETE", "/api/v1/app-passwords/"+id, nil)
	e.mustStatus(resp, 204, out)
	c.must("PROPFIND", "/dav/", "", 401, "Depth", "0")
	resp, out = e.do("DELETE", "/api/v1/app-passwords/"+id, nil)
	e.mustStatus(resp, 404, out)
}

func TestCaldavSettingForbidsMembers(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.bob.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	se.bob.mustStatus(resp, 403, out)
	if out["error"].(map[string]any)["code"] != "forbidden" {
		t.Fatalf("%v", out)
	}
	resp, out = se.bob.do("GET", "/api/v1/settings/caldav", nil)
	se.bob.mustStatus(resp, 200, out)
	if out["enabled"] != false || !strings.HasSuffix(out["url"].(string), "/dav/") {
		t.Fatalf("setting %v", out)
	}
}

func TestCaldavSettingInvalid400(t *testing.T) {
	e, _ := davSetup(t)
	for _, body := range []any{map[string]any{}, map[string]any{"enabled": "yes"}, "x"} {
		resp, out := e.do("PUT", "/api/v1/settings/caldav", body)
		e.mustStatus(resp, 400, out)
	}
}

func TestDavDisabledIs404(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	for _, p := range []string{"/dav/", "/.well-known/caldav", c.cal("inbox")} {
		resp, _ := c.req("PROPFIND", p, "")
		if resp.StatusCode != 404 || resp.Header.Get("WWW-Authenticate") != "" {
			t.Fatalf("%s: %d %v", p, resp.StatusCode, resp.Header)
		}
	}
	// Enabling takes effect without a restart; the well-known address redirects.
	e.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	resp2, _ := c.req("PROPFIND", "/.well-known/caldav", "")
	if resp2.StatusCode != 301 || resp2.Header.Get("Location") != "/dav/" {
		t.Fatalf("well-known: %d %v", resp2.StatusCode, resp2.Header)
	}
}

func TestDavRejectsAccountPasswordAndTokens(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tokens", map[string]any{"name": "cli"})
	e.mustStatus(resp, 201, out)
	token := out["secret"].(string)
	for _, secret := range []string{davPassword, token, "otap_wrong"} {
		bad := *c
		bad.secret = secret
		resp, _ := bad.req("PROPFIND", "/dav/", "", "Depth", "0")
		if resp.StatusCode != 401 || !strings.Contains(resp.Header.Get("WWW-Authenticate"), "Basic") {
			t.Fatalf("%s: %d", secret[:3], resp.StatusCode)
		}
	}
	// The app password with another email, a session cookie, or a bearer token is refused too.
	wrong := *c
	wrong.email = "other@example.com"
	if resp, _ := wrong.req("PROPFIND", "/dav/", ""); resp.StatusCode != 401 {
		t.Fatalf("wrong email: %d", resp.StatusCode)
	}
	resp, _ = e.do("PROPFIND", "/dav/", nil, "Authorization", "Bearer "+token)
	if resp.StatusCode != 401 {
		t.Fatalf("bearer: %d", resp.StatusCode)
	}
	resp, _ = e.do("PROPFIND", "/dav/", nil) // session cookie only
	if resp.StatusCode != 401 {
		t.Fatalf("cookie: %d", resp.StatusCode)
	}
	// And the app password does not open the REST API.
	req, _ := http.NewRequest("GET", e.srv.URL+"/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+c.secret)
	r2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r2.Body.Close()
	if r2.StatusCode != 401 {
		t.Fatalf("app password on REST: %d", r2.StatusCode)
	}
}

func TestDavRateLimit(t *testing.T) {
	_, c := davSetup(t)
	c.ip = "10.9.9.9"
	bad := *c
	bad.secret = "otap_nope"
	for i := 0; i < 10; i++ {
		if resp, _ := bad.req("PROPFIND", "/dav/", ""); resp.StatusCode != 401 {
			t.Fatalf("attempt %d: %d", i, resp.StatusCode)
		}
	}
	if resp, _ := c.req("PROPFIND", "/dav/", "", "Depth", "0"); resp.StatusCode != 429 {
		t.Fatalf("limit not enforced: %d", resp.StatusCode)
	}
	other := *c
	other.ip = "10.9.9.10"
	other.must("PROPFIND", "/dav/", "", 207, "Depth", "0")
}

func TestDiscoveryListsOwnCalendarsOnly(t *testing.T) {
	se := newShareEnv(t)
	resp, out := se.alice.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	se.alice.mustStatus(resp, 200, out)
	resp, out = se.bob.do("POST", "/api/v1/projects", map[string]any{"name": "Bob private", "color": "#ff0000"})
	se.bob.mustStatus(resp, 201, out)
	bobProject := out["id"].(string)
	c := newDavClient(se.alice, "alice@example.com", se.ids["alice"])

	_, body := c.must("PROPFIND", "/dav/", `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`, 207, "Depth", "0")
	if !strings.Contains(body, "/dav/principals/"+c.uid+"/") {
		t.Fatalf("principal: %s", body)
	}
	_, body = c.must("PROPFIND", "/dav/principals/"+c.uid+"/", `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/><c:calendar-user-address-set/></d:prop></d:propfind>`, 207, "Depth", "0")
	if !strings.Contains(body, "/dav/calendars/"+c.uid+"/") || !strings.Contains(body, "mailto:alice@example.com") {
		t.Fatalf("home set: %s", body)
	}
	_, body = c.must("PROPFIND", "/dav/calendars/"+c.uid+"/", propfindCalendars, 207, "Depth", "1")
	for _, want := range []string{c.cal("inbox"), c.cal(se.project), "<d:displayname>Inbox</d:displayname>", "<d:displayname>Home</d:displayname>",
		`<c:comp name="VTODO"/>`, "<cs:getctag>urn:opentodo:sync:", "<c:calendar/>"} {
		if !strings.Contains(body, want) {
			t.Fatalf("listing lacks %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, bobProject) || strings.Contains(body, "Bob private") {
		t.Fatalf("foreign project listed: %s", body)
	}
	// Other users' trees answer 404.
	c.must("PROPFIND", "/dav/calendars/"+se.ids["bob"]+"/", propfindCalendars, 404, "Depth", "1")
	c.must("PROPFIND", "/dav/calendars/"+c.uid+"/"+bobProject+"/", propfindCalendars, 404, "Depth", "0")

	// A shared project appears for a viewer, read-only.
	se.share(se.alice, "bob@example.com", "viewer")
	bc := newDavClient(se.bob, "bob@example.com", se.ids["bob"])
	_, body = bc.must("PROPFIND", bc.cal(se.project), propfindCalendars, 207, "Depth", "1")
	if !strings.Contains(body, "<d:displayname>Home</d:displayname>") || strings.Contains(body, "<d:write-content/>") || !strings.Contains(body, "<d:read/>") {
		t.Fatalf("viewer calendar: %s", body)
	}
	bc.must("PUT", bc.cal(se.project)+"new.ics", vtodoBody("new", "SUMMARY:x"), 403)
	bc.must("DELETE", bc.cal(se.project)+se.task+".ics", "", 403)
	if e := se.alice.task(se.task); e["deleted_at"] != nil {
		t.Fatal("viewer deleted")
	}
}

func TestArchivedProjectHidden(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Old"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	_, body := c.must("PROPFIND", "/dav/calendars/"+c.uid+"/", propfindCalendars, 207, "Depth", "1")
	if !strings.Contains(body, pid) {
		t.Fatal("project missing")
	}
	resp, out = e.do("PATCH", "/api/v1/projects/"+pid, map[string]any{"archived": true})
	e.mustStatus(resp, 200, out)
	_, body = c.must("PROPFIND", "/dav/calendars/"+c.uid+"/", propfindCalendars, 207, "Depth", "1")
	if strings.Contains(body, pid) {
		t.Fatal("archived project listed")
	}
	c.must("PROPFIND", c.cal(pid), propfindCalendars, 404, "Depth", "0")
}

func TestPutCreatesTaskViaOps(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	uid := "5F1D3A2C-8E4B-4B7A-9C11-0A2B3C4D5E6F"
	body := vtodoBody(uid, "SUMMARY:Water the tomatoes", "DUE:20261011T093000", "PRIORITY:5", "CATEGORIES:Outside,Garden",
		"BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "END:VALARM")
	resp2, _ := c.must("PUT", c.cal(pid)+uid+".ics", body, 201, "If-None-Match", "*")
	if resp2.Header.Get("ETag") == "" {
		t.Fatal("no ETag on create")
	}
	task := e.task(uid)
	if task["title"] != "Water the tomatoes" || task["project_id"] != pid || task["priority"].(float64) != 2 {
		t.Fatalf("task %v", task)
	}
	if d := task["due"].(map[string]any); d["date"] != "2026-10-11" || d["time"] != "09:30" || d["tz"] != nil {
		t.Fatalf("due %v", d)
	}
	if !strings.Contains(task["ical_extra"].(string), "BEGIN:VALARM") || len(task["labels"].([]any)) != 2 {
		t.Fatalf("extra/labels %v", task)
	}
	// Every field came from an op written by the caldav device.
	ops := e.caldavOps(uid)
	for _, f := range []string{"title", "due", "priority", "project_id", "labels", "ical_extra", "created_at", "completed_at", "deleted_at"} {
		if ops[f] != 1 {
			t.Fatalf("ops for %s = %d (%v)", f, ops[f], ops)
		}
	}
	// Other devices receive it on their next sync.
	got, _, _ := syncAll(e, "phone", 0)
	if !strings.Contains(fmt.Sprint(got), "Water the tomatoes") {
		t.Fatal("device did not receive the task")
	}
	// GET serves it back: priority 5, floating due, the alarm and the labels.
	_, ics := c.must("GET", c.cal(pid)+uid+".ics", "", 200)
	for _, want := range []string{"PRIORITY:5", "DUE:20261011T093000\r\n", "BEGIN:VALARM", "CATEGORIES:Outside,Garden", "UID:" + uid} {
		if !strings.Contains(ics, want) {
			t.Fatalf("GET lacks %q:\n%s", want, ics)
		}
	}
	// A second PUT with If-None-Match: * on the existing resource is refused.
	c.must("PUT", c.cal(pid)+uid+".ics", body, 412, "If-None-Match", "*")
}

func TestPutWithForeignNameAndUID(t *testing.T) {
	e, c := davSetup(t)
	uid := "040000008200E00074C5B7101A82E008@example.com:very-long-uid-that-does-not-fit-into-an-id-at-all"
	c.must("PUT", c.cal("inbox")+"client-name.ics", vtodoBody(uid, "SUMMARY:Odd"), 201)
	_, body := c.must("PROPFIND", c.cal("inbox"), `<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`, 207, "Depth", "1")
	if !strings.Contains(body, c.cal("inbox")+"client-name.ics") {
		t.Fatalf("resource not under the client's name: %s", body)
	}
	_, ics := c.must("GET", c.cal("inbox")+"client-name.ics", "", 200)
	if !strings.Contains(ics, "UID:040000008200E00074C5B7101A82E008@example.com:very-long") {
		t.Fatalf("UID not kept: %s", ics)
	}
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
}

func TestPutEmitsOnlyChangedFields(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "DESCRIPTION:notes", "PRIORITY:1"), 201)
	before := e.caldavOps("t1")
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	// The client writes back what it got with only the summary changed.
	edited := strings.Replace(ics, "SUMMARY:A", "SUMMARY:B", 1)
	c.must("PUT", c.cal("inbox")+"t1.ics", edited, 204)
	after := e.caldavOps("t1")
	for f, n := range after {
		if f == "title" {
			if n != before[f]+1 {
				t.Fatalf("title ops %d -> %d", before[f], n)
			}
		} else if n != before[f] {
			t.Fatalf("field %s written again (%d -> %d)", f, before[f], n)
		}
	}
	if e.task("t1")["title"] != "B" {
		t.Fatal("title not changed")
	}
	// An identical PUT writes nothing.
	_, ics = c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	c.must("PUT", c.cal("inbox")+"t1.ics", ics, 204)
	if fmt.Sprint(e.caldavOps("t1")) != fmt.Sprint(after) {
		t.Fatal("identical PUT wrote ops")
	}
}

func TestStaleIfMatch412(t *testing.T) {
	e, c := davSetup(t)
	resp, _ := c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A"), 201)
	etag := resp.Header.Get("ETag")
	// A device edits the task.
	r, out := e.do("PATCH", "/api/v1/tasks/t1", map[string]any{"title": "From the app"})
	e.mustStatus(r, 200, out)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:From the phone"), 412, "If-Match", etag)
	if e.task("t1")["title"] != "From the app" {
		t.Fatal("stale write applied")
	}
	resp, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "SUMMARY:From the app") || resp.Header.Get("ETag") == etag {
		t.Fatal("GET does not return the device version with a new ETag")
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Now"), 204, "If-Match", resp.Header.Get("ETag"))
	c.must("PUT", c.cal("inbox")+"missing.ics", vtodoBody("missing", "SUMMARY:x"), 412, "If-Match", `"abc"`)
}

func TestConcurrentFieldEditsConverge(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "DUE;VALUE=DATE:20261011", "PRIORITY:9"), 201)
	_, cursor, _ := syncAll(e, "laptop", 0)
	offlineTS := time.Now().UnixMilli()
	// CalDAV moves the due date...
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "DUE;VALUE=DATE:20261020", "PRIORITY:9"), 204)
	// ...while the laptop changed the priority offline, and syncs later.
	op := syncOp("op-prio", "task", "t1", "priority", 1)
	op["ts"], op["device"] = offlineTS, "laptop"
	syncOnce(e, "laptop", cursor, []map[string]any{op})
	task := e.task("t1")
	if task["priority"].(float64) != 1 || task["due"].(map[string]any)["date"] != "2026-10-20" {
		t.Fatalf("not converged: %v", task)
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "PRIORITY:1\r\n") || !strings.Contains(ics, "DUE;VALUE=DATE:20261020") {
		t.Fatalf("CalDAV view not converged:\n%s", ics)
	}
}

func TestDeleteIsTombstone(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A"), 201)
	c.must("DELETE", c.cal("inbox")+"t1.ics", "", 204)
	c.must("GET", c.cal("inbox")+"t1.ics", "", 404)
	c.must("DELETE", c.cal("inbox")+"t1.ics", "", 404)
	if e.caldavOps("t1")["deleted_at"] != 2 {
		t.Fatal("tombstone not written as an op")
	}
	resp, out := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	found := false
	for _, task := range out["tasks"].([]any) {
		if m := task.(map[string]any); m["id"] == "t1" && m["deleted_at"] != nil {
			found = true
		}
	}
	if !found {
		t.Fatal("deleted task missing from export")
	}
}

func TestLaterReopenWinsOverCaldavComplete(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A"), 201)
	_, cursor, _ := syncAll(e, "laptop", 0)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "STATUS:COMPLETED", "COMPLETED:20261010T080000Z"), 204)
	if e.task("t1")["completed_at"] == nil {
		t.Fatal("not completed")
	}
	// Completed tasks stay listed.
	_, body := c.must("PROPFIND", c.cal("inbox"), `<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`, 207, "Depth", "1")
	if !strings.Contains(body, "t1.ics") {
		t.Fatal("completed task not listed")
	}
	// An offline device reopens it with a later timestamp: the later op wins.
	op := syncOp("op-reopen", "task", "t1", "completed_at", nil)
	op["ts"], op["device"] = time.Now().UnixMilli()+1000, "laptop"
	syncOnce(e, "laptop", cursor, []map[string]any{op})
	if e.task("t1")["completed_at"] != nil {
		t.Fatal("later reopen lost")
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "STATUS:NEEDS-ACTION") {
		t.Fatalf("not reopened for CalDAV: %s", ics)
	}
	// Reopening from the client clears completed_at.
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "STATUS:COMPLETED"), 204)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A", "STATUS:NEEDS-ACTION"), 204)
	if e.task("t1")["completed_at"] != nil {
		t.Fatal("client reopen ignored")
	}
}

func TestRecurringCompletionMovesSeries(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"r1.ics", vtodoBody("r1", "SUMMARY:Water", "DUE;VALUE=DATE:20261012", "RRULE:FREQ=WEEKLY"), 201)
	task := e.task("r1")
	if task["recurrence"] != "every week" {
		t.Fatalf("rule %v", task["recurrence"])
	}
	_, ics := c.must("GET", c.cal("inbox")+"r1.ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=WEEKLY") || !strings.Contains(ics, "DTSTART;VALUE=DATE:20261012") {
		t.Fatalf("rule not served: %s", ics)
	}
	// "after completion" survives a client round trip of the plain RRULE.
	r, out := e.do("PATCH", "/api/v1/tasks/r1", map[string]any{"recurrence": "every week after completion"})
	e.mustStatus(r, 200, out)
	_, ics = c.must("GET", c.cal("inbox")+"r1.ics", "", 200)
	c.must("PUT", c.cal("inbox")+"r1.ics", strings.Replace(ics, "SUMMARY:Water", "SUMMARY:Water plants", 1), 204)
	if task := e.task("r1"); task["recurrence"] != "every week after completion" || task["title"] != "Water plants" {
		t.Fatalf("rule lost on round trip: %v", task)
	}
	e.do("PATCH", "/api/v1/tasks/r1", map[string]any{"recurrence": "every week"})
	// Completing from the client records the occurrence and moves the series.
	_, ics = c.must("GET", c.cal("inbox")+"r1.ics", "", 200)
	done := strings.Replace(ics, "STATUS:NEEDS-ACTION", "STATUS:COMPLETED\r\nCOMPLETED:20261012T090000Z", 1)
	c.must("PUT", c.cal("inbox")+"r1.ics", done, 204)
	task = e.task("r1")
	if task["completed_at"] != nil || task["due"].(map[string]any)["date"] == "2026-10-12" {
		t.Fatalf("series did not move: %v", task)
	}
	// An RRULE the grammar cannot express is kept as client data.
	c.must("PUT", c.cal("inbox")+"r2.ics", vtodoBody("r2", "SUMMARY:Pills", "RRULE:FREQ=HOURLY;INTERVAL=8"), 201)
	if task := e.task("r2"); task["recurrence"] != nil || !strings.Contains(task["ical_extra"].(string), "RRULE:FREQ=HOURLY;INTERVAL=8") {
		t.Fatalf("unmapped rule: %v", task)
	}
}

func TestInvalidCalendarData(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"x.ics", "BEGIN:VCALENDAR\r\nnot really", 415)
	c.must("PUT", c.cal("inbox")+"x.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", 403)
	_, body := c.must("PUT", c.cal("inbox")+"x.ics", "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nSUMMARY:x\r\nEND:VTODO\r\nEND:VCALENDAR\r\n", 403)
	if !strings.Contains(body, "valid-calendar-object-resource") {
		t.Fatalf("precondition element missing: %s", body)
	}
	c.must("PUT", c.cal("inbox")+"x.ics", vtodoBody("x", "SUMMARY:x"), 415, "Content-Type", "application/json")
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE device LIKE 'caldav:%'`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d ops written", n)
	}
}

func TestMovingBetweenCalendars(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A"), 201)
	// A client moves by PUT into the new calendar, then DELETE of the old resource.
	c.must("PUT", c.cal(pid)+"t1.ics", vtodoBody("t1", "SUMMARY:A"), 204)
	c.must("DELETE", c.cal("inbox")+"t1.ics", "", 404)
	if task := e.task("t1"); task["project_id"] != pid || task["deleted_at"] != nil {
		t.Fatalf("move: %v", task)
	}
}

func TestMoveIntoSharedProjectCopies(t *testing.T) {
	se := newShareEnv(t)
	se.alice.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	se.share(se.alice, "bob@example.com", "editor")
	bc := newDavClient(se.bob, "bob@example.com", se.ids["bob"])
	bc.must("PUT", bc.cal("inbox")+"mine.ics", vtodoBody("mine", "SUMMARY:Bring wine"), 201)
	bc.must("PUT", bc.cal(se.project)+"mine.ics", vtodoBody("mine", "SUMMARY:Bring wine"), 204)
	if t1, _ := se.alice.sync.Get(context.Background(), se.ids["bob"], "task", "mine"); t1 == nil || !t1.Deleted() {
		t.Fatal("original not tombstoned")
	}
	_, ics := bc.must("GET", bc.cal(se.project)+"mine.ics", "", 200)
	if !strings.Contains(ics, "UID:mine\r\n") || !strings.Contains(ics, "SUMMARY:Bring wine") {
		t.Fatalf("copy not served under the client's UID: %s", ics)
	}
	// Alice sees the copy in the shared project.
	resp, out := se.alice.do("GET", "/api/v1/tasks", nil)
	se.alice.mustStatus(resp, 200, out)
	if !strings.Contains(fmt.Sprint(out), "Bring wine") {
		t.Fatal("copy not visible to the owner")
	}
}

func TestEtagChangesOnDeviceEdit(t *testing.T) {
	e, c := davSetup(t)
	resp, _ := c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:A"), 201)
	first := resp.Header.Get("ETag")
	resp, _ = c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if resp.Header.Get("ETag") != first {
		t.Fatal("ETag of PUT and GET differ")
	}
	op := syncOp("op1", "task", "t1", "description", "from the laptop")
	syncOnce(e, "laptop", 0, []map[string]any{op})
	resp, _ = c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if resp.Header.Get("ETag") == first {
		t.Fatal("ETag unchanged after a device edit")
	}
}

const syncReport = `<?xml version="1.0" encoding="utf-8"?>
<d:sync-collection xmlns:d="DAV:"><d:sync-token>%s</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`

var tokenRe = regexp.MustCompile(`<d:sync-token>([^<]*)</d:sync-token>`)

func TestSyncCollectionReportsRemoved(t *testing.T) {
	e, c := davSetup(t)
	for _, id := range []string{"a", "b", "c", "d"} {
		c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:"+id), 201)
	}
	_, body := c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
	if strings.Count(body, "<d:getetag>") != 4 {
		t.Fatalf("initial sync: %s", body)
	}
	tok := tokenRe.FindStringSubmatch(body)[1]
	// Two tasks change, one is deleted, one moves to another calendar.
	e.do("PATCH", "/api/v1/tasks/a", map[string]any{"title": "a2"})
	c.must("PUT", c.cal("inbox")+"b.ics", vtodoBody("b", "SUMMARY:b2"), 204)
	e.do("DELETE", "/api/v1/tasks/c", nil)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Elsewhere"})
	e.mustStatus(resp, 201, out)
	e.do("PATCH", "/api/v1/tasks/d", map[string]any{"project_id": out["id"]})
	_, body = c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, tok), 207, "Depth", "1")
	for _, want := range []string{"/a.ics</d:href><d:propstat>", "/b.ics</d:href><d:propstat>", "/c.ics</d:href><d:status>HTTP/1.1 404", "/d.ics</d:href><d:status>HTTP/1.1 404"} {
		if !strings.Contains(body, want) {
			t.Fatalf("sync lacks %q:\n%s", want, body)
		}
	}
	tok2 := tokenRe.FindStringSubmatch(body)[1]
	if tok2 == tok {
		t.Fatal("token did not advance")
	}
	_, body = c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, tok2), 207, "Depth", "1")
	if strings.Contains(body, "<d:response>") {
		t.Fatalf("nothing changed but: %s", body)
	}
	// A purge is reported as removed too.
	e.do("DELETE", "/api/v1/tasks/a", nil)
	_, body = c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, tok2), 207, "Depth", "1")
	tok3 := tokenRe.FindStringSubmatch(body)[1]
	resp, out = e.do("DELETE", "/api/v1/tasks/a/purge", nil)
	e.mustStatus(resp, 200, out)
	_, body = c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, tok3), 207, "Depth", "1")
	if !strings.Contains(body, "/a.ics</d:href><d:status>HTTP/1.1 404") || tokenRe.FindStringSubmatch(body)[1] == tok3 {
		t.Fatalf("purge not reported: %s", body)
	}
	// Bad and future tokens are refused.
	c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, "urn:opentodo:sync:999999"), 403, "Depth", "1")
	c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, "garbage"), 403, "Depth", "1")
}

func TestCalendarQueryTimeRange(t *testing.T) {
	_, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"oct.ics", vtodoBody("oct", "SUMMARY:Oct", "DUE;VALUE=DATE:20261015"), 201)
	c.must("PUT", c.cal("inbox")+"dec.ics", vtodoBody("dec", "SUMMARY:Dec", "DUE:20261215T100000"), 201)
	c.must("PUT", c.cal("inbox")+"none.ics", vtodoBody("none", "SUMMARY:Someday"), 201)
	query := `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"><c:time-range start="20261001T000000Z" end="20261101T000000Z"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
	_, body := c.must("REPORT", c.cal("inbox"), query, 207, "Depth", "1")
	if !strings.Contains(body, "oct.ics") || strings.Contains(body, "dec.ics") || !strings.Contains(body, "none.ics") || !strings.Contains(body, "SUMMARY:Oct") {
		t.Fatalf("time-range: %s", body)
	}
	multiget := `<?xml version="1.0"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>
<d:href>` + c.cal("inbox") + `dec.ics</d:href><d:href>` + c.cal("inbox") + `gone.ics</d:href></c:calendar-multiget>`
	_, body = c.must("REPORT", c.cal("inbox"), multiget, 207, "Depth", "1")
	if !strings.Contains(body, "SUMMARY:Dec") || !strings.Contains(body, "gone.ics</d:href><d:status>HTTP/1.1 404") || len(etagRe.FindAllString(body, -1)) != 1 {
		t.Fatalf("multiget: %s", body)
	}
}

func TestMkcalendarCreatesProject(t *testing.T) {
	e, c := davSetup(t)
	mk := `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/">
<d:set><d:prop><d:displayname>Garden</d:displayname><ic:calendar-color>#34C759FF</ic:calendar-color>
<c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`
	c.must("MKCALENDAR", c.cal("B2C7A3F0-1111-4222-8333-944455556666"), mk, 201)
	p := e.do
	resp, out := p("GET", "/api/v1/projects/B2C7A3F0-1111-4222-8333-944455556666", nil)
	e.mustStatus(resp, 200, out)
	if out["name"] != "Garden" || out["color"] != "#34c759" {
		t.Fatalf("project %v", out)
	}
	c.must("MKCALENDAR", c.cal("B2C7A3F0-1111-4222-8333-944455556666"), mk, 405)
	events := strings.Replace(mk, `name="VTODO"`, `name="VEVENT"`, 1)
	c.must("MKCALENDAR", c.cal("events-only"), events, 403)
	// PROPPATCH renames and recolours.
	pp := `<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:ic="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>Allotment</d:displayname><ic:calendar-color>#ff0000</ic:calendar-color></d:prop></d:set></d:propertyupdate>`
	_, body := c.must("PROPPATCH", c.cal("B2C7A3F0-1111-4222-8333-944455556666"), pp, 207)
	if !strings.Contains(body, "200 OK") {
		t.Fatalf("proppatch: %s", body)
	}
	_, out = p("GET", "/api/v1/projects/B2C7A3F0-1111-4222-8333-944455556666", nil)
	if out["name"] != "Allotment" || out["color"] != "#ff0000" {
		t.Fatalf("after proppatch %v", out)
	}
}

func TestDeleteCalendarMovesTasksToInbox(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	c.must("PUT", c.cal(pid)+"open.ics", vtodoBody("open", "SUMMARY:Open"), 201)
	c.must("PUT", c.cal(pid)+"done.ics", vtodoBody("done", "SUMMARY:Done", "STATUS:COMPLETED"), 201)
	c.must("DELETE", c.cal(pid), "", 204)
	if p, _ := e.sync.Get(context.Background(), c.uid, "project", pid); p == nil || !p.Deleted() {
		t.Fatal("project not soft-deleted")
	}
	if e.task("open")["project_id"] != nil {
		t.Fatal("open task not moved to the Inbox")
	}
	c.must("GET", c.cal("inbox")+"open.ics", "", 200)
}

func TestInboxProtected(t *testing.T) {
	_, c := davSetup(t)
	c.must("DELETE", c.cal("inbox"), "", 403)
	pp := `<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:"><d:set><d:prop><d:displayname>Mine</d:displayname></d:prop></d:set></d:propertyupdate>`
	_, body := c.must("PROPPATCH", c.cal("inbox"), pp, 207)
	if !strings.Contains(body, "403 Forbidden") {
		t.Fatalf("inbox rename: %s", body)
	}
	_, body = c.must("PROPFIND", c.cal("inbox"), propfindCalendars, 207, "Depth", "0")
	if !strings.Contains(body, "<d:displayname>Inbox</d:displayname>") {
		t.Fatal("inbox renamed")
	}
}

func TestOptionsAdvertisesCalendarAccess(t *testing.T) {
	_, c := davSetup(t)
	resp, _ := c.must("OPTIONS", "/dav/", "", 200)
	if !strings.Contains(resp.Header.Get("DAV"), "calendar-access") || !strings.Contains(resp.Header.Get("Allow"), "REPORT") {
		t.Fatalf("headers %v", resp.Header)
	}
}

func TestDeactivatedAccountLosesCaldav(t *testing.T) {
	se := newShareEnv(t)
	se.alice.do("PUT", "/api/v1/settings/caldav", map[string]any{"enabled": true})
	bc := newDavClient(se.bob, "bob@example.com", se.ids["bob"])
	bc.must("PROPFIND", "/dav/", "", 207, "Depth", "0")
	resp, out := se.alice.do("POST", "/api/v1/users/"+se.ids["bob"]+"/deactivate", nil)
	se.alice.mustStatus(resp, 200, out)
	bc.must("PROPFIND", "/dav/", "", 401, "Depth", "0")
}
