"""OpenTodo REST helpers (the session cookie run.sh saved) and a Thunderbird runner."""
import json, http.cookiejar, os, urllib.request

# C is the work directory run.sh prepared (server data, app password, logs);
# HERE holds the scripts.
C = os.environ["WORK"]
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "http://127.0.0.1:18080"
APP = json.load(open(os.path.join(C, "apppw.json")))
SECRET = APP["secret"]
USER = "t@example.com"
USER_ID = json.load(open(os.path.join(C, "register.json")))["user"]["id"]

jar = http.cookiejar.MozillaCookieJar()


def _load_jar():
    # curl writes a Netscape cookie file; MozillaCookieJar needs the magic header.
    raw = open(os.path.join(C, "jar")).read()
    lines = [l.replace("#HttpOnly_", "") for l in raw.splitlines() if l and (not l.startswith("#") or l.startswith("#HttpOnly_"))]
    tmp = os.path.join(C, "jar.moz")
    open(tmp, "w").write("# Netscape HTTP Cookie File\n" + "\n".join(lines) + "\n")
    jar.load(tmp, ignore_discard=True, ignore_expires=True)


_load_jar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", "Origin": BASE})
    try:
        with opener.open(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read()[:300]!r}")


def task(tid):
    return api("GET", f"/api/v1/tasks/{tid}")


def tasks():
    return api("GET", "/api/v1/tasks")["tasks"]


def by_title(title):
    return [t for t in tasks() if t["title"] == title and not t.get("deleted_at")]


def reminders(tid):
    rs = api("GET", "/api/v1/reminders")
    rs = rs.get("reminders", rs) if isinstance(rs, dict) else rs
    return [r for r in rs if r.get("task_id") == tid and not r.get("deleted_at")]


CAL = f"http://127.0.0.1:18081/dav/calendars/{USER_ID}/inbox/"


def tb():
    from mn import Marionette
    m = Marionette()
    lib = open(os.path.join(HERE, "tblib.js")).read()

    def run(body, args=None):
        return m.run(lib + "\n" + body, args)

    run(f"await otSetup({json.dumps(CAL)}, {json.dumps(USER)}, {json.dumps(SECRET)}); resolve(true);")
    return run
