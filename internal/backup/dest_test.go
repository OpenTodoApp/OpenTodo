package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

func putString(t *testing.T, d Destination, name, body string) {
	t.Helper()
	if err := d.Put(context.Background(), name, strings.NewReader(body), int64(len(body))); err != nil {
		t.Fatalf("put %s: %v", name, err)
	}
}

func names(objs []Object) []string {
	var out []string
	for _, o := range objs {
		out = append(out, o.Name)
	}
	sort.Strings(out)
	return out
}

func TestLocalDestinationWriteListDelete(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "backups")
	d := &localDest{dir: dir}
	ctx := context.Background()
	if objs, err := d.List(ctx); err != nil || len(objs) != 0 {
		t.Fatalf("empty list: %v %v", objs, err)
	}
	putString(t, d, "a.tar", "AAAA")
	putString(t, d, "b.tar", "BB")
	// Leftover temp files are hidden from listings.
	os.WriteFile(filepath.Join(dir, ".tmp-c.tar-123"), []byte("x"), 0o600)
	objs, err := d.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(names(objs), ","); got != "a.tar,b.tar" {
		t.Fatalf("list = %s", got)
	}
	info, _ := os.Stat(filepath.Join(dir, "a.tar"))
	if info.Size() != 4 || info.Mode().Perm() != 0o600 {
		t.Fatalf("a.tar size=%d mode=%v", info.Size(), info.Mode().Perm())
	}
	if err := d.Delete(ctx, "a.tar"); err != nil {
		t.Fatal(err)
	}
	if err := d.Delete(ctx, "a.tar"); err != nil {
		t.Fatalf("deleting a missing object: %v", err)
	}
	objs, _ = d.List(ctx)
	if got := strings.Join(names(objs), ","); got != "b.tar" {
		t.Fatalf("after delete = %s", got)
	}
	if err := d.Put(ctx, "../escape", strings.NewReader("x"), 1); err == nil {
		t.Fatal("path traversal accepted")
	}
}

// ---- S3 ----

// TestS3SignatureVectors checks the signer against examples published by AWS:
// the signing-key example from the SigV4 documentation, the get-vanilla case of
// the SigV4 test suite, and the S3 GetObject / ListObjects examples from the S3
// API reference ("Signature Calculations for the Authorization Header").
func TestS3SignatureVectors(t *testing.T) {
	// Signing key derivation example (IAM, 2012-02-15).
	key := signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam")
	if got := hex.EncodeToString(key); got != "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d" {
		t.Fatalf("signing key = %s", got)
	}

	at := func(s string) time.Time {
		tm, err := time.Parse(amzDateLayout, s)
		if err != nil {
			t.Fatal(err)
		}
		return tm
	}
	cases := []struct {
		name, method, url string
		headers           map[string]string
		payload           string
		creds             sigCredentials
		date              string
		wantSigned        string
		wantSig           string
	}{
		{
			name: "get-vanilla", method: "GET", url: "https://example.amazonaws.com/",
			payload: emptySHA256Hex, date: "20150830T123600Z",
			creds:      sigCredentials{"AKIDEXAMPLE", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "us-east-1", "service"},
			wantSigned: "host;x-amz-date",
			wantSig:    "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
		},
		{
			name: "s3-get-object", method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt",
			headers: map[string]string{"Range": "bytes=0-9", "X-Amz-Content-Sha256": emptySHA256Hex},
			payload: emptySHA256Hex, date: "20130524T000000Z",
			creds:      sigCredentials{"AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1", "s3"},
			wantSigned: "host;range;x-amz-content-sha256;x-amz-date",
			wantSig:    "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
		},
		{
			name: "s3-list-objects", method: "GET", url: "https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J",
			headers: map[string]string{"X-Amz-Content-Sha256": emptySHA256Hex},
			payload: emptySHA256Hex, date: "20130524T000000Z",
			creds:      sigCredentials{"AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1", "s3"},
			wantSigned: "host;x-amz-content-sha256;x-amz-date",
			wantSig:    "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, _ := http.NewRequest(c.method, c.url, nil)
			for k, v := range c.headers {
				req.Header.Set(k, v)
			}
			signV4(req, c.payload, c.creds, at(c.date))
			auth := req.Header.Get("Authorization")
			if !strings.Contains(auth, "SignedHeaders="+c.wantSigned+",") {
				t.Fatalf("signed headers: %s", auth)
			}
			if !strings.HasSuffix(auth, "Signature="+c.wantSig) {
				t.Fatalf("authorization = %s\nwant signature %s", auth, c.wantSig)
			}
		})
	}
}

