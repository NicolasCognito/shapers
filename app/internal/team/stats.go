package team

import (
	"slices"
	"sort"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/org"
)

const historyWeeks = 6 // weeks of hour history in every summary

type weekHours struct {
	WeekStart string  `json:"week_start"`
	Hours     float64 `json:"hours"`
	Quota     float64 `json:"quota"`
	Met       bool    `json:"met"`
	Paused    bool    `json:"paused"` // on pause: not behind, doesn't break the streak
}

type attendanceStats struct {
	Present   int     `json:"present"`
	Remote    int     `json:"remote"`
	Excused   int     `json:"excused"`
	Unexcused int     `json:"unexcused"`
	Unmarked  int     `json:"unmarked"`
	Rate      float64 `json:"rate"` // (present+remote) / meetings held
}

func (s *attendanceStats) add(state string) {
	switch state {
	case "present":
		s.Present++
	case "remote":
		s.Remote++
	case "excused":
		s.Excused++
	case "unexcused":
		s.Unexcused++
	default:
		s.Unmarked++
	}
}

func (s *attendanceStats) finish() {
	total := s.Present + s.Remote + s.Excused + s.Unexcused + s.Unmarked
	if total > 0 {
		s.Rate = float64(s.Present+s.Remote) / float64(total)
	}
}

// dataset is everything analytics needs, loaded once per request
// (20 members, ~60 meetings: in-memory is simplest and fast).
type dataset struct {
	users      []*core.Record
	meetings   []*core.Record
	attendance map[string]string             // meetingID|userID -> state
	hours      map[string]map[string]float64 // userID -> weekStart -> hours
	weeks      []time.Time                   // oldest .. current
	tasksDone  map[string]int                // userID -> completed tasks (all time)
	lastDone   map[string]string             // userID -> last completion time
	pauses     map[string][]pausePeriod      // userID -> pauses
	late       map[string]bool               // meetingID|userID -> absence noticed too late
	notice     map[string]string             // meetingID|userID -> "can't come" reason
}

func loadDataset(app core.App) (*dataset, error) {
	ds := &dataset{attendance: map[string]string{}, hours: map[string]map[string]float64{}, late: map[string]bool{}, notice: map[string]string{}}
	var err error
	// Only roster members (with a tier) count in analytics.
	if ds.users, err = app.FindRecordsByFilter(org.ColUsers, "tier != ''", "", 0, 0); err != nil {
		return nil, err
	}
	sort.Slice(ds.users, func(i, j int) bool { return ds.users[i].GetString("name") < ds.users[j].GetString("name") })
	if ds.meetings, err = app.FindRecordsByFilter(org.ColMeetings, "", "start_at", 0, 0); err != nil {
		return nil, err
	}
	att, err := app.FindAllRecords(org.ColAttendance)
	if err != nil {
		return nil, err
	}
	for _, a := range att {
		key := a.GetString("meeting") + "|" + a.GetString("user")
		ds.attendance[key] = a.GetString("state")
		if a.GetBool("notice_late") {
			ds.late[key] = true
		}
		if a.GetString("source") == "notice" {
			ds.notice[key] = a.GetString("note")
		}
	}
	ds.pauses = loadPauses(app, "")
	cur := org.WeekStart(time.Now())
	for i := historyWeeks - 1; i >= 0; i-- {
		ds.weeks = append(ds.weeks, cur.AddDate(0, 0, -7*i))
	}
	logs, err := app.FindRecordsByFilter(org.ColHourLogs, "date >= {:d}", "", 0, 0, dbx.Params{"d": org.DBTime(ds.weeks[0])})
	if err != nil {
		return nil, err
	}
	for _, l := range logs {
		uid := l.GetString("user")
		if ds.hours[uid] == nil {
			ds.hours[uid] = map[string]float64{}
		}
		ds.hours[uid][org.WeekStart(l.GetDateTime("date").Time()).Format("2006-01-02")] += l.GetFloat("hours")
	}
	ds.tasksDone, ds.lastDone = completedTasks(app)
	return ds, nil
}

