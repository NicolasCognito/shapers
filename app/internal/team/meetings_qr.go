package team

import (
	"os"

	"github.com/pocketbase/pocketbase/core"
	"github.com/skip2/go-qrcode"
	"github.com/xusenlin/workavera/internal/org"
)

// publicBase is the address the request came to (so the QR matches the page
// that shows it), or PUBLIC_URL when the host is unknown.
func publicBase(e *core.RequestEvent) string {
	if e.Request.Host == "" {
		return os.Getenv("PUBLIC_URL")
	}
	scheme := "http"
	if e.Request.TLS != nil || e.Request.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + e.Request.Host
}

// GET /api/team/qr/{id} — PNG QR code of a meeting's clock-in link. Public on
// purpose: Slack fetches it for the reminder image, and the link itself still
// needs a signed-in member.
func handleMeetingQR(e *core.RequestEvent) error {
	m, err := e.App.FindRecordById(org.ColMeetings, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Meeting not found.", err)
	}
	png, err := qrcode.Encode(org.CheckinURL(publicBase(e), m.Id), qrcode.Medium, 512)
	if err != nil {
		return e.InternalServerError("", err)
	}
	e.Response.Header().Set("Cache-Control", "public, max-age=86400")
	return e.Blob(200, "image/png", png)
}
