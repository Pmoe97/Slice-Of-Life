# Local AI shim — playing against real models

Wires `dev-harness.html` up to a real text model (llama.cpp) and image model
(ComfyUI) running on a rented GPU, without touching `index.html` or any
`src/src/srcfiles/*.js` file. The Perchance upload is exactly what it was
before this existed — this only changes the local dev harness's `root` stub.

Verified end-to-end live on 2026-09-12 against a vast.ai RTX A6000
(`vastai/comfy_v0.35.0-cuda-13.2-py312` template) — both `LocalAI.generateText`
and `LocalAI.generateImage` confirmed working through the real client code,
including the game's own organic title-art generation.

## Architecture (why a tunnel, not the public ip:port)

vast.ai's own images front every service through a Caddy reverse proxy with
Bearer-token auth. That breaks browser calls specifically: a JSON POST (or
any request with a custom header) triggers a CORS **preflight** OPTIONS
request first, and browsers never attach custom headers — including
Authorization — to the preflight itself. Caddy 401s the token-less preflight
with no CORS headers, so the browser blocks the real request before it's
even sent. Confirmed live; not fixable from the client side.

The fix — also vast.ai's own recommended pattern for single-user local
access — is an **SSH local port forward**, which lands on the container's
loopback interface and bypasses Caddy entirely: no token, no preflight
problem, full SSH encryption. Both servers below are bound to `127.0.0.1`
*only* on the remote box for exactly this reason — they're never exposed to
the public internet, only reachable through the tunnel.

## One-time per instance: get it running

1. Rent/open a vast.ai GPU instance.
2. Paste [`vast-ai-startup.sh`](vast-ai-startup.sh) as the instance's
   **on-start script** (Instance -> Edit) — it's idempotent, so it's safe to
   leave there permanently: full setup (~15-20 min: cuBLAS, build llama.cpp,
   download the ~15GB model + checkpoint) on a fresh instance, under a minute
   to just relaunch the servers on a **stopped/started** (not
   recycled/destroyed) instance where everything's already on disk.
3. Set `CIVITAI_TOKEN`: check whether vast.ai's account settings have a
   Civitai credential field first (`vast-capabilities | jq .credentials`
   shows whether one's already wired in) — that beats doing it manually every
   time. Otherwise, in the instance's Jupyter Terminal:
   ```bash
   echo 'CIVITAI_TOKEN="your_real_key"' >> /workspace/.env
   ```
   Never paste the raw token into a chat with an AI assistant — the value
   should only ever go directly into that terminal.

## Every session after that: connect

```powershell
.\connect-vastai.ps1 -SshHost <ip> -SshPort <port>
```

(host/port from vast.ai's `>_` connect dialog on the instance card). Opens
the SSH tunnel, starts the local http server if it isn't already running,
and opens `dev-harness.html`. Re-run with no arguments later in the same
session and it reuses the last host/port
(`.vast-ai-last-connection.json`, gitignored).

First time only: copy [`local-ai.config.example.js`](../../../local-ai.config.example.js)
(repo root) to `local-ai.config.js` (gitignored) and set the checkpoint
filename (matches `vast-ai-startup.sh`'s `CIVITAI_CHECKPOINT_NAME`).

Set `LOCAL_AI_CONFIG.enabled = false` in `local-ai.config.js` to fall back to
the stub-and-throw behavior without losing your settings.

## Notes

- `local-ai-shim.js` (repo root) is the actual client: it speaks llama.cpp's
  OpenAI-compatible `/v1/chat/completions` for text, and ComfyUI's native
  `/prompt` → `/history` → `/view` queue API for images (not the "API
  Wrapper" one-shot service some vast.ai images also run — confirmed live
  that one has no CORS support at all, so it can't be called from browser
  JS regardless of the tunnel). Matches the exact call shape
  `root.generateText`/`root.generateImage` already have in
  `src/src/srcfiles/llm.js` and `image.js`.
- The ComfyUI workflow it builds is a plain 4-node txt2img graph, confirmed
  against a real civitai checkpoint (verified via its safetensors header:
  1131 tensors, CLIP + diffusion_model keys, no LoRA keys — a normal merged
  SD1.5-family checkpoint). A LoRA-only download would need a `LoraLoader`
  node added to `buildWorkflow` in `local-ai-shim.js`.
- A vast.ai rental's SSH host/port is only stable for the life of that one
  instance — a new rental needs `connect-vastai.ps1 -SshHost ... -SshPort ...`
  again once. The internal ports (18188, 3000) never change since they're
  fixed inside `vast-ai-startup.sh`.
