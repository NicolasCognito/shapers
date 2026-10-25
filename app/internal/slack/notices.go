package slack

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

// Posts to the channel: announcements, reminders, reschedule/cancel notes
// and absence notices.

// noticesMu keeps the scheduled run and the run after a calendar sync from
// posting the same notice twice.
var noticesMu sync.Mutex

// NoticesNow posts due announcements, reminders and reschedule notes
// right away (after a calendar sync), instead of waiting for the schedule.
func NoticesNow(app core.App) {
	if client != nil {
		postMeetingNotices(app)
	}
}

// postMeetingNotices runs every few minutes: one announcement per meeting
// once it is less than 3 days away, one reminder once less than 1 day away.
// Sent posts are recorded, so reschedules never cause duplicates.
func postMeetingNotices(app core.App) {
	noticesMu.Lock()
	defer noticesMu.Unlock()
	ch, err := client.channel()
	if err != nil {
		slog.Warn("slack: channel", "error", err)
		return
	}
	now := time.Now()
	meetings, err := app.FindRecordsByFilter(org.ColMeetings, "start_at > {:now} && start_at <= {:until}", "start_at", 0, 0,
		dbx.Params{"now": org.DBTime(now), "until": org.DBTime(now.Add(72 * time.Hour))})
	if err != nil {
		return
	}
	col, err := app.FindCollectionByNameOrId(org.ColSlackPosts)
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
			if _, err := app.FindFirstRecordByFilter(org.ColSlackPosts, "meeting = {:m} && kind = {:k}", dbx.Params{"m": m.Id, "k": kind}); err == nil {
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
			if err := client.call("chat.postMessage", params, &out); err != nil {
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

func meetingText(app core.App, m *core.Record, remind bool) string {
	start := m.GetDateTime("start_at").Time().In(org.Location)
	end := m.GetDateTime("end_at").Time().In(org.Location)
	var b strings.Builder
	if remind {
		fmt.Fprintf(&b, "⏰ *%s:* ", dayWord(start, time.Now().In(org.Location)))
	} else {
		b.WriteString("📅 *Coming up:* ")
	}
	fmt.Fprintf(&b, "*%s* · %s\n", m.GetString("series"), m.GetString("title"))
	fmt.Fprintf(&b, "%s, %s–%s", start.Format("Mon 2 Jan"), start.Format("15:04"), end.Format("15:04"))
	if loc := m.GetString("location"); loc != "" {
		fmt.Fprintf(&b, " · %s", loc)
	}
	if base := org.PublicURL(); base != "" {
		// Opens the clock-in for this meeting (works 30 min before to 30 min after).
		fmt.Fprintf(&b, "\n<%s|✅ Check in at the meeting> (opens 30 min before)", org.CheckinURL(base, m.Id))
	}
	if remind {
		var tags []string
		for _, uid := range m.GetStringSlice("members") {
			if u, err := app.FindRecordById(org.ColUsers, uid); err == nil && u.GetString("slack_id") != "" {
				tags = append(tags, "<@"+u.GetString("slack_id")+">")
			}
		}
		if len(tags) > 0 {
			b.WriteString("\n" + strings.Join(tags, " "))
		}
	}
	return b.String()
}

// dayWord names the meeting day relative to now: Today, Tomorrow or the date.
func dayWord(start, now time.Time) string {
	y, m, d := now.Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, org.Location)
	switch {
	case start.Before(today.AddDate(0, 0, 1)):
		return "Today"
	case start.Before(today.AddDate(0, 0, 2)):
		return "Tomorrow"
	}
	return start.Format("Mon 2 Jan")
}

// reminderBlocks is the reminder text with the room QR code under it, so an
// admin can put it on the screen straight from Slack. Needs PUBLIC_URL:
// Slack downloads the image from there.
func reminderBlocks(text, meetingID string) string {
	base := org.PublicURL()
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
	t = t.In(org.Location)
	return t.Format("Mon 2 Jan, 15:04")
}

// followUpReschedules adds a note to the channel when a meeting that was
// already announced moved to another time. The original post stays as is.
func followUpReschedules(app core.App, ch string) {
	posts, err := app.FindRecordsByFilter(org.ColSlackPosts, "kind = 'announce'", "", 0, 0)
	if err != nil {
		return
	}
	for _, p := range posts {
		m, err := app.FindRecordById(org.ColMeetings, p.GetString("meeting"))
		if err != nil {
			continue
		}
		was, now := p.GetDateTime("start_at").Time(), m.GetDateTime("start_at").Time()
		if was.IsZero() || was.Equal(now) || now.Before(time.Now()) {
			continue
		}
		text := fmt.Sprintf("⚠️ *Rescheduled:* *%s* · %s\nwas %s, now *%s*", m.GetString("series"), m.GetString("title"), meetingWhen(was), meetingWhen(now))
		if err := client.call("chat.postMessage", url.Values{"channel": {ch}, "text": {text}}, nil); err != nil {
			slog.Warn("slack: reschedule note", "error", err)
			continue
		}
		p.Set("start_at", m.GetDateTime("start_at"))
		_ = app.Save(p)
		// A reminder already sent for the old time no longer applies.
		if r, err := app.FindFirstRecordByFilter(org.ColSlackPosts, "meeting = {:m} && kind = 'remind'", dbx.Params{"m": m.Id}); err == nil {
			_ = app.Delete(r)
		}
	}
}

// MeetingCancelled posts a note when an announced meeting disappears from
// the calendar.
func MeetingCancelled(app core.App, m *core.Record) {
	if client == nil {
		return
	}
	if _, err := app.FindFirstRecordByFilter(org.ColSlackPosts, "meeting = {:m}", dbx.Params{"m": m.Id}); err != nil {
		return // never announced: nothing to correct
	}
	ch, err := client.channel()
	if err != nil {
		return
	}
	text := fmt.Sprintf("❌ *Cancelled:* *%s* · %s (%s)", m.GetString("series"), m.GetString("title"), meetingWhen(m.GetDateTime("start_at").Time()))
	if err := client.call("chat.postMessage", url.Values{"channel": {ch}, "text": {text}}, nil); err != nil {
		slog.Warn("slack: cancel note", "error", err)
	}
}

// AbsenceNotice tells the channel that a member can't come to a meeting.
// late and need describe a GO! notice given less than need hours ahead.
func AbsenceNotice(u, m *core.Record, reason string, late bool, need int) {
	if client == nil {
		return
	}
	ch, err := client.channel()
	if err != nil {
		return
	}
	who := "*" + u.GetString("name") + "*"
	if id := u.GetString("slack_id"); id != "" {
		who = "<@" + id + ">"
	}
	text := fmt.Sprintf("🙋 %s can't make it to *%s* · %s (%s)\n> %s", who, m.GetString("series"), m.GetString("title"),
		meetingWhen(m.GetDateTime("start_at").Time()), reason)
	if late {
		text += fmt.Sprintf("\n_Short notice: GO! members let the team know %d h ahead._", need)
	}
	if err := client.call("chat.postMessage", url.Values{"channel": {ch}, "text": {text}}, nil); err != nil {
		slog.Warn("slack: absence notice", "error", err)
	}
}
