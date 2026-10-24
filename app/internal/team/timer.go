package team

import (
	"errors"
	"math"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	colTimers   = "work_timers"
	maxTimerHrs = 12.0 // longer than this is a forgotten timer, not work
)

type TimerView struct {
	ID             string    `json:"id"`
	StartedAt      time.Time `json:"started_at"`
	PlannedMinutes int       `json:"planned_minutes"` // 0 = open-ended
	ElapsedMinutes float64   `json:"elapsed_minutes"`
}

func timerView(r *core.Record) *TimerView {
	start := r.GetDateTime("started_at").Time()
	return &TimerView{
		ID: r.Id, StartedAt: start, PlannedMinutes: r.GetInt("planned_minutes"),
		ElapsedMinutes: time.Since(start).Minutes(),
	}
}

func findTimer(app core.App, userID string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(colTimers, "user = {:u}", dbx.Params{"u": userID})
}

// StartTimer starts (or restarts) the actor's timer. planned is in minutes, 0 = open-ended.
func StartTimer(app core.App, userID string, planned int) (*TimerView, error) {
	if planned < 0 || planned > 12*60 {
		return nil, errors.New("plan between 0 and 12 hours")
	}
	if r, err := findTimer(app, userID); err == nil {
		return timerView(r), errors.New("a timer is already running")
	}
	col, err := app.FindCollectionByNameOrId(colTimers)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("user", userID)
	r.Set("started_at", dbTime(time.Now()))
	r.Set("planned_minutes", planned)
	return timerView(r), app.Save(r)
}

// ExtendTimer adds minutes to the plan (an open timer gets a plan from now).
func ExtendTimer(app core.App, userID string, minutes int) (*TimerView, error) {
	r, err := findTimer(app, userID)
	if err != nil {
		return nil, errors.New("no timer is running")
	}
	if minutes <= 0 || minutes > 6*60 {
		return nil, errors.New("extend by 1 to 360 minutes")
	}
	base := r.GetInt("planned_minutes")
	if base == 0 {
		base = int(timerView(r).ElapsedMinutes)
	}
	r.Set("planned_minutes", base+minutes)
	return timerView(r), app.Save(r)
}

// StopTimer ends the timer. With log=true it records hours: the requested
// amount, never more than actually elapsed (rounded to 15 min) or 12 h.
func StopTimer(app core.App, userID string, log bool, hours float64, note string) (map[string]any, error) {
	r, err := findTimer(app, userID)
	if err != nil {
		return nil, errors.New("no timer is running")
	}
	v := timerView(r)
	elapsed := math.Ceil(v.ElapsedMinutes/15) * 0.25 // round up to the next 15 min
	elapsed = math.Max(elapsed, 0.25)
	out := map[string]any{"ok": true, "elapsed_hours": elapsed, "logged": false}
	return out, app.RunInTransaction(func(tx core.App) error {
		if log {
			if hours <= 0 {
				hours = elapsed
			}
			hours = math.Round(hours*4) / 4
			if hours < 0.25 {
				hours = 0.25
			}
			if hours > elapsed || hours > maxTimerHrs {
				return errors.New("that is more than the timer ran")
			}
			col, err := tx.FindCollectionByNameOrId(colHours)
			if err != nil {
				return err
			}
			l := core.NewRecord(col)
			l.Set("user", userID)
			l.Set("date", dbTime(v.StartedAt))
			l.Set("hours", hours)
			l.Set("note", strings.TrimSpace(note))
			l.Set("source", "timer")
			if err := tx.Save(l); err != nil {
				return err
			}
			out["logged"], out["hours"] = true, hours
		}
		return tx.Delete(r)
	})
}

func registerTimerRoutes(se *core.ServeEvent) {
	g := se.Router.Group("/api/team/timer")
	g.Bind(apis.RequireAuth(colUsers))
	g.GET("", func(e *core.RequestEvent) error {
		r, err := findTimer(e.App, e.Auth.Id)
		if err != nil {
			return e.JSON(200, map[string]any{"timer": nil})
		}
		return e.JSON(200, map[string]any{"timer": timerView(r)})
	})
	g.POST("/start", func(e *core.RequestEvent) error {
		var in struct {
			PlannedMinutes int `json:"planned_minutes"`
		}
		_ = e.BindBody(&in)
		v, err := StartTimer(e.App, e.Auth.Id, in.PlannedMinutes)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, map[string]any{"timer": v})
	})
	g.POST("/extend", func(e *core.RequestEvent) error {
		var in struct {
			Minutes int `json:"minutes"`
		}
		_ = e.BindBody(&in)
		v, err := ExtendTimer(e.App, e.Auth.Id, in.Minutes)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, map[string]any{"timer": v})
	})
	g.POST("/stop", func(e *core.RequestEvent) error {
		var in struct {
			Log   bool    `json:"log"`
			Hours float64 `json:"hours"`
			Note  string  `json:"note"`
		}
		_ = e.BindBody(&in)
		out, err := StopTimer(e.App, e.Auth.Id, in.Log, in.Hours, in.Note)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, out)
	})
}
