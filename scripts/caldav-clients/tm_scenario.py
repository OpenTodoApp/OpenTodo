"""todoman + vdirsyncer scenario: the same columns as the Thunderbird run.

todoman edits the local vdir (it rewrites the VTODO through its own model);
vdirsyncer carries the files to and from the server over CalDAV.
"""
import glob, json, os, subprocess
import ot

TM = os.path.join(ot.HERE, "tm.sh")
R = {}


def check(col, name, ok, detail=""):
    R.setdefault(col, []).append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + col + ": " + name + ("  -- " + str(detail) if detail and not ok else ""), flush=True)


def sh(*args):
    p = subprocess.run(["bash", TM, *args], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(f"{args}: {p.stdout} {p.stderr}")
    return p.stdout


def sync():
    sh("sync")


def todos():
    return json.loads(sh("todo", "--porcelain", "list", "--status", "ANY") or "[]")


def tid(title):
    for t in todos():
        if t["summary"] == title:
            return str(t["id"])
    return None


def raw(title):
    for f in glob.glob(os.path.join(ot.C, "tm", "vdir", "inbox", "*.ics")):
        s = open(f).read()
        if f"SUMMARY:{title}\n" in s.replace("\r\n", "\n"):
            return s
    return None


def mk(body):
    return ot.api("POST", "/api/v1/tasks", body)


from datetime import datetime
from zoneinfo import ZoneInfo


def instant(due):
    """The instant of a due with a time; a floating time is read in Europe/Berlin (todoman's zone here)."""
    if not due or not due.get("time"):
        return due and due["date"]
    z = ZoneInfo(due.get("tz") or "Europe/Berlin")
    return datetime.fromisoformat(due["date"] + "T" + due["time"]).replace(tzinfo=z).timestamp()


def info(name, text):
    print("INFO " + name + ": " + text, flush=True)


version = subprocess.run(["todo", "--version"], capture_output=True, text=True).stdout.strip()
info("client", version + ", " + subprocess.run(["vdirsyncer", "--version"], capture_output=True, text=True).stdout.strip())

# ---------------------------------------------------------------- Due forms
a = mk({"title": "TM date", "due": {"date": "2026-11-10"}})
b = mk({"title": "TM floating", "due": {"date": "2026-11-10", "time": "10:30"}})
z = mk({"title": "TM zoned", "due": {"date": "2026-11-10", "time": "14:00", "tz": "America/New_York"}})
sync()
ts = {t["summary"]: t for t in todos()}
check("due", "the three due forms are listed", all(k in ts for k in ("TM date", "TM floating", "TM zoned")), list(ts))
check("due", "a date stays a date", "DUE;VALUE=DATE:20261110" in raw("TM date"), raw("TM date"))
for t, title in ((a, "TM date"), (b, "TM floating"), (z, "TM zoned")):
    sh("todo", "edit", tid(title), "--priority", "high")
    sync()
    after = ot.task(t["id"])
    check("due", f"{title}: an edit in todoman keeps the due (same instant)", instant(after["due"]) == instant(t["due"]), (t["due"], after["due"]))
info("due", "todoman writes every time in UTC, so a floating or zoned due comes back as the same instant in zone UTC")

# ---------------------------------------------------------------- Deadline
d = mk({"title": "TM deadline", "due": {"date": "2026-11-12"}, "deadline": "2026-11-14"})
sync()
r = raw("TM deadline")
check("deadline", "served: DTSTART = due, DUE = deadline", "DTSTART;VALUE=DATE:20261112" in r and "DUE;VALUE=DATE:20261114" in r, r)
sh("todo", "edit", tid("TM deadline"), "--priority", "medium")
sync()
after = ot.task(d["id"])
check("deadline", "an edit keeps due and deadline", after["due"] == {"date": "2026-11-12"} and after["deadline"] == "2026-11-14", (after["due"], after["deadline"]))
sh("todo", "new", "-s", "2026-11-18", "-d", "2026-11-20", "TM new start+due")
sync()
t = ot.by_title("TM new start+due")
check("deadline", "a new task with start and due: due from start, deadline from due", t and t[0]["due"] == {"date": "2026-11-18"} and t[0]["deadline"] == "2026-11-20", t and (t[0]["due"], t[0]["deadline"]))

# ---------------------------------------------------------------- Date shapes
sh("todo", "new", "-d", "2026-11-19 09:00", "TM due only")
sync()
t = ot.by_title("TM due only")
check("shapes", "due with a time", t and instant(t[0]["due"]) == instant({"date": "2026-11-19", "time": "09:00"}), t and t[0]["due"])
info("shapes", "todoman wrote: " + [l for l in raw("TM due only").splitlines() if l.startswith("DUE")][0])
sh("todo", "new", "-s", "2026-11-21", "TM start only")
sync()
t = ot.by_title("TM start only")
check("shapes", "a start alone sets nothing and is kept", t and t[0]["due"] is None and "DTSTART" in (t[0].get("ical_extra") or ""), t and (t[0]["due"], t[0].get("ical_extra")))
sh("todo", "new", "TM no dates")
sync()
t = ot.by_title("TM no dates")
check("shapes", "no dates", t and t[0]["due"] is None, t and t[0]["due"])

# ---------------------------------------------------------------- Estimates
e = mk({"title": "TM estimate", "due": {"date": "2026-11-13", "time": "09:00"}, "estimate_minutes": 90})
sync()
check("estimate", "served as ESTIMATED-DURATION", "ESTIMATED-DURATION:PT1H30M" in raw("TM estimate"), raw("TM estimate"))
sh("todo", "edit", tid("TM estimate"), "--priority", "low")
sync()
after = ot.task(e["id"])
check("estimate", "kept through a todoman edit", after["estimate_minutes"] == 90, after["estimate_minutes"])

# ---------------------------------------------------------------- Alarms (todoman shows none; they must survive)
s = mk({"title": "TM server alarm", "due": {"date": "2026-11-26", "time": "08:00"}})
ot.api("POST", "/api/v1/reminders", {"task_id": s["id"], "kind": "relative", "offset_minutes": -60})
sync()
check("alarms", "the reminder is served as a VALARM", "BEGIN:VALARM" in raw("TM server alarm"), raw("TM server alarm"))
sh("todo", "edit", tid("TM server alarm"), "--priority", "high")
sync()
rs = ot.reminders(s["id"])
check("alarms", "an edit in todoman keeps the reminder, no duplicate", len(rs) == 1 and rs[0]["offset_minutes"] == -60, rs)

# ---------------------------------------------------------------- Recurrence completion
rc = mk({"title": "TM daily", "due": {"date": "2026-11-02"}, "recurrence": "every day"})
sync()
check("recurrence", "served RRULE", "RRULE:FREQ=DAILY" in raw("TM daily"), raw("TM daily"))
sh("todo", "done", tid("TM daily"))
sync()
after = ot.task(rc["id"])
done = [x for x in ot.tasks() if x.get("series_id") == rc["id"] and x.get("completed_at")]
nxt = [x for x in ot.by_title("TM daily") if not x.get("completed_at")]
check("recurrence", "todo done: the task is completed and the next occurrence arrives as a new repeating task", after.get("completed_at") and len(nxt) == 1 and nxt[0]["due"] == {"date": "2026-11-03"} and nxt[0]["recurrence"] == "every day", (after.get("completed_at"), [(x["due"], x["recurrence"]) for x in nxt]))
info("recurrence", "todoman removes RRULE from the completed task and creates a new task (new UID) for the next occurrence, so the series id changes")
sync()
mine = [t for t in todos() if t["summary"] == "TM daily"]
info("recurrence", f"after the next sync todoman lists {len(mine)} 'TM daily' item(s): " + json.dumps([(t.get('completed'), t.get('due')) for t in mine]))

# ---------------------------------------------------------------- Moves
m = mk({"title": "TM move", "due": {"date": "2026-11-05", "time": "10:00"}})
sync()
sh("todo", "edit", tid("TM move"), "-s", "2026-11-06 10:00", "-d", "2026-11-06 10:00")
sync()
after = ot.task(m["id"])
check("moves", "moving start and due together moves the task, no deadline", instant(after["due"]) == instant({"date": "2026-11-06", "time": "10:00"}) and not after.get("deadline"), (after["due"], after.get("deadline")))
sh("todo", "edit", tid("TM move"), "-d", "2026-11-08 10:00")
sync()
after = ot.task(m["id"])
check("moves", "changing only due moves the task (todoman sends DUE alone)", instant(after["due"]) == instant({"date": "2026-11-08", "time": "10:00"}) and not after.get("deadline"), (after["due"], after.get("deadline")))
m2 = mk({"title": "TM move date", "due": {"date": "2026-11-05"}})
sync()
sh("todo", "edit", tid("TM move date"), "-d", "2026-11-07")
sync()
after = ot.task(m2["id"])
check("moves", "moving a date-only task's due", after["due"] == {"date": "2026-11-07"} and not after.get("deadline"), (after["due"], after.get("deadline")))

# ---------------------------------------------------------------- Deletion
x = mk({"title": "TM delete me"})
sync()
sh("todo", "delete", "--yes", tid("TM delete me"))
sync()
gone = [t for t in ot.api("GET", "/api/v1/tasks?include_deleted=true")["tasks"] if t["id"] == x["id"]]
check("deletion", "todo delete moves the task to the Trash", gone and gone[0].get("deleted_at"), gone)
y = mk({"title": "TM deleted in app"})
sync()
ot.api("DELETE", f"/api/v1/tasks/{y['id']}")
sync()
check("deletion", "a task deleted in OpenTodo leaves todoman", tid("TM deleted in app") is None)

# ---------------------------------------------------------------- Incremental sync
log = os.path.join(ot.C, "traffic.jsonl")
start = sum(1 for _ in open(log))
u = mk({"title": "TM sync before"})
sync()
ot.api("PATCH", f"/api/v1/tasks/{u['id']}", {"title": "TM sync after"})
sync()
check("sync", "a change in OpenTodo reaches todoman", tid("TM sync after") is not None)
lines = [json.loads(l) for l in open(log)][start:]
kinds = sorted({(l["method"], "sync-collection" if "sync-collection" in l["req"] else "calendar-query" if "calendar-query" in l["req"] else "multiget" if "multiget" in l["req"] else "") for l in lines})
info("sync", "vdirsyncer requests: " + json.dumps(kinds))

json.dump(R, open(os.path.join(ot.C, "tm_results.json"), "w"), indent=1)
print("DONE", sum(1 for v in R.values() for c in v if c[1]), "/", sum(len(v) for v in R.values()))
