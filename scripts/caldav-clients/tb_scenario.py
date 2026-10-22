"""Thunderbird scenario: every behaviour column of docs/caldav.md's verification table.

Thunderbird runs headless; the steps call its CalDAV provider through the same
item APIs its task tree and task dialog use (clone, set fields, modifyItem with
prepareSequence). Server state is read back through the REST API.
"""
import json, sys, time
import ot

run = ot.tb()
R = {}  # column -> list of (check, ok, detail)


def check(col, name, ok, detail=""):
    R.setdefault(col, []).append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + col + ": " + name + ("  -- " + str(detail) if detail and not ok else ""), flush=True)


def tb(js):
    return run("const c = otCal();\n" + js)


def refresh():
    tb("await otRefresh(c); resolve(true);")


def item(title):
    return tb(f"await otRefresh(c); resolve(summary(await otFind(c, {json.dumps(title)})));")


def modify(title, mutate_js):
    """Clone the item, apply `mutate_js` to `n`, save it like a modify transaction."""
    return tb(f"""
await otRefresh(c);
const o = await otFind(c, {json.dumps(title)});
const n = o.clone();
{mutate_js}
const saved = await c.modifyItem(cal.itip.prepareSequence(n, o), o);
resolve(summary(saved));""")


def add(js):
    return tb(f"""
const n = new CalTodo();
{js}
const saved = await c.addItem(n);
resolve(summary(saved));""")


def mk(body):
    return ot.api("POST", "/api/v1/tasks", body)


# ---------------------------------------------------------------- Due forms
a = mk({"title": "TB date", "due": {"date": "2026-11-10"}})
b = mk({"title": "TB floating", "due": {"date": "2026-11-10", "time": "10:30"}})
z = mk({"title": "TB zoned", "due": {"date": "2026-11-10", "time": "14:00", "tz": "America/New_York"}})
ia, ib, iz = item("TB date"), item("TB floating"), item("TB zoned")
check("due", "date served as a date", ia["due"] == "20261110 date floating", ia["due"])
check("due", "floating time served floating", ib["due"].startswith("20261110T103000") and "floating" in ib["due"], ib["due"])
check("due", "zoned time keeps its zone", iz["due"].startswith("20261110T140000") and "America/New_York" in iz["due"], iz["due"])
for t, title in ((a, "TB date"), (b, "TB floating"), (z, "TB zoned")):
    modify(title, f'n.title = {json.dumps(title + " edited")};')
    after = ot.task(t["id"])
    check("due", f"{title}: a title edit keeps the due", after["due"] == t["due"] and after["title"] == title + " edited", (t["due"], after["due"]))
# The task dialog writes times in the default zone (calendar-item-iframe.js dateTimeControls2State).
modify("TB floating edited", 'n.dueDate = dt("20261110T113000", "Europe/Berlin"); if (n.entryDate) n.entryDate = dt("20261110T113000", "Europe/Berlin");')
after = ot.task(b["id"])
check("due", "dialog edit of a floating time (written in Europe/Berlin)", after["due"] == {"date": "2026-11-10", "time": "11:30", "tz": "Europe/Berlin"}, after["due"])

# ---------------------------------------------------------------- Deadline
d = mk({"title": "TB deadline", "due": {"date": "2026-11-12"}, "deadline": "2026-11-14"})
idl = item("TB deadline")
check("deadline", "served: DTSTART = due, DUE = deadline", idl["entry"].startswith("20261112 date") and idl["due"].startswith("20261114 date"), (idl["entry"], idl["due"]))
modify("TB deadline", 'n.title = "TB deadline edited";')
after = ot.task(d["id"])
check("deadline", "a title edit keeps due and deadline", after["due"] == {"date": "2026-11-12"} and after["deadline"] == "2026-11-14", (after["due"], after["deadline"]))
modify("TB deadline edited", 'n.dueDate = dt("20261116");')
after = ot.task(d["id"])
check("deadline", "changing Due in Thunderbird moves the deadline", after["deadline"] == "2026-11-16" and after["due"] == {"date": "2026-11-12"}, (after["due"], after["deadline"]))
add('n.title = "TB new start+due"; n.entryDate = dt("20261118"); n.dueDate = dt("20261120");')
t = ot.by_title("TB new start+due")[0]
check("deadline", "a new task with Start and Due: due from Start, deadline from Due", t["due"] == {"date": "2026-11-18"} and t["deadline"] == "2026-11-20", (t["due"], t["deadline"]))