func (ds *dataset) weekHistory(u *core.Record) []weekHours {
	quota := u.GetFloat("weekly_hours")
	out := make([]weekHours, 0, len(ds.weeks))
	for _, w := range ds.weeks {
		k := w.Format("2006-01-02")
		h := ds.hours[u.Id][k]
		out = append(out, weekHours{WeekStart: k, Hours: h, Quota: quota, Met: quota > 0 && h >= quota, Paused: weekPaused(ds.pauses[u.Id], w)})
	}
	return out
}

// streak counts consecutive weeks with the quota met, ending with the last
// complete week (the current week counts too once it is already met).
// Paused weeks neither add to the streak nor break it.
func streak(hist []weekHours) int {
	n := 0
	for i := len(hist) - 1; i >= 0; i-- {
		if hist[i].Met {
			n++
		} else if hist[i].Paused {
			continue
		} else if i != len(hist)-1 {
			break
		}
	}
	return n
}

func (ds *dataset) memberAttendance(u *core.Record, now time.Time) (attendanceStats, map[string]*attendanceStats) {
	var total attendanceStats
	bySeries := map[string]*attendanceStats{}
	for _, m := range ds.meetings {
		if !m.GetDateTime("start_at").Time().Before(now) || !slices.Contains(m.GetStringSlice("members"), u.Id) {
			continue
		}
		st := ds.attendance[m.Id+"|"+u.Id]
		if (st == "" || st == "unexcused") && inPause(ds.pauses[u.Id], m.GetDateTime("start_at").Time()) {
			st = "excused" // on pause: missing a meeting is fine
		}
		total.add(st)
		s := m.GetString("series")
		if bySeries[s] == nil {
			bySeries[s] = &attendanceStats{}
		}
		bySeries[s].add(st)
	}
	total.finish()
	for _, s := range bySeries {
		s.finish()
	}
	return total, bySeries
}

type memberSummary struct {
	ID           string                      `json:"id"`
	Name         string                      `json:"name"`
	Email        string                      `json:"email"`
	Tier         string                      `json:"tier"`
	WeeklyHours  float64                     `json:"weekly_hours"`
	IsAdmin      bool                        `json:"is_admin"`
	Jarvis       bool                        `json:"jarvis_enabled"`
	Role         string                      `json:"role"`
	Series       []string                    `json:"series"`
	Weeks        []weekHours                 `json:"weeks"`
	ThisWeek     float64                     `json:"this_week"`
	Progress     float64                     `json:"progress"` // this week / quota
	Expected     float64                     `json:"expected"` // pro-rata quota by today
	Behind       bool                        `json:"behind"`
	Paused       bool                        `json:"paused"`          // this week is on pause
	Pause        *pausePeriod                `json:"pause,omitempty"` // running or next pause
	Community    *communityStats             `json:"community,omitempty"`
	Streak       int                         `json:"streak"`
	Attendance   attendanceStats             `json:"attendance"`
	BySeries     map[string]*attendanceStats `json:"by_series"`
	TasksDone    int                         `json:"tasks_done"`
	LastTaskDone string                      `json:"last_task_done"`
}

func (ds *dataset) summary(u *core.Record, now time.Time) memberSummary {
	hist := ds.weekHistory(u)
	quota := u.GetFloat("weekly_hours")
	this := hist[len(hist)-1].Hours
	// Pro-rata over a 5-day week: by Wednesday you should have ~3/5 of it.
	day := min((int(now.In(org.Location).Weekday())+6)%7+1, 5)
	expected := quota * float64(day) / 5
	att, bySeries := ds.memberAttendance(u, now)
	s := memberSummary{
		ID: u.Id, Name: u.GetString("name"), Email: u.Email(), Tier: u.GetString("tier"),
		WeeklyHours: quota, IsAdmin: u.GetBool("is_admin"), Jarvis: u.GetBool("jarvis_enabled"), Role: org.RoleOf(u), Series: u.GetStringSlice("series"),
		Weeks: hist, ThisWeek: this, Expected: expected, Behind: this < expected && !hist[len(hist)-1].Paused,
		Paused: hist[len(hist)-1].Paused, Pause: currentOrNextPause(ds.pauses[u.Id], now), Community: ds.community(u, now),
		Streak: streak(hist), Attendance: att, BySeries: bySeries,
		TasksDone: ds.tasksDone[u.Id], LastTaskDone: ds.lastDone[u.Id],
	}
	if quota > 0 {
		s.Progress = this / quota
	}
	return s
}
