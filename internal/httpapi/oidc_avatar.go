package httpapi

import (
	"bytes"
	"context"
	"errors"
	"image"
	_ "image/gif" // provider pictures come as PNG, JPEG or GIF
	"image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/imgfit"
	"github.com/pixari/opentodo/internal/oidc"
	ob "github.com/pixari/opentodo/internal/outbound"
)

// Profile pictures from the sign-in provider (OpenSpec change
// oidc-profile-pictures, issue #233). When the owner turned the switch on, the
// `picture` claim of a sign-in or a link is fetched through the outbound policy,
// cropped and scaled to the profile picture's 256×256, re-encoded as JPEG and
// stored like an uploaded picture, with its source recorded: a picture the
// person uploaded is never replaced, a picture they removed is not fetched
// again until the provider names another address, and an unchanged address is
// not fetched twice. The fetch is bounded (five seconds, two megabytes) and
// never fails the sign-in; nothing about it is logged beyond a warning.

const (
	providerPictureTimeout  = 5 * time.Second
	providerPictureMaxBytes = 2 << 20
	providerPictureMaxSide  = 4096
)

// WithPictureClient replaces the client that fetches provider pictures (tests:
// the default refuses private network targets).
func WithPictureClient(c *http.Client) Option { return func(s *Server) { s.pictureClient = c } }

// pictureFetcher is the outbound client for provider pictures: http(s) only,
// no private targets unless the owner allows them (the webhooks setting), a
// few redirects, the connection pinned to the checked address.
func (s *Server) pictureFetcher() *http.Client {
	if s.pictureClient != nil {
		return s.pictureClient
	}
	allow := func(context.Context) bool { return false }
	if s.hooks != nil {
		allow = s.hooks.AllowPrivate
	}
	return ob.NewClient(&ob.Dialer{Resolver: net.DefaultResolver, AllowPrivate: allow}, providerPictureTimeout, ob.FollowRedirects(3))
}

// syncProviderPicture stores the provider's picture as the account's profile
// picture when the switch is on and the person has not chosen their own.
func (s *Server) syncProviderPicture(ctx context.Context, u *auth.User, c oidc.Config, pictureURL string) {
	if !c.SyncPictures || pictureURL == "" || s.avatarPath(u.ID) == "" {
		return
	}
	src, err := s.auth.AvatarSource(ctx, u.ID)
	if err != nil {
		s.log.Warn("provider picture: read source", "err", err)
		return
	}
	switch {
	case src.Source == auth.AvatarSourceUpload:
		return // the person's own picture stays
	case src.ProviderURL == pictureURL && (src.Version > 0 || src.Source == ""):
		return // unchanged since the last sync, or removed by the person
	}
	if _, err := ob.ValidateURL(pictureURL); err != nil {
		s.log.Warn("provider picture: address refused", "err", err)
		return
	}
	data, err := s.fetchProviderPicture(ctx, pictureURL)
	if err != nil {
		s.log.Warn("provider picture: fetch", "err", err)
		return
	}
	if err := writeAvatarFile(s.avatarPath(u.ID), data); err != nil {
		s.log.Warn("provider picture: store", "err", err)
		return
	}
	if _, err := s.auth.SetAvatar(ctx, u.ID, true, auth.AvatarSourceProvider, pictureURL); err != nil {
		s.log.Warn("provider picture: record", "err", err)
		return
	}
	s.notifyCoMembers(ctx, u.ID)
}

// fetchProviderPicture downloads, checks, crops and re-encodes the picture.
func (s *Server) fetchProviderPicture(ctx context.Context, pictureURL string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, providerPictureTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pictureURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "image/png, image/jpeg, image/gif")
	resp, err := s.pictureFetcher().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("the provider answered " + resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, providerPictureMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > providerPictureMaxBytes {
		return nil, errors.New("the picture is larger than 2 MB")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("the picture is not a PNG, JPEG or GIF")
	}
	if cfg.Width < 1 || cfg.Height < 1 || cfg.Width > providerPictureMaxSide || cfg.Height > providerPictureMaxSide {
		return nil, errors.New("the picture's dimensions are out of range")
	}
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("the picture could not be read")
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, imgfit.Square(img, avatarSize), &jpeg.Options{Quality: avatarQuality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