# ---------------------------------------------------------------- Date shapes
add('n.title = "TB due only"; n.dueDate = dt("20261119T090000", "Europe/Berlin");')
t = ot.by_title("TB due only")[0]
check("shapes", "Due only sets the due date (zoned Berlin)", t["due"] == {"date": "2026-11-19", "time": "09:00", "tz": "Europe/Berlin"} and not t.get("deadline"), t["due"])
add('n.title = "TB start only"; n.entryDate = dt("20261121");')
t = ot.by_title("TB start only")[0]
check("shapes", "Start alone sets nothing and is kept", t["due"] is None and "DTSTART" in (t.get("ical_extra") or ""), (t["due"], t.get("ical_extra")))
i = item("TB start only")
check("shapes", "Start alone comes back unchanged", i["entry"] and i["entry"].startswith("20261121"), i["entry"])
add('n.title = "TB no dates";')
t = ot.by_title("TB no dates")[0]
check("shapes", "no dates: no due", t["due"] is None, t["due"])
# A timed task is served with Start = Due; clearing only Due leaves the served
# Start, which alone sets nothing ("DTSTART alone" in docs/caldav.md).
modify("TB due only", "n.dueDate = null;")
t = ot.by_title("TB due only")[0]
check("shapes", "clearing only Due keeps the due (Start alone, as documented)", t["due"] == {"date": "2026-11-19", "time": "09:00", "tz": "Europe/Berlin"}, t["due"])
modify("TB due only", "n.dueDate = null; n.entryDate = null;")
t = ot.by_title("TB due only")[0]
check("shapes", "clearing Start and Due clears the due date", t["due"] is None, t["due"])

# ---------------------------------------------------------------- Estimates
e = mk({"title": "TB estimate", "due": {"date": "2026-11-13", "time": "09:00"}, "estimate_minutes": 90})
ie = item("TB estimate")
check("estimate", "served as ESTIMATED-DURATION PT1H30M", "ESTIMATED-DURATION:PT1H30M" in ie["ics"], ie["ics"])
modify("TB estimate", 'n.title = "TB estimate edited";')
after = ot.task(e["id"])
check("estimate", "kept through a Thunderbird save", after["estimate_minutes"] == 90, after["estimate_minutes"])
modify("TB estimate edited", 'n.setProperty("ESTIMATED-DURATION", "PT45M");')
after = ot.task(e["id"])
check("estimate", "a changed ESTIMATED-DURATION updates the estimate", after["estimate_minutes"] == 45, after["estimate_minutes"])

# ---------------------------------------------------------------- Alarms both ways
add('''n.title = "TB alarm"; n.dueDate = dt("20261125T100000", "Europe/Berlin");
const a = new CalAlarm(); a.related = Ci.calIAlarm.ALARM_RELATED_END; a.offset = cal.createDuration("-PT15M"); a.action = "DISPLAY"; n.addAlarm(a);''')
t = ot.by_title("TB alarm")[0]
rs = ot.reminders(t["id"])
check("alarms", "an alarm added in Thunderbird becomes a reminder", len(rs) == 1 and rs[0]["kind"] == "relative" and rs[0]["offset_minutes"] == -15, rs)
rid = rs[0]["id"] if rs else None
modify("TB alarm", '''n.clearAlarms(); const a = new CalAlarm(); a.related = Ci.calIAlarm.ALARM_RELATED_END; a.offset = cal.createDuration("-PT30M"); a.action = "DISPLAY"; n.addAlarm(a);''')
rs = ot.reminders(t["id"])
check("alarms", "changing it changes the same reminder", len(rs) == 1 and rs[0]["offset_minutes"] == -30, [(r["id"] == rid, r["offset_minutes"]) for r in rs])
print("INFO alarms: the dialog builds a new alarm without the served UID, so the reminder id", "stays" if rs and rs[0]["id"] == rid else "changes", flush=True)
modify("TB alarm", "n.clearAlarms();")
rs = ot.reminders(t["id"])
check("alarms", "removing it deletes the reminder", len(rs) == 0, rs)
s = mk({"title": "TB server alarm", "due": {"date": "2026-11-26", "time": "08:00"}})
ot.api("POST", "/api/v1/reminders", {"task_id": s["id"], "kind": "relative", "offset_minutes": -60})
isa = item("TB server alarm")
check("alarms", "a reminder made in OpenTodo shows as an alarm", len(isa["alarms"]) == 1 and isa["alarms"][0]["offset"] == "-PT1H", isa["alarms"])
modify("TB server alarm", 'n.title = "TB server alarm edited";')
rs = ot.reminders(s["id"])
check("alarms", "it survives a Thunderbird save without a duplicate", len(rs) == 1 and rs[0]["offset_minutes"] == -60, rs)