// fakeS3 is a minimal path-style S3 that verifies SigV4 on every request.
type fakeS3 struct {
	t       *testing.T
	creds   sigCredentials
	mu      sync.Mutex
	objects map[string][]byte // key within bucket
	bucket  string
	pageMax int
	reqs    []string
	failPut int // respond 403 to PUT when > 0
	// Multipart uploads in progress: upload id -> part number -> bytes.
	uploads  map[string]map[int][]byte
	failPart int // respond 500 to this part number
}

func newFakeS3(t *testing.T) (*fakeS3, *httptest.Server) {
	f := &fakeS3{t: t, creds: sigCredentials{"AKTEST", "secret/key+test", "eu-test-1", "s3"}, objects: map[string][]byte{}, bucket: "bkt", pageMax: 2}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return f, srv
}

func (f *fakeS3) fail(w http.ResponseWriter, status int, code, msg string) {
	w.WriteHeader(status)
	fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>%s</Code><Message>%s</Message></Error>`, code, msg)
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reqs = append(f.reqs, r.Method+" "+r.URL.RequestURI())
	// Verify the signature exactly as S3 would, from what arrived on the wire.
	auth := r.Header.Get("Authorization")
	var signedList, sig string
	for _, part := range strings.Split(strings.TrimPrefix(auth, sigAlgorithm+" "), ", ") {
		if v, ok := strings.CutPrefix(part, "SignedHeaders="); ok {
			signedList = v
		}
		if v, ok := strings.CutPrefix(part, "Signature="); ok {
			sig = v
		}
	}
	if !strings.Contains(auth, "Credential="+f.creds.accessKey+"/") {
		f.fail(w, 403, "InvalidAccessKeyId", "unknown key")
		return
	}
	payload := r.Header.Get("X-Amz-Content-Sha256")
	want, _ := signature(r, payload, f.creds, r.Header.Get("X-Amz-Date"), strings.Split(signedList, ";"))
	if sig == "" || sig != want {
		f.fail(w, 403, "SignatureDoesNotMatch", "bad signature")
		return
	}
	prefix := "/" + f.bucket
	if r.URL.Path != prefix && !strings.HasPrefix(r.URL.Path, prefix+"/") {
		f.fail(w, 404, "NoSuchBucket", "no bucket")
		return
	}
	key := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, prefix), "/")
	if f.multipart(w, r, key, payload) {
		return
	}
	switch r.Method {
	case http.MethodPut:
		if f.failPut > 0 {
			f.fail(w, 403, "AccessDenied", "write not allowed")
			return
		}
		body, _ := io.ReadAll(r.Body)
		sum := sha256.Sum256(body)
		if hex.EncodeToString(sum[:]) != payload || int64(len(body)) != r.ContentLength {
			f.fail(w, 400, "XAmzContentSHA256Mismatch", "payload hash mismatch")
			return
		}
		f.objects[key] = body
		w.WriteHeader(200)
	case http.MethodDelete:
		delete(f.objects, key)
		w.WriteHeader(204)
	case http.MethodGet:
		if key != "" && r.URL.Query().Get("list-type") == "" {
			body, ok := f.objects[key]
			if !ok {
				f.fail(w, 404, "NoSuchKey", "no such key")
				return
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(body)))
			w.WriteHeader(200)
			w.Write(body)
			return
		}
		if r.URL.Query().Get("list-type") != "2" || key != "" {
			f.fail(w, 400, "InvalidRequest", "only ListObjectsV2")
			return
		}
		pfx := r.URL.Query().Get("prefix")
		var keys []string
		for k := range f.objects {
			if strings.HasPrefix(k, pfx) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		start := 0
		if tok := r.URL.Query().Get("continuation-token"); tok != "" {
			fmt.Sscanf(tok, "tok-%d", &start)
		}
		end := min(start+f.pageMax, len(keys))
		type content struct {
			Key          string
			LastModified string
			Size         int
		}
		res := struct {
			XMLName               xml.Name `xml:"ListBucketResult"`
			IsTruncated           bool
			NextContinuationToken string `xml:",omitempty"`
			Contents              []content
		}{IsTruncated: end < len(keys)}
		if res.IsTruncated {
			res.NextContinuationToken = fmt.Sprintf("tok-%d", end)
		}
		for _, k := range keys[start:end] {
			res.Contents = append(res.Contents, content{k, "2026-10-10T12:00:00.000Z", len(f.objects[k])})
		}
		w.WriteHeader(200)
		xml.NewEncoder(w).Encode(res)
	default:
		f.fail(w, 405, "MethodNotAllowed", r.Method)
	}
}

// multipart serves CreateMultipartUpload, UploadPart, CompleteMultipartUpload
// and AbortMultipartUpload; it reports whether the request was one of them.
func (f *fakeS3) multipart(w http.ResponseWriter, r *http.Request, key, payload string) bool {
	q := r.URL.Query()
	_, create := q["uploads"]
	id := q.Get("uploadId")
	if !create && id == "" {
		return false
	}
	if f.uploads == nil {
		f.uploads = map[string]map[int][]byte{}
	}
	body, _ := io.ReadAll(r.Body)
	if sum := sha256.Sum256(body); hex.EncodeToString(sum[:]) != payload {
		f.fail(w, 400, "XAmzContentSHA256Mismatch", "payload hash mismatch")
		return true
	}
	switch {
	case create && r.Method == http.MethodPost:
		id = fmt.Sprintf("up-%d", len(f.uploads)+1)
		f.uploads[id] = map[int][]byte{}
		fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>%s</Bucket><Key>%s</Key><UploadId>%s</UploadId></InitiateMultipartUploadResult>`, f.bucket, key, id)
	case r.Method == http.MethodPut:
		parts, ok := f.uploads[id]
		if !ok {
			f.fail(w, 404, "NoSuchUpload", "no upload")
			return true
		}
		var n int
		fmt.Sscanf(q.Get("partNumber"), "%d", &n)
		if n == f.failPart {
			f.fail(w, 500, "InternalError", "part failed")
			return true
		}
		parts[n] = body
		sum := sha256.Sum256(body)
		w.Header().Set("ETag", `"`+hex.EncodeToString(sum[:8])+`"`)
		w.WriteHeader(200)
	case r.Method == http.MethodPost:
		parts, ok := f.uploads[id]
		if !ok {
			f.fail(w, 404, "NoSuchUpload", "no upload")
			return true
		}
		var req struct {
			Parts []struct {
				PartNumber int
				ETag       string
			} `xml:"Part"`
		}
		if err := xml.Unmarshal(body, &req); err != nil || len(req.Parts) != len(parts) {
			f.fail(w, 400, "InvalidPart", "parts do not match")
			return true
		}
		var obj []byte
		for i, p := range req.Parts {
			sum := sha256.Sum256(parts[p.PartNumber])
			if p.PartNumber != i+1 || p.ETag != `"`+hex.EncodeToString(sum[:8])+`"` {
				f.fail(w, 400, "InvalidPart", "bad part")
				return true
			}
			obj = append(obj, parts[p.PartNumber]...)
		}
		f.objects[key] = obj
		delete(f.uploads, id)
		fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Key>`+key+`</Key></CompleteMultipartUploadResult>`)
	case r.Method == http.MethodDelete:
		delete(f.uploads, id)
		w.WriteHeader(204)
	default:
		f.fail(w, 400, "InvalidRequest", "multipart")
	}
	return true
}

func TestS3PutListDelete(t *testing.T) {
	f, srv := newFakeS3(t)
	d, err := newS3Dest(S3Settings{Endpoint: srv.URL, Region: f.creds.region, Bucket: "bkt", Prefix: "/team/opentodo/", AccessKey: f.creds.accessKey, PathStyle: true},
		f.creds.secretKey, srv.Client(), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, n := range []string{"opentodo-20260101-000000-aaaaaaaa.tar.gz", "opentodo-20260102-000000-aaaaaaaa.tar.gz", "opentodo-20260103-000000-aaaaaaaa.tar.gz"} {
		putString(t, d, n, "archive "+n)
	}
	// Objects outside the prefix or in sub-folders are not ours.
	f.objects["other/opentodo-20260101-000000-aaaaaaaa.tar"] = []byte("x")
	f.objects["team/opentodo/sub/x.tar"] = []byte("x")
	if _, ok := f.objects["team/opentodo/opentodo-20260101-000000-aaaaaaaa.tar.gz"]; !ok {
		t.Fatalf("object not stored under prefix: %v", f.reqs)
	}
	objs, err := d.List(ctx) // three objects, page size 2: exercises continuation tokens
	if err != nil {
		t.Fatal(err)
	}
	if got := names(objs); len(got) != 3 || objs[0].Size == 0 {
		t.Fatalf("list = %v (%+v)", got, objs)
	}
	if err := d.Delete(ctx, "opentodo-20260101-000000-aaaaaaaa.tar.gz"); err != nil {
		t.Fatal(err)
	}
	objs, _ = d.List(ctx)
	if len(objs) != 2 {
		t.Fatalf("after delete: %v", names(objs))
	}
	// A wrong secret is reported with S3's error code.
	bad, _ := newS3Dest(S3Settings{Endpoint: srv.URL, Region: f.creds.region, Bucket: "bkt", AccessKey: f.creds.accessKey, PathStyle: true}, "wrong", srv.Client(), time.Now)
	err = bad.Put(ctx, "x.tar", strings.NewReader("x"), 1)
	if err == nil || !strings.Contains(err.Error(), "SignatureDoesNotMatch") {
		t.Fatalf("wrong secret: %v", err)
	}
}

func TestS3VirtualHostedURL(t *testing.T) {
	d, _ := newS3Dest(S3Settings{Endpoint: "https://s3.eu-central-1.amazonaws.com", Bucket: "my-bucket", Prefix: "p q"}, "s", http.DefaultClient, time.Now)
	if got := d.url(d.key("a.tar"), nil); got != "https://my-bucket.s3.eu-central-1.amazonaws.com/p%20q/a.tar" {
		t.Fatalf("virtual-hosted url = %s", got)
	}
	d.cfg.PathStyle = true
	if got := d.url(d.key("a.tar"), nil); got != "https://s3.eu-central-1.amazonaws.com/my-bucket/p%20q/a.tar" {
		t.Fatalf("path-style url = %s", got)
	}
}

// ---- WebDAV ----

type fakeDAV struct {
	mu         sync.Mutex
	user, pass string
	collection string // e.g. /dav/backups/
	exists     bool
	files      map[string][]byte
	methods    []string
}

func newFakeDAV(t *testing.T) (*fakeDAV, *httptest.Server) {
	f := &fakeDAV{user: "me", pass: "pw", collection: "/dav/backups/", files: map[string][]byte{}}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return f, srv
}

func (f *fakeDAV) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.methods = append(f.methods, r.Method)
	if u, p, ok := r.BasicAuth(); !ok || u != f.user || p != f.pass {
		w.Header().Set("WWW-Authenticate", `Basic realm="dav"`)
		w.WriteHeader(401)
		return
	}
	switch r.Method {
	case "MKCOL":
		if r.URL.Path != f.collection {
			w.WriteHeader(409)
			return
		}
		if f.exists {
			w.WriteHeader(405)
			return
		}
		f.exists = true
		w.WriteHeader(201)
	case http.MethodPut:
		dir, name := filepath.Split(r.URL.Path)
		if dir != f.collection || !f.exists {
			w.WriteHeader(409)
			return
		}
		body, _ := io.ReadAll(r.Body)
		_, existed := f.files[name]
		f.files[name] = body
		if existed {
			w.WriteHeader(204)
		} else {
			w.WriteHeader(201)
		}
	case "PROPFIND":
		if r.Header.Get("Depth") != "1" {
			w.WriteHeader(400)
			return
		}
		if r.URL.Path != f.collection || !f.exists {
			w.WriteHeader(404)
			return
		}
		var b strings.Builder
		b.WriteString(`<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">`)
		fmt.Fprintf(&b, `<D:response><D:href>%s</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`, f.collection)
		fmt.Fprintf(&b, `<D:response><D:href>%ssub/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`, f.collection)
		for name, body := range f.files {
			fmt.Fprintf(&b, `<D:response><D:href>%s%s</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>%d</D:getcontentlength><D:getlastmodified>Sat, 10 Oct 2026 12:00:00 GMT</D:getlastmodified></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`, f.collection, name, len(body))
		}
		b.WriteString(`</D:multistatus>`)
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(207)
		io.WriteString(w, b.String())
	case http.MethodGet:
		dir, name := filepath.Split(r.URL.Path)
		body, ok := f.files[name]
		if dir != f.collection || !ok {
			w.WriteHeader(404)
			return
		}
		w.Write(body)
	case http.MethodDelete:
		_, name := filepath.Split(r.URL.Path)
		if _, ok := f.files[name]; !ok {
			w.WriteHeader(404)
			return
		}
		delete(f.files, name)
		w.WriteHeader(204)
	default:
		w.WriteHeader(405)
	}
}

