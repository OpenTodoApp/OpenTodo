package web

import (
	"errors"
	"io/fs"
	"log/slog"

	"github.com/OpenTodoApp/opentodo/internal/websign"
)

// LogSignature writes one startup line about the embedded web app's signed
// file list (OpenSpec change signed-web-app, task 2.3): who signed it, its
// version, whether refusal is on, and a warning when the embedded files don't
// match the list. A build without a list (the web app not built) logs nothing.
func LogSignature(log *slog.Logger) {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return
	}
	logSignature(log, sub)
}

func logSignature(log *slog.Logger, sub fs.FS) {
	envelope, err := fs.ReadFile(sub, websign.FileName)
	if err != nil {
		return
	}
	report, m, err := websign.Inspect(envelope, websign.OfficialKeys().KeySPKIs())
	if err != nil {
		log.Warn("web app: the signed file list does not parse", "err", err)
		return
	}
	if errors.Is(report.SignatureErr, websign.ErrUnknownKey) {
		// An own-key build (design D11): signed by a key the list itself names.
		if own, _, err := websign.Inspect(envelope, m.KeySPKIs()); err == nil && own.Signer != "" {
			report = own
		}
	}
	key := ""
	if report.Signer != "" {
		key = websign.ShortFingerprint(report.Signer)
	}
	refuse := "off"
	if report.Refuse {
		refuse = "on"
	}
	log.Info("web app", "mode", report.Mode(), "key", key, "version", report.Version, "refuse", refuse)
	problems, err := websign.CheckFS(sub, m)
	if err != nil || len(problems) == 0 {
		return
	}
	log.Warn("web app: the embedded files do not match their list; installed apps will report or refuse this build", "problems", len(problems), "first", problems[0].String())
}
