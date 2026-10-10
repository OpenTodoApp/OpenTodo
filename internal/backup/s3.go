package backup

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// s3Dest talks to an S3-compatible service with three signed operations:
// PutObject, ListObjectsV2 and DeleteObject. Single-part uploads cover objects
// up to 5 GB, far beyond a personal task database.
type s3Dest struct {
	endpoint  *url.URL
	cfg       S3Settings
	secretKey string
	client    *http.Client
	now       func() time.Time
}

func newS3Dest(cfg S3Settings, secretKey string, client *http.Client, now func() time.Time) (*s3Dest, error) {
	u, err := url.Parse(strings.TrimRight(cfg.Endpoint, "/"))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid S3 endpoint %q", cfg.Endpoint)
	}
	if cfg.Region == "" {
		cfg.Region = "us-east-1"
	}
	cfg.Prefix = strings.Trim(cfg.Prefix, "/")
	return &s3Dest{endpoint: u, cfg: cfg, secretKey: secretKey, client: client, now: now}, nil
}

func (d *s3Dest) Kind() string { return DestS3 }

func (d *s3Dest) Describe() string {
	return "s3://" + d.cfg.Bucket + "/" + d.cfg.Prefix
}

func (d *s3Dest) key(name string) string {
	if d.cfg.Prefix == "" {
		return name
	}
	return d.cfg.Prefix + "/" + name
}

// url builds the request URL for an object key ("" = the bucket itself) in
// path-style (endpoint/bucket/key) or virtual-hosted style (bucket.endpoint/key).
func (d *s3Dest) url(key string, query url.Values) string {
	host := d.endpoint.Host
	base := strings.TrimRight(d.endpoint.Path, "/")
	path := base + "/"
	if d.cfg.PathStyle {
		path += awsURIEncode(d.cfg.Bucket, true) + "/"
	} else {
		host = d.cfg.Bucket + "." + host
	}
	path += awsURIEncode(key, false)
	u := d.endpoint.Scheme + "://" + host + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	return u
}

func (d *s3Dest) creds() sigCredentials {
	return sigCredentials{accessKey: d.cfg.AccessKey, secretKey: d.secretKey, region: d.cfg.Region, service: "s3"}
}

func (d *s3Dest) do(ctx context.Context, method, rawURL string, body io.Reader, size int64, payloadHash string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, rawURL, body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.ContentLength = size
	}
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	signV4(req, payloadHash, d.creds(), d.now())
	return d.client.Do(req)
}

// s3Error turns an S3 XML error body into a readable message.
func s3Error(op string, resp *http.Response) error {
	var e struct {
		Code    string `xml:"Code"`
		Message string `xml:"Message"`
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	_ = xml.Unmarshal(raw, &e)
	msg := resp.Status
	if e.Code != "" {
		msg += " " + e.Code
	}
	if e.Message != "" {
		msg += ": " + e.Message
	}
	return fmt.Errorf("s3 %s: %s", op, msg)
}

func (d *s3Dest) Put(ctx context.Context, name string, body io.ReadSeeker, size int64) error {
	if err := validObjectName(name); err != nil {
		return err
	}
	h := sha256.New()
	if _, err := io.Copy(h, body); err != nil {
		return err
	}
	if _, err := body.Seek(0, io.SeekStart); err != nil {
		return err
	}
	resp, err := d.do(ctx, http.MethodPut, d.url(d.key(name), nil), io.NopCloser(body), size, hex.EncodeToString(h.Sum(nil)))
	if err != nil {
		return fmt.Errorf("s3 put: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return s3Error("put "+d.key(name), resp)
	}
	return nil
}

type listResult struct {
	IsTruncated           bool   `xml:"IsTruncated"`
	NextContinuationToken string `xml:"NextContinuationToken"`
	Contents              []struct {
		Key          string `xml:"Key"`
		LastModified string `xml:"LastModified"`
		Size         int64  `xml:"Size"`
	} `xml:"Contents"`
}

func (d *s3Dest) List(ctx context.Context) ([]Object, error) {
	prefix := ""
	if d.cfg.Prefix != "" {
		prefix = d.cfg.Prefix + "/"
	}
	var out []Object
	token := ""
	for page := 0; page < 1000; page++ {
		q := url.Values{"list-type": {"2"}, "prefix": {prefix}}
		if token != "" {
			q.Set("continuation-token", token)
		}
		resp, err := d.do(ctx, http.MethodGet, d.url("", q), nil, 0, emptySHA256Hex)
		if err != nil {
			return nil, fmt.Errorf("s3 list: %w", err)
		}
		if resp.StatusCode/100 != 2 {
			err := s3Error("list", resp)
			resp.Body.Close()
			return nil, err
		}
		var lr listResult
		err = xml.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&lr)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("s3 list: decode response: %w", err)
		}
		for _, c := range lr.Contents {
			name := strings.TrimPrefix(c.Key, prefix)
			if name == "" || strings.Contains(name, "/") {
				continue
			}
			mt, _ := time.Parse(time.RFC3339, c.LastModified)
			out = append(out, Object{Name: name, Size: c.Size, ModTime: mt})
		}
		if !lr.IsTruncated || lr.NextContinuationToken == "" {
			return out, nil
		}
		token = lr.NextContinuationToken
	}
	return out, nil
}

func (d *s3Dest) Delete(ctx context.Context, name string) error {
	if err := validObjectName(name); err != nil {
		return err
	}
	resp, err := d.do(ctx, http.MethodDelete, d.url(d.key(name), nil), nil, 0, emptySHA256Hex)
	if err != nil {
		return fmt.Errorf("s3 delete: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 && resp.StatusCode != http.StatusNotFound {
		return s3Error("delete "+d.key(name), resp)
	}
	return nil
}
