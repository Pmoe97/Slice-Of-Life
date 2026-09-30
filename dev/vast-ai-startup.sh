#!/usr/bin/env bash
# Idempotent provisioning script for a vast.ai GPU instance: gets llama.cpp's
# llama-server (text) and ComfyUI (image) both running with the game's models,
# so the local dev harness (dev-harness.html + local-ai-shim.js) can talk to
# real models through an SSH tunnel. NOT part of the shipped game.
#
# Safe to re-run: every step checks whether it's already done and skips if so.
# That's the point — paste this as the instance's on-start script (vast.ai's
# Instance -> Edit -> "On-start script" field) and it self-configures on
# every boot: ~15-20 min the first time (build + downloads), under a minute
# on a resumed (stopped/started, not recycled/destroyed) instance where
# everything is already on disk.
#
# Proven against vast.ai's own "vastai/comfy_v0.35.0-cuda-13.2-py312"
# template (2026-09-12) — ComfyUI/API-wrapper already running as supervisor
# services there, with only cuBLAS and llama-server missing. Falls back to
# installing ComfyUI from scratch if it isn't already present, for other
# base images.
set -euo pipefail

# ===== Configurable =====
# Swapped 2026-09-13: the abliterated instruct model just had refusals
# stripped out — it was never trained on explicit fiction, so it kept
# defaulting to euphemistic ("her body", "intimate") narration even with an
# explicit, prescriptive CONTENT GUIDANCE directive in the prompt (confirmed
# by replaying the real buildScenePrompt output against it directly — see
# bug report 2026-09-13). Cydonia is a finetune of the same base
# (Mistral-Small-3.2-24B) actually trained on RP/NSFW prose, same ~14GB
# Q4_K_M footprint — a drop-in swap, not a bigger download.
LLAMA_MODEL="bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q4_K_M"
LLAMA_PORT=3000              # bound to 127.0.0.1 — reached via SSH tunnel, never public
LLAMA_DIR="/workspace/llama.cpp"
COMFY_DIR="/workspace/ComfyUI"
COMFY_PORT=8188               # bound to 127.0.0.1 — reached via SSH tunnel, never public
CIVITAI_MODEL_ID=1409849
CIVITAI_FILE_ID=1311787
CIVITAI_CHECKPOINT_NAME="civitai-model.safetensors"
# CIVITAI_TOKEN: prefer setting this as an Environment Variable in vast.ai's
# instance creation/edit UI (or account-level Civitai credential, if vast.ai
# offers one on your account — `vast-capabilities | jq .credentials` shows
# whether one is already wired in) so it's injected automatically on every
# boot with no manual step. Falls back to reading ${WORKSPACE}/.env.
WORKSPACE="${WORKSPACE:-/workspace}"
if [ -z "${CIVITAI_TOKEN:-}" ] && [ -f "$WORKSPACE/.env" ]; then
  # shellcheck disable=SC1091
  source "$WORKSPACE/.env"
fi
if [ -z "${CIVITAI_TOKEN:-}" ]; then
  echo "CIVITAI_TOKEN is not set (checked env and $WORKSPACE/.env). Set it as a" >&2
  echo "vast.ai instance environment variable, or: echo 'CIVITAI_TOKEN=\"...\"' >> $WORKSPACE/.env" >&2
  exit 1
fi

mkdir -p "$WORKSPACE/logs"

# ---------------------------------------------------------------------------
# 1. cuBLAS — llama.cpp's CUDA backend links against it; this image ships a
#    partial CUDA install without it (confirmed on the comfy template).
# ---------------------------------------------------------------------------
if ! ldconfig -p | grep -q libcublas.so; then
  echo "== Installing cuBLAS =="
  CUDA_VER="$(basename "$(readlink -f /usr/local/cuda)" | sed 's/cuda-//')"  # e.g. 13.2
  PKG_VER="$(echo "$CUDA_VER" | tr '.' '-')"                                 # e.g. 13-2
  apt-get update -qq
  apt-get install -y -qq "libcublas-${PKG_VER}" "libcublas-dev-${PKG_VER}"
  # The apt package doesn't land its .so in ldconfig's default search path
  # (it installs under cuda-X.Y/targets/.../lib, not the plain lib64 dir
  # ldconfig already knows about) — confirmed: without this, llama-server
  # fails at startup with "libcublas.so.13: cannot open shared object file"
  # even though the package is installed and /usr/local/cuda/lib64 symlinks
  # to the right place.
  echo "/usr/local/cuda-${CUDA_VER}/targets/x86_64-linux/lib" > /etc/ld.so.conf.d/cublas-fix.conf
  ldconfig
