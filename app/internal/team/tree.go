package team

import (
	"errors"
	"os"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	colTrees        = "trees"
	dropsPerPlan    = 1 // finishing a planned work session
	dropsPerQuota   = 3 // meeting the weekly quota, once a week
	wateringsPerAge = 5 // waterings needed to reach the next stage
	maxStage        = 4 // sprout, sapling, young, tree, blooming
)

type TreeView struct {
	Drops         int        `json:"drops"`
	Waterings     int        `json:"waterings"`
	Stage         int        `json:"stage"`          // 0..4
	StageProgress float64    `json:"stage_progress"` // 0..1 towards the next stage
	Mood          string     `json:"mood"`           // happy, calm, sad, wilted
	DaysDry       int        `json:"days_dry"`
	LastWatered   *time.Time `json:"last_watered_at"`
	Bonus         int        `json:"bonus,omitempty"` // drops just awarded on this load
	Vacation      bool       `json:"vacation"`
	Demo          bool       `json:"demo,omitempty"` // demo controls are enabled on this server
}

// demoEnabled turns on the tree demo controls (skip a day, add water, reset).
// Set TREE_DEMO=1 for presentations; leave unset in production.
func demoEnabled() bool { return os.Getenv("TREE_DEMO") == "1" }

func treeFor(app core.App, userID string) (*core.Record, error) {
	if r, err := app.FindFirstRecordByFilter(colTrees, "user = {:u}", dbx.Params{"u": userID}); err == nil {
		return r, nil
	}
	col, err := app.FindCollectionByNameOrId(colTrees)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("user", userID)
	r.Set("drops", 1) // a first drop to say hello
	return r, app.Save(r)
}

func viewTree(r *core.Record) TreeView {
	w := r.GetInt("waterings")
	v := TreeView{Drops: r.GetInt("drops"), Waterings: w, Stage: min(w/wateringsPerAge, maxStage)}
	if v.Stage < maxStage {
		v.StageProgress = float64(w%wateringsPerAge) / wateringsPerAge
	} else {
		v.StageProgress = 1
	}
	last := r.GetDateTime("last_watered_at").Time()
	if last.IsZero() {
		last = r.GetDateTime("created").Time()
	} else {
		lw := last
		v.LastWatered = &lw
	}
	v.DaysDry = int(time.Since(last).Hours() / 24)
	v.Vacation = r.GetBool("vacation")
	switch {
	case v.Vacation:
		v.Mood, v.DaysDry = "happy", 0
	case v.DaysDry <= 1:
		v.Mood = "happy"
	case v.DaysDry <= 3:
		v.Mood = "calm"
	case v.DaysDry <= 6:
		v.Mood = "sad"
	default:
		v.Mood = "wilted"
	}
	return v
}

// awardDrops adds drops to the user's tree (used when a planned session ends).
func awardDrops(app core.App, userID string, n int) {
	if r, err := treeFor(app, userID); err == nil {
		r.Set("drops", r.GetInt("drops")+n)
		_ = app.Save(r)
	}
}

// LoadTree returns the tree and pays the weekly quota bonus once per week.
func LoadTree(app core.App, userID string) (TreeView, error) {
	r, err := treeFor(app, userID)
	if err != nil {
		return TreeView{}, err
	}
	bonus := 0
	week := WeekStart(time.Now())
	key := week.Format("2006-01-02")
	if r.GetString("quota_bonus_week") != key {
		if u, err := findUser(app, userID); err == nil && u.GetFloat("weekly_hours") > 0 {
			logs, _ := app.FindRecordsByFilter(colHours, "user = {:u} && date >= {:from} && date < {:to}", "", 0, 0,
				dbx.Params{"u": userID, "from": dbTime(week), "to": dbTime(week.AddDate(0, 0, 7))})
			total := 0.0
			for _, l := range logs {
				total += l.GetFloat("hours")
			}
			if total >= u.GetFloat("weekly_hours") {
				bonus = dropsPerQuota
				r.Set("drops", r.GetInt("drops")+bonus)
				r.Set("quota_bonus_week", key)
				if err := app.Save(r); err != nil {
					return TreeView{}, err
				}
			}
		}
	}
	v := viewTree(r)
	if !v.Vacation && inPause(loadPauses(app, userID)[userID], time.Now()) {
		v.Vacation, v.Mood, v.DaysDry = true, "happy", 0 // on pause the tree waits too
	}
	v.Bonus = bonus
	v.Demo = demoEnabled()
	return v, nil
}

