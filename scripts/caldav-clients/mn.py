"""Minimal Marionette client: runs chrome-context scripts in a running Thunderbird."""
import json, socket, time


class Marionette:
    def __init__(self, port=2828, host="127.0.0.1"):
        for _ in range(120):
            try:
                self.s = socket.create_connection((host, port))
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError("no marionette")
        self.buf = b""
        self.id = 0
        self._read()  # hello
        self.cmd("WebDriver:NewSession", {"capabilities": {}})
        self.cmd("Marionette:SetContext", {"value": "chrome"})

    def _read(self):
        while b":" not in self.buf:
            self.buf += self.s.recv(65536)
        n, rest = self.buf.split(b":", 1)
        n = int(n)
        while len(rest) < n:
            rest += self.s.recv(65536)
        msg, self.buf = rest[:n], rest[n:]
        return json.loads(msg)

    def cmd(self, name, params):
        self.id += 1
        data = json.dumps([0, self.id, name, params]).encode()
        self.s.sendall(str(len(data)).encode() + b":" + data)
        while True:
            m = self._read()
            if isinstance(m, list) and m[1] == self.id:
                if m[2]:
                    raise RuntimeError(json.dumps(m[2])[:3000])
                return m[3]

    def run(self, script, args=None, timeout=60000):
        """Runs an async chrome script; the script calls `resolve(value)`."""
        wrapped = (
            "const resolve = arguments[arguments.length - 1];"
            "(async () => {" + script + "})().then(resolve, e => resolve({__error: String(e) + '\\n' + (e && e.stack)}));"
        )
        self.cmd("WebDriver:SetTimeouts", {"script": timeout})
        r = self.cmd("WebDriver:ExecuteAsyncScript", {"script": wrapped, "args": args or [], "sandbox": "system"})
        v = r.get("value") if isinstance(r, dict) else r
        if isinstance(v, dict) and "__error" in v:
            raise RuntimeError(v["__error"])
        return v