# ---------------------------------------------------------------- Recurrence completion
r = mk({"title": "TB daily", "due": {"date": "2026-11-02"}, "recurrence": "every day"})
ir = item("TB daily")
check("recurrence", "served RRULE FREQ=DAILY", ir["rrule"] and "FREQ=DAILY" in ir["rrule"][0], ir["rrule"])
# The task tree lists occurrences (calendar-filter.js) and completes the one clicked
# (contextChangeTaskProgress: clone, isCompleted = true, modify transaction).
res = tb("""
await otRefresh(c);
const p = await otFind(c, "TB daily");
const occ = p.recurrenceInfo.getOccurrences(cal.createDateTime("20261101T000000Z"), cal.createDateTime("20261104T000000Z"), 0)[0];
const n = occ.clone(); n.percentComplete = 100; n.isCompleted = true;
const saved = await c.modifyItem(cal.itip.prepareSequence(n, occ), occ);
resolve({occ: occ.recurrenceId && occ.recurrenceId.icalString, saved: saved.parentItem.icalString});""")
after = ot.task(r["id"])
done = [x for x in ot.tasks() if x.get("series_id") == r["id"] and x.get("completed_at")]
check("recurrence", "completing the occurrence in the task list advances the series", after["due"] == {"date": "2026-11-03"} and len(done) == 1, (after["due"], len(done), res["occ"]))
r2 = mk({"title": "TB daily series", "due": {"date": "2026-11-02"}, "recurrence": "every day"})
modify("TB daily series", "n.percentComplete = 100; n.isCompleted = true;")
after = ot.task(r2["id"])
done = [x for x in ot.tasks() if x.get("series_id") == r2["id"] and x.get("completed_at")]
check("recurrence", "completing the whole series item advances it", after["due"] == {"date": "2026-11-03"} and not after.get("completed_at") and len(done) == 1, (after["due"], after.get("completed_at"), len(done)))

# ---------------------------------------------------------------- Moves
m = mk({"title": "TB move", "due": {"date": "2026-11-05", "time": "10:00"}})
im = item("TB move")
check("moves", "a timed task is served with DTSTART = DUE", im["entry"] and im["entry"].split()[0] == im["due"].split()[0], (im["entry"], im["due"]))
# Dragging in the calendar views shifts both dates by the same amount.
modify("TB move", 'n.entryDate = dt("20261106T100000"); n.dueDate = dt("20261106T100000");')
after = ot.task(m["id"])
check("moves", "moving both dates (drag) moves the task, no deadline", after["due"] == {"date": "2026-11-06", "time": "10:00"} and not after.get("deadline"), (after["due"], after.get("deadline")))
# The dialog moves Due with Start when Start changes (dateTimeControls2State keeps
# the duration), in the default zone.
modify("TB move", 'n.entryDate = dt("20261108T100000", "Europe/Berlin"); n.dueDate = dt("20261108T100000", "Europe/Berlin");')
after = ot.task(m["id"])
check("moves", "changing Start in the dialog moves the task", after["due"] == {"date": "2026-11-08", "time": "10:00", "tz": "Europe/Berlin"} and not after.get("deadline"), (after["due"], after.get("deadline")))
# Changing only Due keeps Start: Start and Due differ, so Due is the deadline (as documented).
modify("TB move", 'n.dueDate = dt("20261110T100000", "Europe/Berlin");')
after = ot.task(m["id"])
check("moves", "changing only Due sets a deadline (as documented)", after["due"]["date"] == "2026-11-08" and after.get("deadline") == "2026-11-10", (after["due"], after.get("deadline")))

# ---------------------------------------------------------------- Deletion
x = mk({"title": "TB delete me"})
tb('await otRefresh(c); const o = await otFind(c, "TB delete me"); await c.deleteItem(o); resolve(true);')
after = ot.api("GET", "/api/v1/tasks?include_deleted=true")["tasks"]
gone = [t for t in after if t["id"] == x["id"]]
check("deletion", "deleting in Thunderbird moves the task to the Trash", gone and gone[0].get("deleted_at"), gone)
y = mk({"title": "TB deleted in app"})
item("TB deleted in app")
ot.api("DELETE", f"/api/v1/tasks/{y['id']}")
check("deletion", "a task deleted in OpenTodo leaves Thunderbird", item("TB deleted in app") is None)

# ---------------------------------------------------------------- Incremental sync
import os
log = os.path.join(ot.C, "traffic.jsonl")
start = sum(1 for _ in open(log))
u = mk({"title": "TB sync before"})
item("TB sync before")
ot.api("PATCH", f"/api/v1/tasks/{u['id']}", {"title": "TB sync after"})
seen = item("TB sync after")
lines = [json.loads(l) for l in open(log)][start:]
reports = [l for l in lines if l["method"] == "REPORT"]
sync = [l for l in reports if "sync-collection" in l["req"]]
check("sync", "a change in OpenTodo reaches Thunderbird on refresh", seen is not None)
check("sync", "Thunderbird uses sync-collection with the server's token", len(sync) > 0, [l["req"][:200] for l in reports[:2]])

json.dump({k: v for k, v in R.items()}, open(os.path.join(ot.C, "tb_results.json"), "w"), indent=1)
print("DONE", sum(1 for v in R.values() for c in v if c[1]), "/", sum(len(v) for v in R.values()))
