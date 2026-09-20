// Local AI shim config — TEMPLATE. Copy this file to `local-ai.config.js`
// (already gitignored) and fill in the real values for your current vast.ai
// rental. `local-ai.config.js` is loaded only by dev-harness.html; it is
// never read by index.html, so this has zero effect on the Perchance upload.
//
// Both endpoints below point at an SSH TUNNEL to the instance, not its
// public ip:port. Confirmed live (2026-09-12): vast.ai's official images
// front every service through Caddy with token auth, and a browser fetch
// can't get past that — the CORS PREFLIGHT (OPTIONS) request never carries
// the Authorization header (browsers never attach it to preflights), so
// Caddy 401s the preflight with no CORS headers and the browser blocks the
// real request before it's even sent. This isn't fixable from the client
// side; vast.ai's own agent guide recommends exactly the workaround below
// for single-user local access, and it sidesteps Caddy entirely.
//
// Before starting dev-harness.html, open a tunnel from a terminal (adjust
// the -p port / host / key path to your current rental — vast.ai's
// Instances tab -> the ">_" icon shows the current ssh -p/host):
//   ssh -i <path-to-key> -p <SSH-PORT> -N \
//     -L 18188:127.0.0.1:18188 \    (ComfyUI, this image's internal port)
//     -L 3000:127.0.0.1:3000 \      (llama-server, once vast-ai-startup.sh starts it)
//     root@<INSTANCE-IP>
// Leave that running in its own terminal for the session; the two baseUrls
// below then just point at localhost.
window.LOCAL_AI_CONFIG = {
  // Flip to false to fall back to dev-harness.html's original stub-and-throw
  // behavior (no network calls at all) without deleting your settings.
  enabled: true,

  text: {
    // llama-server, reached through the tunnel above.
    baseUrl: 'http://localhost:3000',
    temperature: 0.9,
    maxTokens: 700,
  },

  image: {
    // ComfyUI's raw API (not the API Wrapper service on this image — that
    // one has no CORS support at all, confirmed live, so it can't be called
    // from browser JS regardless of the auth problem above).
    baseUrl: 'http://localhost:18188',
    // Filename exactly as it appears in ComfyUI's models/checkpoints/
    // folder on the remote box (vast-ai-startup.sh's CIVITAI_CHECKPOINT_NAME).
    checkpoint: 'your-checkpoint.safetensors',
    steps: 22,
    cfg: 5.5,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
  },
};