func TestWebDAVPutListDelete(t *testing.T) {
	f, srv := newFakeDAV(t)
	d, err := newWebDAVDest(WebDAVSettings{URL: srv.URL + "/dav/backups", Username: "me", AllowHTTP: true}, "pw", srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if objs, err := d.List(ctx); err != nil || len(objs) != 0 {
		t.Fatalf("list before first write: %v %v", objs, err)
	}
	putString(t, d, "opentodo-20260101-000000-aaaaaaaa.tar", "one")
	putString(t, d, "opentodo-20260102-000000-aaaaaaaa.tar", "two!")
	if !f.exists || f.methods[1] != "MKCOL" {
		t.Fatalf("collection not created first: %v", f.methods)
	}
	objs, err := d.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(names(objs), ","); got != "opentodo-20260101-000000-aaaaaaaa.tar,opentodo-20260102-000000-aaaaaaaa.tar" {
		t.Fatalf("list = %s", got)
	}
	for _, o := range objs {
		if o.Size == 0 || o.ModTime.IsZero() {
			t.Fatalf("missing props: %+v", o)
		}
	}
	if err := d.Delete(ctx, "opentodo-20260101-000000-aaaaaaaa.tar"); err != nil {
		t.Fatal(err)
	}
	if len(f.files) != 1 {
		t.Fatalf("files after delete: %v", f.files)
	}
	// Wrong password: the server's answer is reported.
	bad, _ := newWebDAVDest(WebDAVSettings{URL: srv.URL + "/dav/backups/", Username: "me", AllowHTTP: true}, "nope", srv.Client())
	if err := bad.Put(ctx, "x.tar", bytes.NewReader([]byte("x")), 1); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("wrong password: %v", err)
	}
	// Plain http needs the explicit opt-in.
	if _, err := newWebDAVDest(WebDAVSettings{URL: srv.URL}, "pw", srv.Client()); err == nil {
		t.Fatal("plain http accepted without allowHttp")
	}
}

