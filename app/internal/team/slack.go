package team

// Slack extras (from the brief): meeting announcements 3 days and reminders
// 1 day before, and an admin-only activity signal (posts, reactions,
// presence). Everything is off unless SLACK_BOT_TOKEN is set.
//
// Env:
//   SLACK_BOT_TOKEN       xoxb-… (chat:write, users:read(.email), channels:read/history/join, reactions:read)
//   SLACK_SIGNING_SECRET  verifies events Slack sends to /api/slack/events
//   SLACK_CHANNEL         channel name for announcements (default all-shapershackathon)
//   PUBLIC_URL            app address used in links
//   SLACK_DEMO_MAPPING=1  admins may link members to Slack users by hand
//                         (sandbox emails don't exist in Slack); off in production

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	colSlackPosts    = "slack_posts"
	colSlackActivity = "slack_activity"
)

type slackClient struct {
	token string
	http  *http.Client

	mu        sync.Mutex
	channelID string
}

var slack *slackClient

func slackDemoMapping() bool { return os.Getenv("SLACK_DEMO_MAPPING") == "1" }

func (c *slackClient) call(method string, params url.Values, out any) error {
	req, err := http.NewRequest(http.MethodPost, "https://slack.com/api/"+method, strings.NewReader(params.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	var head struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return err
	}
	if !head.OK {
		return fmt.Errorf("slack %s: %s", method, head.Error)
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

type slackUser struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Deleted bool   `json:"deleted"`
	IsBot   bool   `json:"is_bot"`
	Profile struct {
		RealName string `json:"real_name"`
		Email    string `json:"email"`
	} `json:"profile"`
}

func (u slackUser) display() string {
	if u.Profile.RealName != "" {
		return u.Profile.RealName
	}
	return u.Name
}

func (c *slackClient) people() ([]slackUser, error) {
	var out struct {
		Members []slackUser `json:"members"`
	}
	if err := c.call("users.list", url.Values{"limit": {"500"}}, &out); err != nil {
		return nil, err
	}
	return slices.DeleteFunc(out.Members, func(u slackUser) bool {
		return u.Deleted || u.IsBot || u.ID == "USLACKBOT"
	}), nil
}

// channel resolves SLACK_CHANNEL to an id once and makes sure the bot is in it.
func (c *slackClient) channel() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.channelID != "" {
		return c.channelID, nil
	}
	name := strings.TrimPrefix(os.Getenv("SLACK_CHANNEL"), "#")
	if name == "" {
		name = "all-shapershackathon"
	}
	var out struct {
		Channels []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"channels"`
	}
	if err := c.call("conversations.list", url.Values{"types": {"public_channel"}, "limit": {"500"}}, &out); err != nil {
		return "", err
	}
	for _, ch := range out.Channels {
		if ch.Name == name {
			_ = c.call("conversations.join", url.Values{"channel": {ch.ID}}, nil)
			c.channelID = ch.ID
			return ch.ID, nil
		}
	}
	return "", errors.New("slack channel not found: " + name)
}

// ---------- users: email matching (production path) ----------

func syncSlackUsers(app core.App) {
	people, err := slack.people()
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
	users, _ := app.FindRecordsByFilter(colUsers, "tier != '' && slack_id = ''", "", 0, 0)
	for _, u := range users {
		if p, ok := byEmail[strings.ToLower(u.Email())]; ok {
			u.Set("slack_id", p.ID)
			u.Set("slack_name", p.display())
			_ = app.Save(u)
		}
	}
}

// ---------- announcements and reminders ----------

func meetingText(app core.App, m *core.Record, remind bool) string {
	start := m.GetDateTime("start_at").Time().In(Location)
	end := m.GetDateTime("end_at").Time().In(Location)
	var b strings.Builder
	if remind {
		b.WriteString("⏰ *Tomorrow:* ")
	} else {
		b.WriteString("📅 *Coming up:* ")
	}
	fmt.Fprintf(&b, "*%s* · %s\n", m.GetString("series"), m.GetString("title"))
	fmt.Fprintf(&b, "%s, %s–%s", start.Format("Mon 2 Jan"), start.Format("15:04"), end.Format("15:04"))
	if loc := m.GetString("location"); loc != "" {
		fmt.Fprintf(&b, " · %s", loc)
	}
	if base := strings.TrimRight(os.Getenv("PUBLIC_URL"), "/"); base != "" {
		// Opens the clock-in for this meeting (works 30 min before to 30 min after).
		fmt.Fprintf(&b, "\n<%s|✅ Check in at the meeting> (opens 30 min before)", checkinURL(base, m.Id))
	}
	if remind {
		var tags []string
		for _, uid := range m.GetStringSlice("members") {
			if u, err := app.FindRecordById(colUsers, uid); err == nil && u.GetString("slack_id") != "" {
				tags = append(tags, "<@"+u.GetString("slack_id")+">")
			}
		}
		if len(tags) > 0 {
			b.WriteString("\n" + strings.Join(tags, " "))
		}
	}
	return b.String()
}

// postMeetingNotices runs every few minutes: one announcement per meeting
// once it is less than 3 days away, one reminder once less than 1 day away.
// Sent posts are recorded, so reschedules never cause duplicates.
func postMeetingNotices(app core.App) {
	ch, err := slack.channel()
	if err != nil {
		slog.Warn("slack: channel", "error", err)
		return
	}
	now := time.Now()
	meetings, err := app.FindRecordsByFilter(colMeetings, "start_at > {:now} && start_at <= {:until}", "start_at", 0, 0,
		dbx.Params{"now": dbTime(now), "until": dbTime(now.Add(72 * time.Hour))})
	if err != nil {
		return
	}
	col, err := app.FindCollectionByNameOrId(colSlackPosts)
	if err != nil {
		return
	}
	followUpReschedules(app, ch)
	for _, m := range meetings {
		start := m.GetDateTime("start_at").Time()
		for _, kind := range []string{"announce", "remind"} {
			if kind == "remind" && start.Sub(now) > 24*time.Hour {
				continue
			}
			if _, err := app.FindFirstRecordByFilter(colSlackPosts, "meeting = {:m} && kind = {:k}", dbx.Params{"m": m.Id, "k": kind}); err == nil {
				continue
			}
			var out struct {
				TS string `json:"ts"`
			}
			params := url.Values{
				"channel": {ch}, "text": {meetingText(app, m, kind == "remind")}, "unfurl_links": {"false"},
			}
			if kind == "remind" {
				if blocks := reminderBlocks(params.Get("text"), m.Id); blocks != "" {
					params.Set("blocks", blocks)
				}
			}
			if err := slack.call("chat.postMessage", params, &out); err != nil {
				slog.Warn("slack: post", "meeting", m.Id, "error", err)
				continue
			}
			r := core.NewRecord(col)
			r.Set("meeting", m.Id)
			r.Set("kind", kind)
			r.Set("channel", ch)
			r.Set("ts", out.TS)
			r.Set("start_at", m.GetDateTime("start_at"))
			_ = app.Save(r)
		}
	}
}

// reminderBlocks is the reminder text with the room QR code under it, so an
// admin can put it on the screen straight from Slack. Needs PUBLIC_URL:
// Slack downloads the image from there.
func reminderBlocks(text, meetingID string) string {
	base := strings.TrimRight(os.Getenv("PUBLIC_URL"), "/")
	if base == "" {
		return ""
	}
	blocks := []map[string]any{
		{"type": "section", "text": map[string]string{"type": "mrkdwn", "text": text}},
		{"type": "image", "image_url": base + "/api/team/qr/" + meetingID, "alt_text": "Check-in QR code for the room screen"},
	}
	data, _ := json.Marshal(blocks)
	return string(data)
}

func meetingWhen(t time.Time) string {
	t = t.In(Location)
	return t.Format("Mon 2 Jan, 15:04")
}

// followUpReschedules adds a note to the channel when a meeting that was
// already announced moved to another time. The original post stays as is.
func followUpReschedules(app core.App, ch string) {
	posts, err := app.FindRecordsByFilter(colSlackPosts, "kind = 'announce'", "", 0, 0)
	if err != nil {
		return
	}
	for _, p := range posts {
		m, err := app.FindRecordById(colMeetings, p.GetString("meeting"))
		if err != nil {
			continue
		}
		was, now := p.GetDateTime("start_at").Time(), m.GetDateTime("start_at").Time()
		if was.IsZero() || was.Equal(now) || now.Before(time.Now()) {
			continue
		}
		text := fmt.Sprintf("⚠️ *Rescheduled:* *%s* · %s\nwas %s, now *%s*", m.GetString("series"), m.GetString("title"), meetingWhen(was), meetingWhen(now))
		if err := slack.call("chat.postMessage", url.Values{"channel": {ch}, "text": {text}}, nil); err != nil {
			slog.Warn("slack: reschedule note", "error", err)
			continue
		}
		p.Set("start_at", m.GetDateTime("start_at"))
		_ = app.Save(p)
		// A reminder already sent for the old time no longer applies.
		if r, err := app.FindFirstRecordByFilter(colSlackPosts, "meeting = {:m} && kind = 'remind'", dbx.Params{"m": m.Id}); err == nil {
			_ = app.Delete(r)
		}
	}
}

// slackMeetingCancelled posts a note when an announced meeting disappears
// from the calendar.
func slackMeetingCancelled(app core.App, m *core.Record) {
	if slack == nil {
		return
	}
	if _, err := app.FindFirstRecordByFilter(colSlackPosts, "meeting = {:m}", dbx.Params{"m": m.Id}); err != nil {
		return // never announced: nothing to correct
	}
	ch, err := slack.channel()
	if err != nil {
		return
	}
	text := fmt.Sprintf("❌ *Cancelled:* *%s* · %s (%s)", m.GetString("series"), m.GetString("title"), meetingWhen(m.GetDateTime("start_at").Time()))
	if err := slack.call("chat.postMessage", url.Values{"channel": {ch}, "text": {text}}, nil); err != nil {
		slog.Warn("slack: cancel note", "error", err)
	}
}

// ---------- activity: events + presence ----------

func pollPresence(app core.App) {
	users, _ := app.FindRecordsByFilter(colUsers, "slack_id != ''", "", 0, 0)
	for _, u := range users {
		var out struct {
			Presence string `json:"presence"`
		}
		if err := slack.call("users.getPresence", url.Values{"user": {u.GetString("slack_id")}}, &out); err != nil {
			continue
		}
		if out.Presence == "active" {
			u.Set("slack_last_active", dbTime(time.Now()))
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
		if col, err := e.App.FindCollectionByNameOrId(colSlackActivity); err == nil {
			r := core.NewRecord(col)
			r.Set("slack_user", ev.User)
			r.Set("kind", kind)
			r.Set("channel", channel)
			r.Set("at", dbTime(slackTS(ts)))
			_ = e.App.Save(r)
		}
	}
	return e.NoContent(http.StatusOK)
}

// ---------- admin view ----------

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
	users, err := app.FindRecordsByFilter(colUsers, "tier != ''", "name", 0, 0)
	if err != nil {
		return nil, err
	}
	since := time.Now().AddDate(0, 0, -7)
	out := make([]slackMember, 0, len(users))
	for _, u := range users {
		m := slackMember{ID: u.Id, Name: u.GetString("name"), SlackID: u.GetString("slack_id"), SlackName: u.GetString("slack_name"), QuietDays: -1}
		if m.SlackID != "" {
			last := u.GetDateTime("slack_last_active").Time()
			acts, _ := app.FindRecordsByFilter(colSlackActivity, "slack_user = {:s}", "-at", 200, 0, dbx.Params{"s": m.SlackID})
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

func registerSlackRoutes(se *core.ServeEvent) {
	// Slack calls this; authenticity comes from the signing secret.
	se.Router.POST("/api/slack/events", handleSlackEvents)

	g := se.Router.Group("/api/team/slack")
	g.Bind(apis.RequireAuth(colUsers))
	g.GET("", requirePerm(PermTeamView, func(e *core.RequestEvent) error {
		if slack == nil {
			return e.JSON(200, map[string]any{"enabled": false})
		}
		members, err := slackOverview(e.App)
		if err != nil {
			return e.InternalServerError("", err)
		}
		return e.JSON(200, map[string]any{"enabled": true, "demo_mapping": slackDemoMapping(), "members": members})
	}))
	g.GET("/people", requirePerm(PermTeamView, func(e *core.RequestEvent) error {
		if slack == nil || !slackDemoMapping() {
			return e.ForbiddenError("Manual Slack linking is off on this server.", nil)
		}
		people, err := slack.people()
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		list := make([]map[string]string, 0, len(people))
		for _, p := range people {
			list = append(list, map[string]string{"id": p.ID, "name": p.display()})
		}
		return e.JSON(200, list)
	}))
	g.POST("/link", requirePerm(PermMembersManage, func(e *core.RequestEvent) error {
		if slack == nil || !slackDemoMapping() {
			return e.ForbiddenError("Manual Slack linking is off on this server.", nil)
		}
		var in struct {
			Member  string `json:"member"`
			SlackID string `json:"slack_id"`
		}
		if err := e.BindBody(&in); err != nil {
			return e.BadRequestError("", err)
		}
		u, err := e.App.FindRecordById(colUsers, in.Member)
		if err != nil {
			return e.NotFoundError("", err)
		}
		name := ""
		if in.SlackID != "" {
			people, err := slack.people()
			if err != nil {
				return e.BadRequestError(err.Error(), nil)
			}
			for _, p := range people {
				if p.ID == in.SlackID {
					name = p.display()
				}
			}
			if name == "" {
				return e.BadRequestError("No such Slack user.", nil)
			}
		}
		u.Set("slack_id", in.SlackID)
		u.Set("slack_name", name)
		if err := e.App.Save(u); err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, map[string]any{"ok": true})
	}))
}

func registerSlack(app *pocketbase.PocketBase) {
	token := strings.TrimSpace(os.Getenv("SLACK_BOT_TOKEN"))
	if token != "" {
		slack = &slackClient{token: token, http: &http.Client{Timeout: 20 * time.Second}}
		app.OnServe().BindFunc(func(se *core.ServeEvent) error {
			go func() {
				syncSlackUsers(se.App)
				postMeetingNotices(se.App)
			}()
			return se.Next()
		})
		app.Cron().MustAdd("slack_notices", "*/10 * * * *", func() { postMeetingNotices(app) })
		app.Cron().MustAdd("slack_presence", "*/15 * * * *", func() { pollPresence(app) })
		app.Cron().MustAdd("slack_users", "7 * * * *", func() { syncSlackUsers(app) })
	}
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		registerSlackRoutes(se)
		return se.Next()
	})
}
