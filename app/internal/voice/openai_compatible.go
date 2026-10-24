package voice

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"
)

// openAICompatible speaks the OpenAI /audio/transcriptions API, which Groq,
// OpenAI and most self-hosted Whisper servers implement.
type openAICompatible struct {
	name, baseURL, apiKey, model string
	client                       *http.Client
}

var presets = map[string]struct{ baseURL, model, keyEnv string }{
	"groq":   {"https://api.groq.com/openai/v1", "whisper-large-v3-turbo", "GROQ_API_KEY"},
	"openai": {"https://api.openai.com/v1", "whisper-1", "OPENAI_API_KEY"},
	"custom": {"", "whisper-1", ""},
}

// newOpenAICompatible builds the adapter from a preset; VOICE_BASE_URL,
// VOICE_MODEL and VOICE_API_KEY override it. Returns nil when no key/URL is set.
func newOpenAICompatible(preset string) (Transcriber, error) {
	p := presets[preset]
	env := func(k, def string) string {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
		return def
	}
	o := &openAICompatible{
		name:    preset,
		baseURL: strings.TrimRight(env("VOICE_BASE_URL", p.baseURL), "/"),
		model:   env("VOICE_MODEL", p.model),
		apiKey:  env("VOICE_API_KEY", ""),
		client:  &http.Client{Timeout: 60 * time.Second},
	}
	if o.apiKey == "" && p.keyEnv != "" {
		o.apiKey = strings.TrimSpace(os.Getenv(p.keyEnv))
	}
	if o.baseURL == "" || (o.apiKey == "" && preset != "custom") {
		return nil, nil // not configured: the browser falls back to its own engine
	}
	return o, nil
}

func (o *openAICompatible) Name() string { return o.name + ":" + o.model }

func (o *openAICompatible) Transcribe(ctx context.Context, audio io.Reader, filename, lang string) (string, error) {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if filename == "" {
		filename = "speech.webm"
	}
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, audio); err != nil {
		return "", err
	}
	_ = w.WriteField("model", o.model)
	_ = w.WriteField("response_format", "json")
	if lang != "" {
		_ = w.WriteField("language", lang)
	}
	if err := w.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/audio/transcriptions", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if o.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+o.apiKey)
	}
	res, err := o.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%s: HTTP %d: %s", o.name, res.StatusCode, strings.TrimSpace(string(raw)))
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return out.Text, nil
}