func TestWebDAVUnreachableRecordsFailure(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	// A server that is gone: connection refused.
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	set := DefaultSettings()
	set.Destination = DestWebDAV
	set.WebDAV = WebDAVSettings{URL: url + "/dav/", Username: "me", AllowHTTP: true}
	set.Schedule.Frequency = FreqDaily
	if _, err := e.svc.SaveSettings(ctx, set, SecretUpdate{WebDAVPassword: ptr("pw")}); err != nil {
		t.Fatal(err)
	}
	r, err := e.svc.RunNow(ctx, KindScheduled)
	if err != nil {
		t.Fatal(err)
	}
	if r.Status != StatusFailed || !strings.Contains(r.Error, "connection refused") {
		t.Fatalf("run = %+v", r)
	}
	hist, _ := e.svc.History(ctx, 10)
	if len(hist) != 1 || hist[0].Status != StatusFailed || hist[0].Error != r.Error || hist[0].FinishedAt == nil {
		t.Fatalf("history = %+v", hist)
	}
	// The local snapshot and archive are removed.
	left, _ := os.ReadDir(filepath.Join(e.dir, "tmp"))
	if len(left) != 0 {
		t.Fatalf("temp files left behind: %v", left)
	}
	// The next run is at the next scheduled time, not immediately.
	next, _ := e.svc.NextRun(ctx)
	if next == nil || !next.After(e.clock.Now()) {
		t.Fatalf("next run = %v", next)
	}
}

