package backup

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

// webdavDest stores archives in one WebDAV collection with MKCOL, PUT,
// PROPFIND (Depth: 1) and DELETE, authenticating with HTTP Basic auth.
type webdavDest struct {
	base     *url.URL // the collection, always with a trailing slash
	username string
	password string
	client   *http.Client
	ensured  bool
}

func newWebDAVDest(cfg WebDAVSettings, password string, client *http.Client) (*webdavDest, error) {
	u, err := url.Parse(cfg.URL)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return nil, fmt.Errorf("invalid WebDAV URL %q", cfg.URL)
	}
	if u.Scheme == "http" && !cfg.AllowHTTP {
		return nil, fmt.Errorf("refusing plain-http WebDAV URL without allowHttp")
	}
	u.User = nil
	u.RawQuery, u.Fragment = "", ""
	if !strings.HasSuffix(u.Path, "/") {
		u.Path += "/"
		u.RawPath = ""
	}
	return &webdavDest{base: u, username: cfg.Username, password: password, client: client}, nil
}

func (d *webdavDest) Kind() string     { return DestWebDAV }
func (d *webdavDest) Describe() string { return d.base.String() }

func (d *webdavDest) objectURL(name string) string {
	return d.base.String() + url.PathEscape(name)
}

func (d *webdavDest) do(ctx context.Context, method, target string, body io.Reader, size int64, hdr map[string]string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.ContentLength = size
	}
	if d.username != "" || d.password != "" {
		req.SetBasicAuth(d.username, d.password)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("webdav %s: %w", strings.ToLower(method), err)
	}
	return resp, nil
}

func webdavError(op string, resp *http.Response) error {
	io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	return fmt.Errorf("webdav %s: %s", op, resp.Status)
}

// ensureCollection creates the collection on first use. 405 means it exists.
func (d *webdavDest) ensureCollection(ctx context.Context) error {
	if d.ensured {
		return nil
	}
	resp, err := d.do(ctx, "MKCOL", d.base.String(), nil, 0, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode/100 == 2, resp.StatusCode == http.StatusMethodNotAllowed, resp.StatusCode/100 == 3:
		d.ensured = true
		return nil
	}
	return webdavError("mkcol", resp)
}

func (d *webdavDest) Put(ctx context.Context, name string, body io.ReadSeeker, size int64) error {
	if err := validObjectName(name); err != nil {
		return err
	}
	if err := d.ensureCollection(ctx); err != nil {
		return err
	}
	resp, err := d.do(ctx, http.MethodPut, d.objectURL(name), io.NopCloser(body), size, map[string]string{"Content-Type": "application/octet-stream"})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return webdavError("put "+name, resp)
	}
	return nil
}

const propfindBody = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>`

type multistatus struct {
	Responses []struct {
		Href     string `xml:"href"`
		Propstat []struct {
			Prop struct {
				ResourceType struct {
					Collection *struct{} `xml:"collection"`
				} `xml:"resourcetype"`
				ContentLength int64  `xml:"getcontentlength"`
				LastModified  string `xml:"getlastmodified"`
			} `xml:"prop"`
		} `xml:"propstat"`
	} `xml:"response"`
}

func (d *webdavDest) List(ctx context.Context) ([]Object, error) {
	resp, err := d.do(ctx, "PROPFIND", d.base.String(), strings.NewReader(propfindBody), int64(len(propfindBody)),
		map[string]string{"Depth": "1", "Content-Type": "application/xml; charset=utf-8"})
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil // nothing written yet
	}
	if resp.StatusCode != http.StatusMultiStatus && resp.StatusCode != http.StatusOK {
		return nil, webdavError("propfind", resp)
	}
	var ms multistatus
	if err := xml.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&ms); err != nil {
		return nil, fmt.Errorf("webdav propfind: decode response: %w", err)
	}
	var out []Object
	for _, r := range ms.Responses {
		hu, err := url.Parse(r.Href)
		if err != nil {
			continue
		}
		p := hu.Path
		if strings.HasSuffix(p, "/") || strings.TrimSuffix(p, "/") == strings.TrimSuffix(d.base.Path, "/") {
			continue // the collection itself or a sub-collection
		}
		var o Object
		o.Name = path.Base(p)
		collection := false
		for _, ps := range r.Propstat {
			if ps.Prop.ResourceType.Collection != nil {
				collection = true
			}
			if ps.Prop.ContentLength > 0 {
				o.Size = ps.Prop.ContentLength
			}
			if ps.Prop.LastModified != "" {
				o.ModTime, _ = time.Parse(http.TimeFormat, ps.Prop.LastModified)
			}
		}
		if !collection {
			out = append(out, o)
		}
	}
	return out, nil
}

func (d *webdavDest) Delete(ctx context.Context, name string) error {
	if err := validObjectName(name); err != nil {
		return err
	}
	resp, err := d.do(ctx, http.MethodDelete, d.objectURL(name), nil, 0, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 && resp.StatusCode != http.StatusNotFound {
		return webdavError("delete "+name, resp)
	}
	return nil
}
