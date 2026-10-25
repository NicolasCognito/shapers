package slack

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
)

type slackClient struct {
	token string
	http  *http.Client

	mu        sync.Mutex
	channelID string
}

// client is nil when Slack is not configured.
var client *slackClient

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