fi

# ---------------------------------------------------------------------------
# 2. llama.cpp — build with CUDA if the binary doesn't exist yet
# ---------------------------------------------------------------------------
if [ ! -x "$LLAMA_DIR/build/bin/llama-server" ]; then
  echo "== Building llama.cpp (CUDA) =="
  if [ ! -d "$LLAMA_DIR" ]; then
    git clone --depth 1 https://github.com/ggml-org/llama.cpp "$LLAMA_DIR"
  fi
  (
    cd "$LLAMA_DIR"
    # native = auto-detect this GPU's compute capability, so the same script
    # works whatever card the instance actually has (this build targeted
    # sm_86 for an RTX A6000 explicitly; native gets there without hardcoding).
    cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_ARCHITECTURES=native \
      > "$WORKSPACE/logs/cmake-configure.log" 2>&1
    cmake --build build --config Release -j"$(nproc)" > "$WORKSPACE/logs/cmake-build.log" 2>&1
  )
fi

# Restart cleanly rather than leaving a stale process from a previous boot.
pkill -f "build/bin/llama-server" 2>/dev/null || true
echo "== Starting llama-server on 127.0.0.1:$LLAMA_PORT =="
(
  cd "$LLAMA_DIR"
  nohup ./build/bin/llama-server -hf "$LLAMA_MODEL" -ngl 999 --host 127.0.0.1 --port "$LLAMA_PORT" \
    > "$WORKSPACE/logs/llama-server.log" 2>&1 &
)

# ---------------------------------------------------------------------------
# 3. ComfyUI — only install if this image doesn't already run it as a service
#    (vast.ai's comfy templates do; a bare pytorch/CUDA image wouldn't).
# ---------------------------------------------------------------------------
if command -v supervisorctl >/dev/null 2>&1 && supervisorctl status comfyui >/dev/null 2>&1; then
  echo "== ComfyUI already managed by supervisor — leaving it running =="
elif [ ! -d "$COMFY_DIR" ]; then
  echo "== Installing ComfyUI (no existing install/service found) =="
  git clone https://github.com/comfyanonymous/ComfyUI "$COMFY_DIR"
  (
    cd "$COMFY_DIR"
    python3 -m venv venv
    # shellcheck disable=SC1091
    source venv/bin/activate
    pip install --upgrade pip
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
    pip install -r requirements.txt
  )
  (
    cd "$COMFY_DIR"
    # shellcheck disable=SC1091
    source venv/bin/activate
    nohup python3 main.py --listen 127.0.0.1 --port "$COMFY_PORT" --enable-cors-header '*' \
      > "$WORKSPACE/logs/comfyui.log" 2>&1 &
  )
fi

# ---------------------------------------------------------------------------
# 4. Download the civitai checkpoint — auth via header, never in the URL.
#    Confirmed (2026-09-12): model 1409849/1311787 is a full SD1.5-family
#    checkpoint (1131 tensors, CLIP + diffusion_model keys, no LoRA keys) —
#    the plain CheckpointLoaderSimple workflow below needs no LoraLoader.
# ---------------------------------------------------------------------------
mkdir -p "$COMFY_DIR/models/checkpoints"
CKPT_PATH="$COMFY_DIR/models/checkpoints/$CIVITAI_CHECKPOINT_NAME"
if [ ! -f "$CKPT_PATH" ]; then
  echo "== Downloading civitai checkpoint =="
  wget --header="Authorization: Bearer $CIVITAI_TOKEN" \
    -O "$CKPT_PATH" \
    "https://civitai.com/api/download/models/${CIVITAI_MODEL_ID}?fileId=${CIVITAI_FILE_ID}"
  # New checkpoint on disk — restart so ComfyUI's model list picks it up.
  command -v supervisorctl >/dev/null 2>&1 && supervisorctl restart comfyui 2>/dev/null || true
fi

cat <<EOF

Ready. llama-server: 127.0.0.1:$LLAMA_PORT   ComfyUI: 127.0.0.1:$COMFY_PORT
Both are loopback-only — reach them from your machine via the SSH tunnel in
local-ai.config.example.js (or run connect-vastai.ps1, which does this and
opens dev-harness.html for you).
  tail -f $WORKSPACE/logs/llama-server.log
  tail -f $WORKSPACE/logs/comfyui.log   (only if this script installed ComfyUI itself)
EOF
