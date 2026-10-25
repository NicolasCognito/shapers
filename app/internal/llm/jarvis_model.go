package llm

import (
	"log/slog"
	"os"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Jarvis model from the environment: every user gets a ready chat model
// built from DEEPSEEK_* variables, so nobody pastes an API key in the app.

const jarvisModelName = "Jarvis (DeepSeek)"

type envModel struct{ key, baseURL, modelID string }

func jarvisModelFromEnv() (envModel, bool) {
	m := envModel{
		key:     strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		baseURL: strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")),
		modelID: strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL")),
	}
	if m.baseURL == "" {
		m.baseURL = "https://api.deepseek.com"
	}
	if m.modelID == "" {
		m.modelID = "deepseek-chat"
	}
	return m, m.key != ""
}

// ensureJarvisModel gives the user a ready chat model built from .env, so
// nobody has to paste an API key before talking to Jarvis. Re-running it
// refreshes the key and model id from the current environment.
func ensureJarvisModel(app core.App, userID string) error {
	env, ok := jarvisModelFromEnv()
	if !ok {
		return nil
	}
	rec, err := app.FindFirstRecordByFilter("llm_models", "owner = {:o} && name = {:n}", dbx.Params{"o": userID, "n": jarvisModelName})
	if err != nil {
		col, err := app.FindCollectionByNameOrId("llm_models")
		if err != nil {
			return err
		}
		rec = core.NewRecord(col)
		rec.Set("owner", userID)
		rec.Set("name", jarvisModelName)
		rec.Set("max_output_tokens", 8000)
		rec.Set("max_context_tokens", 64000)
		// Default only if the user has no default yet.
		if _, err := app.FindFirstRecordByFilter("llm_models", "owner = {:o} && is_default = true", dbx.Params{"o": userID}); err != nil {
			rec.Set("is_default", true)
		}
	}
	rec.Set("model_id", env.modelID)
	rec.Set("base_url", env.baseURL)
	rec.Set("api_key", env.key)
	rec.Set("protocol", "openai-compatible")
	return app.Save(rec)
}

func registerJarvisModel(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		users, err := se.App.FindAllRecords("users")
		if err == nil {
			for _, u := range users {
				if err := ensureJarvisModel(se.App, u.Id); err != nil {
					slog.Warn("llm: jarvis model", "user", u.Id, "error", err)
				}
			}
		}
		return se.Next()
	})
	app.OnRecordAfterCreateSuccess("users").BindFunc(func(e *core.RecordEvent) error {
		if err := ensureJarvisModel(e.App, e.Record.Id); err != nil {
			slog.Warn("llm: jarvis model", "user", e.Record.Id, "error", err)
		}
		return e.Next()
	})
}
