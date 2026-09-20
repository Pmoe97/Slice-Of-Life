// Local AI shim — TEMPORARY local dev tool, NOT part of the shipped game.
// Loaded only by dev-harness.html (never index.html, never touched by a
// Perchance upload). Implements the two calls dev-harness.html's `root`
// stub used to just throw on:
//   - LocalAI.generateText(promptOrObj)  -> talks to a llama.cpp llama-server
//   - LocalAI.generateImage(prompt, opts) -> talks to a ComfyUI instance
// against whatever vast.ai box local-ai.config.js points at. See
// local-ai.config.example.js for the settings this reads, and
// src/src/dev/LOCAL-AI-SETUP.md for the end-to-end setup.
//
// Both functions match the shape src/src/srcfiles/llm.js and image.js
// already call on `root` — see those files' `root.generateText(...)` /
// `root.generateImage(...)` call sites — so nothing upstream of `root`
// needs to know whether it's talking to Perchance or a local box.
window.LocalAI = (function () {
  function activeConfig() {
    const c = window.LOCAL_AI_CONFIG;
    return c && c.enabled ? c : null;
  }

  function trimSlash(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  // root.generateText is called two ways in this codebase: with a plain
  // string (interruption.js, ui.computer.js) or with
  // { instruction, startWith, stopSequences } (llm.js, concept.js, asks.js).
  function normalizeArg(arg) {
    return typeof arg === 'string' ? { instruction: arg } : (arg || {});
  }

  // ===== TEXT: llama.cpp's OpenAI-compatible endpoint =====
  async function generateText(arg) {
    const cfg = activeConfig();
    if (!cfg || !cfg.text || !cfg.text.baseUrl) {
      throw new Error('LocalAI: text endpoint not configured — copy local-ai.config.example.js to local-ai.config.js and fill in [text.baseUrl].');
    }
    const { instruction, startWith, stopSequences } = normalizeArg(arg);

    const messages = [{ role: 'user', content: String(instruction || '') }];
    // Assistant-prefill: llama.cpp's server continues FROM a trailing
    // assistant message rather than replying to it. This is how every
    // structured (JSON) call in llm.js/concept.js gets `startWith: '{'`
    // honored the way Perchance's generateText honors it.
    if (startWith) messages.push({ role: 'assistant', content: String(startWith) });

    const body = {
      model: cfg.text.model || 'local-model',
      messages,
      temperature: cfg.text.temperature ?? 0.9,
      max_tokens: cfg.text.maxTokens ?? 700,
      stream: false,
    };
    if (Array.isArray(stopSequences) && stopSequences.length > 0) body.stop = stopSequences;

    const res = await fetch(trimSlash(cfg.text.baseUrl) + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`LocalAI: text endpoint returned ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    // Belt-and-suspenders: some server versions echo the prefill back in
    // `content`, some don't. Only prepend startWith if it isn't already there.
    if (startWith && !content.replace(/^\s+/, '').startsWith(startWith)) {
      return String(startWith) + content;
    }
    return content;
  }

  // ===== IMAGE: ComfyUI's queue -> history -> view flow =====
  function parseResolution(res) {
    const m = /^(\d+)x(\d+)$/.exec(String(res || '512x512'));
    return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 512, height: 512 };
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'sol-' + Math.random().toString(36).slice(2);
  }

  // Standard 4-node-checkpoint txt2img API graph (the same shape ComfyUI's
  // own "Save (API Format)" export produces for a basic txt2img workflow).
  // Assumes `checkpoint` is a normal merged SD1.5/SDXL checkpoint (what
  // almost every civitai "Checkpoint" download is) — a LoRA-only file needs
  // a LoraLoader node added here, which this does not attempt.
  //
  // When `removeBackground` is set, the VAEDecode output is routed through
  // ComfyUI's built-in BiRefNet background-removal nodes before SaveImage —
  // matching src/src/srcfiles/image.js's getCharacterCutout/getPlayerCutout,
  // the only two callers that pass root.generateImage's removeBackground:true
  // (character/player cutouts need a transparent background to composite
  // onto a scene plate; everything else — scenes, portraits — leaves this
  // off). Graph shape (model + mask-invert step) copied verbatim from
  // ComfyUI's own bundled blueprint, blueprints/Remove Background
  // (BiRefNet).json, rather than guessed — RemoveBackground's raw mask is
  // background=opaque, so it MUST go through InvertMask before
  // JoinImageWithAlpha or the cutout comes back inverted (transparent
  // subject, opaque background). Requires models/background_removal/
  // birefnet.safetensors on the remote box (see LOCAL-AI-SETUP.md).
  function buildWorkflow({ checkpoint, positive, negative, width, height, seed, steps, cfg, sampler, scheduler, removeBackground, bgRemovalModel }) {
    const graph = {
      4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
      5: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
      6: { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['4', 1] } },
      7: { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['4', 1] } },
      3: {
        class_type: 'KSampler',
        inputs: {
          seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1,
          model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0],
        },
      },
      8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    };
    let finalImage = ['8', 0];
    if (removeBackground) {
      graph[10] = { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: bgRemovalModel || 'birefnet.safetensors' } };
      graph[11] = { class_type: 'RemoveBackground', inputs: { image: ['8', 0], bg_removal_model: ['10', 0] } };
      graph[12] = { class_type: 'InvertMask', inputs: { mask: ['11', 0] } };
      graph[13] = { class_type: 'JoinImageWithAlpha', inputs: { image: ['8', 0], alpha: ['12', 0] } };
      finalImage = ['13', 0];
    }
    graph[9] = { class_type: 'SaveImage', inputs: { filename_prefix: 'slice-of-life', images: finalImage } };
    return graph;
  }

  function findOutputImages(outputs) {
    const found = [];
    for (const node of Object.values(outputs || {})) {
      if (Array.isArray(node.images)) found.push(...node.images);
    }
    return found;
  }

  async function pollForImage(base, promptId, { timeoutMs = 120000, intervalMs = 1000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch(`${base}/history/${promptId}`);
      if (res.ok) {
        const data = await res.json();
        const entry = data[promptId];
        if (entry) {
          if (entry.status && entry.status.status_str === 'error') {
            throw new Error('LocalAI: ComfyUI reported an error: ' + JSON.stringify(entry.status));
          }
          const images = findOutputImages(entry.outputs);
          if (images.length > 0) return images[0];
        }
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`LocalAI: ComfyUI generation timed out after ${timeoutMs}ms`);
  }

  async function generateImage(prompt, opts) {
    const cfg = activeConfig();
    if (!cfg || !cfg.image || !cfg.image.baseUrl) {
      throw new Error('LocalAI: image endpoint not configured — copy local-ai.config.example.js to local-ai.config.js and fill in [image.baseUrl / checkpoint].');
    }
    opts = opts || {};
    const base = trimSlash(cfg.image.baseUrl);
    const { width, height } = parseResolution(opts.resolution);
    const seed = Number.isFinite(opts.seed) ? Math.floor(Math.abs(opts.seed)) : Math.floor(Math.random() * 2147483647);

    const workflow = buildWorkflow({
      checkpoint: cfg.image.checkpoint,
      positive: prompt,
      negative: opts.negativePrompt || '',
      width, height, seed,
      steps: cfg.image.steps ?? 22,
      cfg: cfg.image.cfg ?? 5.5,
      sampler: cfg.image.sampler || 'dpmpp_2m',
      scheduler: cfg.image.scheduler || 'karras',
      removeBackground: !!opts.removeBackground,
      bgRemovalModel: cfg.image.bgRemovalModel,
    });

    const queueRes = await fetch(base + '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: randomId() }),
    });
    if (!queueRes.ok) {
      throw new Error(`LocalAI: ComfyUI /prompt returned ${queueRes.status}: ${await queueRes.text().catch(() => '')}`);
    }
    const { prompt_id: promptId } = await queueRes.json();

    const output = await pollForImage(base, promptId);
    const imgUrl = `${base}/view?filename=${encodeURIComponent(output.filename)}`
      + `&subfolder=${encodeURIComponent(output.subfolder || '')}`
      + `&type=${encodeURIComponent(output.type || 'output')}`;
    const blob = await (await fetch(imgUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return { canvas };
  }

  return { generateText, generateImage };
})();