func WaterTree(app core.App, userID string) (TreeView, error) {
	r, err := treeFor(app, userID)
	if err != nil {
		return TreeView{}, err
	}
	if r.GetInt("drops") < 1 {
		return viewTree(r), errors.New("no water yet: finish a planned work session or your weekly hours")
	}
	r.Set("drops", r.GetInt("drops")-1)
	r.Set("waterings", r.GetInt("waterings")+1)
	r.Set("last_watered_at", dbTime(time.Now()))
	return viewTree(r), app.Save(r)
}

// TreeDemo applies a demo action to the actor's own tree.
func TreeDemo(app core.App, userID, action string) (TreeView, error) {
	if !demoEnabled() {
		return TreeView{}, errors.New("demo controls are off on this server")
	}
	r, err := treeFor(app, userID)
	if err != nil {
		return TreeView{}, err
	}
	switch action {
	case "skip-day": // pretend a day passed without water
		last := r.GetDateTime("last_watered_at").Time()
		if last.IsZero() {
			last = r.GetDateTime("created").Time()
		}
		r.Set("last_watered_at", dbTime(last.Add(-24*time.Hour)))
	case "add-water":
		r.Set("drops", r.GetInt("drops")+5)
	case "reset":
		r.Set("drops", 1)
		r.Set("waterings", 0)
		r.Set("last_watered_at", dbTime(time.Now()))
		r.Set("vacation", false)
	default:
		return TreeView{}, errors.New("unknown demo action")
	}
	if err := app.Save(r); err != nil {
		return TreeView{}, err
	}
	v := viewTree(r)
	v.Demo = true
	return v, nil
}

// SetVacation (admins): the member's tree stays happy while away; when they
// come back, the days-without-water count starts fresh.
func SetVacation(app core.App, memberID string, on bool) (TreeView, error) {
	r, err := treeFor(app, memberID)
	if err != nil {
		return TreeView{}, err
	}
	r.Set("vacation", on)
	if !on {
		r.Set("last_watered_at", dbTime(time.Now()))
	}
	return viewTree(r), app.Save(r)
}

func registerTreeRoutes(se *core.ServeEvent) {
	g := se.Router.Group("/api/team/tree")
	g.Bind(apis.RequireAuth(colUsers))
	g.GET("", func(e *core.RequestEvent) error {
		v, err := LoadTree(e.App, e.Auth.Id)
		if err != nil {
			return e.InternalServerError("", err)
		}
		return e.JSON(200, v)
	})
	g.POST("/demo/{action}", func(e *core.RequestEvent) error {
		v, err := TreeDemo(e.App, e.Auth.Id, e.Request.PathValue("action"))
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, v)
	})
	g.GET("/member/{id}", requirePerm(PermMembersManage, func(e *core.RequestEvent) error {
		r, err := treeFor(e.App, e.Request.PathValue("id"))
		if err != nil {
			return e.NotFoundError("", err)
		}
		return e.JSON(200, viewTree(r))
	}))
	g.POST("/member/{id}/vacation", requirePerm(PermMembersManage, func(e *core.RequestEvent) error {
		var in struct {
			On bool `json:"on"`
		}
		_ = e.BindBody(&in)
		v, err := SetVacation(e.App, e.Request.PathValue("id"), in.On)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, v)
	}))
	g.POST("/water", func(e *core.RequestEvent) error {
		v, err := WaterTree(e.App, e.Auth.Id)
		if err != nil {
			return e.BadRequestError(err.Error(), nil)
		}
		return e.JSON(200, v)
	})
}
