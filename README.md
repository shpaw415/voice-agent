# Voice Agent

A real-time **speech-to-speech** voice agent as an open-bot dashboard tab. Press connect,
talk out loud, and an AI answers by voice — no phone system, no STT/TTS pipeline, no
Twilio. Audio flows from your browser straight to the provider over a WebSocket
authenticated with a short-lived **ephemeral token**, so your API key never reaches the
page. A call log with duration and turn counts is kept under the transcript.

- **Web mode** (only mode): Dashboards → Voice Agent → press the button. Continuous
  conversation with server-side turn detection — just talk.
- **Hands-free mode** (button on the page): press **Hands-free** once — the agent
  connects and stays with you: talk, pause, it answers, talk again, and it reconnects
  on its own if the connection drops. Press **Stop hands-free** to end it for good.
  The round button still works for simple one-shot calls.
- **Provider**: xAI Grok Voice (`grok-voice-latest`, voice `eve` by default). The
  `provider` setting is ready for OpenAI Realtime and Google Gemini Live later.
- **One key to configure**: your xAI API key — the same key already used for Grok
  image/video works. Paste it in the plugin Settings or fill the vault slug
  `xai-api-key`; the installing agent's guide (`ob-plugin guide voice-agent`) walks
  through it.
- **Language**: the agent auto-detects the caller's language and answers in it; the page
  UI follows the browser language (en/fr/es/de).

## Files

- `server/server.ts` — Bun page server: single-page UI, `POST api/session` (mints the
  ephemeral token at the provider), call log (`api/calls`, `api/calls/end`), `api/status`,
  `healthz`. Persists to `~/.open-bot/pages-data/voice-agent/`.
- `status/status.ts` — `ob-plugin-voice-agent-status`: prints the configuration state as
  JSON (never a key value).

## Privacy

The plugin server never carries audio and never stores your key outside the desktop key
vault/config. Calls are logged as metadata only (time, duration, turn counts).

## Roadmap

- OpenAI Realtime and Gemini Live as additional providers (enum grows, nothing else
  changes).
- Voice cloning and custom voices per provider.

## Status

`beta-1` — local development build.
