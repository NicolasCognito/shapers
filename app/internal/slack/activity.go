package slack

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// Who is active in Slack: members matched by email, presence polling,
// message/reaction events, and the admin overview.

func syncSlackUsers(app core.App) {
	people, err := client.people()
	if err != nil {
		slog.Warn("slack: users", "error", err)
		return
	}
	byEmail := map[string]slackUser{}
	for _, p := range people {
		if p.Profile.Email != "" {
			byEmail[strings.ToLower(p.Profile.Email)] = p
		}
	}
	users, _ := app.FindRecordsByFilter(org.ColUsers, "tier != '' && slack_id = ''", "", 0, 0)
	for _, u := range users {
		if p, ok := byEmail[strings.ToLower(u.Email())]; ok {
			u.Set("slack_id", p.ID)
			u.Set("slack_name", p.display())
			_ = app.Save(u)
		}
	}
}

func pollPresence(app core.App) {
	users, _ := app.FindRecordsByFilter(org.ColUsers, "slack_id != ''", "", 0, 0)
	for _, u := range users {
		var out struct {
			Presence string `json:"presence"`
		}
		if err := client.call("users.getPresence", url.Values{"user": {u.GetString("slack_id")}}, &out); err != nil {
			continue
		}
		if out.Presence == "active" {
			u.Set("slack_last_active", org.DBTime(time.Now()))
			_ = app.Save(u)
		}
	}
}

func slackTS(ts string) time.Time {
	f, err := strconv.ParseFloat(ts, 64)
	if err != nil {
		return time.Now()
	}
	return time.Unix(int64(f), 0)
}

func verifySlack(r *http.Request, body []byte) bool {
	secret := os.Getenv("SLACK_SIGNING_SECRET")
	ts := r.Header.Get("X-Slack-Request-Timestamp")
	sec, err := strconv.ParseInt(ts, 10, 64)
	if secret == "" || err != nil || time.Since(time.Unix(sec, 0)).Abs() > 5*time.Minute {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("v0:" + ts + ":"))
	mac.Write(body)
	want := "v0=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(r.Header.Get("X-Slack-Signature")))
}

func handleSlackEvents(e *core.RequestEvent) error {
	body, err := io.ReadAll(io.LimitReader(e.Request.Body, 1<<20))
	if err != nil || !verifySlack(e.Request, body) {
		return e.UnauthorizedError("bad signature", nil)
	}
	var in struct {
		Type      string `json:"type"`
		Challenge string `json:"challenge"`
		Event     struct {
			Type    string `json:"type"`
			Subtype string `json:"subtype"`
			User    string `json:"user"`
			BotID   string `json:"bot_id"`
			Channel string `json:"channel"`
			TS      string `json:"ts"`
			EventTS string `json:"event_ts"`
			Item    struct {
				Channel string `json:"channel"`
			} `json:"item"`
		} `json:"event"`
	}
	if err := json.NewDecoder(bytes.NewReader(body)).Decode(&in); err != nil {
		return e.BadRequestError("", err)
	}
	if in.Type == "url_verification" {
		return e.String(http.StatusOK, in.Challenge)
	}
	ev := in.Event
	kind, channel, ts := "", ev.Channel, ev.TS
	switch {
	case ev.Type == "message" && ev.BotID == "" && (ev.Subtype == "" || ev.Subtype == "thread_broadcast"):
		kind = "message"
	case ev.Type == "reaction_added":
		kind, channel, ts = "reaction", ev.Item.Channel, ev.EventTS
	}
	if kind != "" && ev.User != "" {
		if col, err := e.App.FindCollectionByNameOrId(org.ColSlackActivity); err == nil {
			r := core.NewRecord(col)
			r.Set("slack_user", ev.User)
			r.Set("kind", kind)
			r.Set("channel", channel)
			r.Set("at", org.DBTime(slackTS(ts)))
			_ = e.App.Save(r)
		}
	}
	return e.NoContent(http.StatusOK)
}

type slackMember struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	SlackID    string     `json:"slack_id"`
	SlackName  string     `json:"slack_name"`
	ActiveNow  bool       `json:"active_now"`
	LastActive *time.Time `json:"last_active"` // presence or activity, whichever is later
	Messages7  int        `json:"messages_7d"`
	Reactions7 int        `json:"reactions_7d"`
	QuietDays  int        `json:"quiet_days"` // -1 = never seen
}

func slackOverview(app core.App) ([]slackMember, error) {
	users, err := app.FindRecordsByFilter(org.ColUsers, "tier != ''", "name", 0, 0)
	if err != nil {
		return nil, err
	}
	since := time.Now().AddDate(0, 0, -7)
	out := make([]slackMember, 0, len(users))
	for _, u := range users {
		m := slackMember{ID: u.Id, Name: u.GetString("name"), SlackID: u.GetString("slack_id"), SlackName: u.GetString("slack_name"), QuietDays: -1}
		if m.SlackID != "" {
			last := u.GetDateTime("slack_last_active").Time()
			acts, _ := app.FindRecordsByFilter(org.ColSlackActivity, "slack_user = {:s}", "-at", 200, 0, dbx.Params{"s": m.SlackID})
			for i, a := range acts {
				at := a.GetDateTime("at").Time()
				if i == 0 && at.After(last) {
					last = at
				}
				if at.After(since) {
					if a.GetString("kind") == "message" {
						m.Messages7++
					} else {
						m.Reactions7++
					}
				}
			}
			if !last.IsZero() {
				l := last
				m.LastActive = &l
				m.ActiveNow = time.Since(last) < 20*time.Minute
				m.QuietDays = int(time.Since(last).Hours() / 24)
			}
		}
		out = append(out, m)
	}
	return out, nil
}
