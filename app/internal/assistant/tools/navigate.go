package tools

import (
	"context"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"

	"charm.land/fantasy"
)

// ui_navigate does nothing on the server: the browser sees the tool result in
// the chat stream and opens the page. The server only checks the address is
// one of the app's own pages, so the model can't send people anywhere else.

type navigateInput struct {
	Path   string `json:"path" description:"App page to open, e.g. /me, /tasks, /requests, /team, /team?member=<userId>, /board, /board?project=<projectId>, /board?open=<taskId>, /settings, /profile"`
	Reason string `json:"reason,omitempty" description:"Short label of what is being shown, e.g. 'Zala's hours'"`
}

var (
	navPages = map[string]bool{"/me": true, "/tasks": true, "/requests": true, "/team": true, "/board": true, "/settings": true, "/profile": true, "/chat": true, "/notifications": true}
	navParam = map[string]map[string]bool{
		"/team":  {"member": true},
		"/board": {"project": true, "open": true},
	}
	recordID = regexp.MustCompile(`^[a-zA-Z0-9_]{1,40}$`)
)

func cleanNavPath(raw string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "" || u.Host != "" || !navPages[u.Path] {
		return "", false
	}
	q := url.Values{}
	for k, vs := range u.Query() {
		if !navParam[u.Path][k] || len(vs) != 1 || !recordID.MatchString(vs[0]) {
			return "", false
		}
		q.Set(k, vs[0])
	}
	if len(q) > 0 {
		return u.Path + "?" + q.Encode(), true
	}
	return u.Path, true
}

func newNavigateTool() fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"ui_navigate",
		"Open a page of this app in the user's browser. Use it whenever the user asks to show, open or go to something (a page, a member, a project, a task), or after answering when seeing the page clearly helps. Get IDs from other tools first (team_member_report for members, board_search_projects / board_search_tasks for projects and tasks); never guess IDs. Allowed: /me, /tasks, /requests, /team, /team?member=<userId> (admins), /board, /board?project=<projectId>, /board?open=<taskId>, /settings, /profile, /notifications.",
		func(ctx context.Context, input navigateInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			path, ok := cleanNavPath(input.Path)
			if !ok {
				return fantasy.NewTextErrorResponse("not an allowed page: " + input.Path), nil
			}
			data, _ := json.Marshal(map[string]any{"ok": true, "navigate": path, "label": input.Reason})
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