func TestProbeReportsDestinationError(t *testing.T) {
	ctx := context.Background()
	// S3 refusing writes: the probe names the destination and carries S3's message.
	f, srv := newFakeS3(t)
	f.failPut = 1
	e := newTestEnv(t)
	e.svc.client = srv.Client()
	set := DefaultSettings()
	set.Destination = DestS3
	set.S3 = S3Settings{Endpoint: srv.URL, Region: f.creds.region, Bucket: "bkt", Prefix: "backups", AccessKey: f.creds.accessKey, PathStyle: true}
	if _, err := e.svc.SaveSettings(ctx, set, SecretUpdate{S3SecretKey: ptr(f.creds.secretKey)}); err != nil {
		t.Fatal(err)
	}
	err := e.svc.TestDestination(ctx)
	if err == nil || !strings.Contains(err.Error(), "AccessDenied") || !strings.Contains(err.Error(), "s3://bkt/backups") {
		t.Fatalf("probe error = %v", err)
	}
	// Once writes are allowed the probe succeeds and leaves nothing behind.
	f.failPut = 0
	if err := e.svc.TestDestination(ctx); err != nil {
		t.Fatal(err)
	}
	if len(f.objects) != 0 {
		t.Fatalf("probe left objects: %v", f.objects)
	}
	var sawProbe bool
	for _, r := range f.reqs {
		if strings.HasPrefix(r, "PUT /bkt/backups/opentodo-probe-") {
			sawProbe = true
		}
	}
	if !sawProbe {
		t.Fatalf("no probe written under the prefix: %v", f.reqs)
	}
	// A local directory that cannot be created is reported too.
	e2 := newTestEnv(t)
	blocker := filepath.Join(e2.dir, "file")
	os.WriteFile(blocker, []byte("x"), 0o600)
	set2 := DefaultSettings()
	set2.Local.Dir = filepath.Join(blocker, "sub")
	if _, err := e2.svc.SaveSettings(ctx, set2, SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	if err := e2.svc.TestDestination(ctx); err == nil || !strings.Contains(err.Error(), "write test object") {
		t.Fatalf("local probe error = %v", err)
	}
}
