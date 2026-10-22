package httpapi

import (
	"archive/zip"
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/pixari/opentodo/internal/auth"
)

// Profile pictures (OpenSpec change settings-refresh, design D10). The client
// crops and scales; the server accepts only a 256×256 PNG or JPEG of at most
// 512 KB, decodes it with the standard library and re-encodes it as JPEG, so
// no metadata (a location, a camera) and no other content survives. The file is
// <data>/avatars/<user id>.jpg; the account's avatar_version names it in URLs.

const (
	avatarSize     = 256
	avatarMaxBytes = 512 << 10
	avatarQuality  = 85
	// avatarCache is for a versioned address: a new picture gets a new one.
	avatarCache = "private, max-age=31536000, immutable"
)

// avatarID is the shape of an account id that may name a file (the backup
// archive checks the same shape).
var avatarID = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// avatarPath is where an account's picture lives; "" without a data directory.
func (s *Server) avatarPath(userID string) string {
	if s.cfg.DataDir == "" || !avatarID.MatchString(userID) {
		return ""
	}
	return filepath.Join(s.cfg.DataDir, "avatars", userID+".jpg")
}

// decodeAvatar checks and re-encodes an uploaded picture.
func decodeAvatar(body []byte) ([]byte, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil || (format != "png" && format != "jpeg") {
		return nil, errors.New("upload a PNG or JPEG image")
	}
	if cfg.Width != avatarSize || cfg.Height != avatarSize {
		return nil, errors.New("the picture must be 256×256 pixels")
	}
	var img image.Image
	if format == "png" {
		img, err = png.Decode(bytes.NewReader(body))
	} else {
		img, err = jpeg.Decode(bytes.NewReader(body))
	}
	if err != nil {
		return nil, errors.New("the image could not be read")
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: avatarQuality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// writeAvatarFile replaces path with data via a temporary file and a rename.
func writeAvatarFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".avatar-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

func (s *Server) handlePutAvatar(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	path := s.avatarPath(u.ID)
	if path == "" {
		writeError(w, http.StatusNotFound, "not_found", "profile pictures need a data directory")
		return
	}
	if !s.avatarLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many pictures, try again later")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, avatarMaxBytes))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "the picture must be at most 512 KB")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "the picture could not be read")
		return
	}
	out, err := decodeAvatar(body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	if err := writeAvatarFile(path, out); err != nil {
		s.internal(w, err)
		return
	}
	if _, err := s.auth.BumpAvatar(r.Context(), u.ID, true); err != nil {
		s.internal(w, err)
		return
	}
	s.notifyCoMembers(r.Context(), u.ID)
	s.writeProfile(w, r, u)
}

func (s *Server) handleDeleteAvatar(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if path := s.avatarPath(u.ID); path != "" {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			s.internal(w, err)
			return
		}
	}
	if _, err := s.auth.BumpAvatar(r.Context(), u.ID, false); err != nil {
		s.internal(w, err)
		return
	}
	s.notifyCoMembers(r.Context(), u.ID)
	s.writeProfile(w, r, u)
}

// handleGetAvatar serves a picture to the account itself and to accounts that
// share a project with it; everyone else gets the same 404 as for an account
// without a picture.
func (s *Server) handleGetAvatar(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	notFound := func() { writeError(w, http.StatusNotFound, "not_found", "no picture") }
	if id != u.ID {
		shared, err := s.sync.SharesProject(r.Context(), u.ID, id)
		if err != nil {
			s.internal(w, err)
			return
		}
		if !shared {
			notFound()
			return
		}
	}
	version, err := s.auth.AvatarVersion(r.Context(), id)
	if errors.Is(err, auth.ErrNotFound) || (err == nil && version == 0) {
		notFound()
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	path := s.avatarPath(id)
	data, err := os.ReadFile(path)
	if path == "" || errors.Is(err, os.ErrNotExist) {
		notFound()
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	// Only the current version's address is cacheable for good.
	if r.URL.Query().Get("v") == strconv.Itoa(version) {
		w.Header().Set("Cache-Control", avatarCache)
	} else {
		w.Header().Set("Cache-Control", "private, no-cache")
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

// removeAvatar deletes a deleted account's picture.
func (s *Server) removeAvatar(userID string) {
	if path := s.avatarPath(userID); path != "" {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			s.log.Warn("remove profile picture", "err", err)
		}
	}
}

// exportAvatar adds the account's picture to its export archive as profile/picture.jpg.
func (s *Server) exportAvatar(zw *zip.Writer, userID string) {
	path := s.avatarPath(userID)
	if path == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	if fw, err := zw.CreateHeader(&zip.FileHeader{Name: "profile/picture.jpg", Method: zip.Store}); err == nil {
		_, _ = fw.Write(data)
	}
}
