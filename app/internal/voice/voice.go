// Package voice turns recorded speech into text for the chat input.
//
// Providers are pluggable: a Transcriber is picked by VOICE_PROVIDER from the
// registry below. To add one (Deepgram, Azure, a local model...), write a
// constructor in its own file and add it to `providers`. Nothing else changes:
// the HTTP route and the browser only know "send audio, get text".
package voice

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// Transcriber is one speech-to-text provider.
type Transcriber interface {
	Name() string
	// Transcribe returns the text spoken in audio. lang is an ISO 639-1 hint
	// ("en", "sl") and may be empty.
	Transcribe(ctx context.Context, audio io.Reader, filename, lang string) (string, error)
}

// providers maps VOICE_PROVIDER values to constructors. A constructor returns
// (nil, nil) when it is not configured.
var providers = map[string]func() (Transcriber, error){
	"groq":   func() (Transcriber, error) { return newOpenAICompatible("groq") },
	"openai": func() (Transcriber, error) { return newOpenAICompatible("openai") },
	// Any server speaking the OpenAI /audio/transcriptions API (self-hosted
	// faster-whisper, LocalAI...): set VOICE_BASE_URL and VOICE_MODEL.
	"openai-compatible": func() (Transcriber, error) { return newOpenAICompatible("custom") },
}

// fromEnv picks the configured provider; defaults to groq when a Groq key is set.
func fromEnv() (Transcriber, error) {
	name := strings.ToLower(strings.TrimSpace(os.Getenv("VOICE_PROVIDER")))
	if name == "" {
		name = "groq"
	}
	ctor, ok := providers[name]
	if !ok {
		return nil, errors.New("unknown VOICE_PROVIDER " + name)
	}
	return ctor()
}

const maxUpload = 10 << 20 // ~10 minutes of compressed speech

func Register(app *pocketbase.PocketBase) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		t, err := fromEnv()
		if err != nil {
			slog.Warn("voice: provider not available", "error", err)
		}
		if t != nil {
			slog.Info("voice: transcription enabled", "provider", t.Name())
		}

		g := se.Router.Group("/api/voice")
		g.Bind(apis.RequireAuth("users"))
		// The browser asks this first to decide whether the server engine exists.
		g.GET("/config", func(e *core.RequestEvent) error {
			cfg := map[string]any{"server": t != nil}
			if t != nil {
				cfg["provider"] = t.Name()
			}
			return e.JSON(http.StatusOK, cfg)
		})
		g.POST("/transcribe", func(e *core.RequestEvent) error {
			if t == nil {
				return e.Error(http.StatusServiceUnavailable, "Voice transcription is not configured on this server.", nil)
			}
			e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, maxUpload)
			file, header, err := e.Request.FormFile("audio")
			if err != nil {
				return e.BadRequestError("Send the recording as multipart field \"audio\".", err)
			}
			defer file.Close()
			text, err := t.Transcribe(e.Request.Context(), file, header.Filename, e.Request.FormValue("lang"))
			if err != nil {
				slog.Warn("voice: transcribe failed", "provider", t.Name(), "error", err)
				return e.Error(http.StatusBadGateway, "Could not recognise the recording, please try again.", err)
			}
			return e.JSON(http.StatusOK, map[string]any{"text": strings.TrimSpace(text)})
		})
		return se.Next()
	})
}
