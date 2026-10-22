"""Recording proxy: 127.0.0.1:18081 -> 127.0.0.1:18080, logs every request as JSON lines."""
import http.client, http.server, json, os, sys, time

C = os.environ["WORK"]
LOG = os.path.join(C, sys.argv[1] if len(sys.argv) > 1 else "traffic.jsonl")


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _any(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        hdrs = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection", "proxy-connection")}
        hdrs["Host"] = "127.0.0.1:18081"
        conn = http.client.HTTPConnection("127.0.0.1", 18080, timeout=60)
        conn.request(self.command, self.path, body=body, headers=hdrs)
        r = conn.getresponse()
        data = r.read()
        with open(LOG, "a") as f:
            f.write(json.dumps({"t": time.time(), "method": self.command, "path": self.path,
                                "ua": self.headers.get("User-Agent"), "req": body.decode("utf-8", "replace"),
                                "status": r.status, "resp": data.decode("utf-8", "replace")[:20000]}) + "\n")
        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() in ("transfer-encoding", "connection", "content-length"):
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


for m in ("GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS", "PROPFIND", "PROPPATCH", "REPORT", "MKCALENDAR", "MOVE", "COPY"):
    setattr(H, "do_" + m, H._any)

http.server.ThreadingHTTPServer(("127.0.0.1", 18081), H).serve_forever()
