package calsync

import (
	"context"
	"time"
)

// The worker's side of Microsoft connections (outlook-calendar-sync D3, D4).

// mailboxZone is the mailbox time zone discovery recorded on the calendars of
// a Microsoft connection (an IANA name, "" when unknown).
func (c *Connection) mailboxZone() string {
	if cal := c.Calendar(c.TargetURL); cal != nil {
		return cal.TimeZone
	}
	for _, cal := range c.Calendars {
		if cal.TimeZone != "" {
			return cal.TimeZone
		}
	}
	return ""
}

// graphFor builds the Graph client of a Microsoft connection.
func (w *Worker) graphFor(ctx context.Context, c *Connection) (*Graph, error) {
	refresh, err := w.Secrets.Get(c.ID)
	if err != nil {
		return nil, err
	}
	if refresh == "" {
		return nil, &Error{Reason: ReasonSecretMissing}
	}
	access, err := w.microsoftAccess(ctx, c.ID, refresh)
	if err != nil {
		return nil, err
	}
	return w.Graph(access), nil
}

// Graph is a Graph client for an access token.
func (w *Worker) Graph(access string) *Graph {
	return NewGraph(w.HTTP, w.GraphBase, access, w.Version, w.clock)
}

// microsoftAccess returns an access token, refreshing it when it expires
// within five minutes. Microsoft rotates refresh tokens: the new one is stored
// before the access token is used, so a crash in between cannot lose the
// grant (design D4). A refused client secret stops every Microsoft
// connection.
func (w *Worker) microsoftAccess(ctx context.Context, connID, refresh string) (string, error) {
	if tok, ok := w.tokens.get(connID, w.clock().Add(4*time.Minute)); ok {
		return tok, nil
	}
	client, err := w.Microsoft.Client(ctx)
	if err != nil {
		return "", err
	}
	if !client.Complete() {
		return "", &Error{Reason: ReasonMicrosoftMissing}
	}
	t, err := w.MicrosoftToken.Refresh(ctx, client, refresh)
	if reasonOf(err) == ReasonMicrosoftClient {
		w.microsoftRefused(ctx)
	}
	if err != nil {
		return "", err
	}
	if t.Refresh != "" && t.Refresh != refresh {
		if err := w.Secrets.Set(connID, t.Refresh); err != nil {
			return "", err
		}
	}
	w.tokens.put(connID, *t)
	return t.Access, nil
}

// microsoftRefused records that Microsoft refused the owner's client secret
// and stops every Microsoft connection until a new one is saved.
func (w *Worker) microsoftRefused(ctx context.Context) {
	if err := w.Microsoft.Store.Set(ctx, MicrosoftRefusedKey, w.clock().UnixMilli()); err != nil {
		w.log().Error("calendar sync: record refused Microsoft client", "err", err)
	}
	if _, err := w.Store.StopProvider(ctx, ProviderMicrosoft, ReasonMicrosoftClient); err != nil {
		w.log().Error("calendar sync: stop Microsoft connections", "err", err)
	}
	w.Changed()
}

// MicrosoftClientSaved resumes the Microsoft connections a refused or missing
// client stopped and makes them due now (the owner saved a client).
func (w *Worker) MicrosoftClientSaved(ctx context.Context) error {
	if _, err := w.Store.ResumeProvider(ctx, ProviderMicrosoft, ReasonMicrosoftClient, ReasonMicrosoftMissing); err != nil {
		return err
	}
	w.Changed()
	return nil
}

// DiscoverMicrosoft reads a Microsoft account with a fresh access token.
func (w *Worker) DiscoverMicrosoft(ctx context.Context, access string) (*MicrosoftAccount, error) {
	return w.Graph(access).Discover(ctx)
}
