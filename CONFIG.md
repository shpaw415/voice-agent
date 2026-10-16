# Voice Agent — configuration guide

Voice Agent turns a dashboard tab into a real-time voice agent: the browser microphone
connects straight to a speech-to-speech model (xAI Grok Voice) with a short-lived
ephemeral token. No phone system, no STT/TTS chain.

What it needs to work: **one xAI API key**, with automatic fallback:

1. The plugin's own Settings value / vault slug `xai-api-key`, then
2. the **shared xAI key from the Config page Keys tab** (slug `xai`) — if you already
   saved an xAI key there, the plugin sees it immediately, nothing to re-enter.

## Ask → fill → verify

1. **Ask the user** (in their language) for their xAI API key only if `ob-plugin-voice-agent-status`
   reports `hasKey: false`. An existing key already used for Grok elsewhere works.
2. **Fill it**, in order of preference:
   - Config page → Keys tab → slug `xai` (shared — recommended, serves other features too), or
   - Plugins tab → Voice Agent → Settings → “xAI API key”, or
   - Plugins tab → Voice Agent → Settings → Vault keys → slug `xai-api-key`.
3. **Verify**: run `ob-plugin-voice-agent-status`. Expect `hasKey: true`; `keySource`
   says where the key was found (`shared:xai`, `vault`, or `settings`).
4. **Prove it works**: open Dashboards → Voice Agent and speak (auto-connects if the
   `auto_start` streaming setting is on). The call appears in the Calls table when you
   hang up.

## Settings reference

| Setting | Meaning | Default |
|---|---|---|
| `provider` | Speech-to-speech provider (enum; only `xai` in this version) | `xai` |
| `model` | Realtime model name | `grok-voice-latest` |
| `voice` | Provider voice name | `eve` |
| `instructions` | System prompt of the agent | concise multilingual assistant; auto-detects the caller's language |

Hands-free (continuous) conversation needs **no setting**: it is the “Hands-free”
button on the Voice Agent page — one click to start, one click to stop.
| `xai_api_key` | xAI API key (secret) — or vault slug `xai-api-key` | empty |
| `gateway_base` | API base override (blank = provider default) — for self-hosted gateways and tests | empty |

## Troubleshooting

- `hasKey: false` → the key was not saved; repeat step 2, then step 3.
- Connects but no answer → check the key is a valid xAI API key (console.x.ai) and that
  the machine reaches `api.x.ai`.
- No sound → the tab/system is muted, or the `voice` name does not exist (try `eve`).
- Session error mentioning the model → reset `model` to `grok-voice-latest`.

Nothing here ever requires editing files by hand; everything goes through the Plugins tab.
