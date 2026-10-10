package backup

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"sort"
	"strings"
	"time"
)

// AWS Signature Version 4 over net/http (no SDK). Reference:
// https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html

const (
	sigAlgorithm   = "AWS4-HMAC-SHA256"
	amzDateLayout  = "20060102T150405Z"
	emptySHA256Hex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)

type sigCredentials struct {
	accessKey, secretKey, region, service string
}

func hmacSHA256(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// awsURIEncode percent-encodes everything except unreserved characters
// (A-Z a-z 0-9 - _ . ~); '/' is kept when encodeSlash is false.
func awsURIEncode(s string, encodeSlash bool) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case 'A' <= c && c <= 'Z', 'a' <= c && c <= 'z', '0' <= c && c <= '9', c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == '/' && !encodeSlash:
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&15])
		}
	}
	return b.String()
}

func signingKey(secret, date, region, service string) []byte {
	k := hmacSHA256([]byte("AWS4"+secret), date)
	k = hmacSHA256(k, region)
	k = hmacSHA256(k, service)
	return hmacSHA256(k, "aws4_request")
}

// headerNames lists the headers to sign: Host plus every header present on req
// at signing time except Authorization.
func headerNames(req *http.Request) []string {
	names := []string{"host"}
	for k := range req.Header {
		if lk := strings.ToLower(k); lk != "authorization" && lk != "host" {
			names = append(names, lk)
		}
	}
	sort.Strings(names)
	return names
}

// canonicalRequest returns the canonical request over the given (sorted,
// lower-case) header names and the SignedHeaders value.
func canonicalRequest(req *http.Request, payloadHash string, names []string) (string, string) {
	path := req.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	q := req.URL.Query()
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var qs []string
	for _, k := range keys {
		vals := append([]string(nil), q[k]...)
		sort.Strings(vals)
		for _, v := range vals {
			qs = append(qs, awsURIEncode(k, true)+"="+awsURIEncode(v, true))
		}
	}
	host := req.Host
	if host == "" {
		host = req.URL.Host
	}
	var ch strings.Builder
	for _, k := range names {
		v := host
		if k != "host" {
			v = strings.Join(strings.Fields(strings.Join(req.Header.Values(k), ",")), " ")
		}
		ch.WriteString(k + ":" + v + "\n")
	}
	signed := strings.Join(names, ";")
	return strings.Join([]string{req.Method, path, strings.Join(qs, "&"), ch.String(), signed, payloadHash}, "\n"), signed
}

// signV4 adds X-Amz-Date and Authorization to req. Callers set any other headers
// to be signed (S3 needs X-Amz-Content-Sha256) before calling.
func signV4(req *http.Request, payloadHash string, c sigCredentials, t time.Time) {
	t = t.UTC()
	amzDate := t.Format(amzDateLayout)
	date := amzDate[:8]
	req.Header.Set("X-Amz-Date", amzDate)
	sig, signed := signature(req, payloadHash, c, amzDate, headerNames(req))
	scope := date + "/" + c.region + "/" + c.service + "/aws4_request"
	req.Header.Set("Authorization", sigAlgorithm+" Credential="+c.accessKey+"/"+scope+", SignedHeaders="+signed+", Signature="+sig)
}

// signature computes the hex signature over the named headers.
func signature(req *http.Request, payloadHash string, c sigCredentials, amzDate string, names []string) (string, string) {
	date := amzDate[:8]
	creq, signed := canonicalRequest(req, payloadHash, names)
	scope := date + "/" + c.region + "/" + c.service + "/aws4_request"
	sts := sigAlgorithm + "\n" + amzDate + "\n" + scope + "\n" + sha256Hex(creq)
	return hex.EncodeToString(hmacSHA256(signingKey(c.secretKey, date, c.region, c.service), sts)), signed
}
