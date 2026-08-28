# `src/` — the shipped game tree

This is the persistent file tree that ships with the generator. `index.html`
(at the workspace root) loads everything it needs from here, and the page's
scripts reference files relative to it. Keep it tidy: only what the shipped
generator actually uses. Exploration, toolchains, and throwaway data live in
`scratch/` (ephemeral, invisible to the generator), not here.

## Layout

| Path | Holds |
|---|---|
| **`srcfiles/`** | All game code. Loaded as plain `<script src="src/srcfiles/….js">` tags in `index.html`, in a fixed dependency order (see `loadgame.js` below). Each file ships with a `?v=N` cache-buster; bump it whenever you edit that file. |
| **`dev/verify/`** | Node harnesses (`run-all.js`) that load `srcfiles/` into a `vm` and assert invariants — paths, load order, config integrity, engine wiring. Run with `node src/dev/verify/run-all.js` from the workspace root. |
| **`ref/`** | Design record. `ref/README.md` is the index; `ref/structural/ARCHITECTURE.md` is the always-current map of how the game actually works. |

`loadgame.js` (in `dev/verify/`) is the source of truth for the script load
order the harnesses use; it mirrors the tag order in `index.html`.

## Points of entry for a new agent

- **What the game is / how it's put together** → `src/ref/structural/ARCHITECTURE.md`
- **Writing or resuming a change** → read `src/ref/README.md` (folder conventions,
  plan/handoff patterns) before anything else.
- **Making a code change** → edit the `srcfiles/` file, bump its `?v=` in
  `index.html`, verify live with `browser_eval`/`browser_refresh`.

## Recent work

**2026-08-27 — conversation-quality bug fixes** (verified live):

- **Narration repetition** — NPCs' in-context recent transcript now renders all
  entry types correctly (player input, dialogue, action, internal, narration),
  the prompt-recent buffer was widened 16→24, and action/internal/narration
  beats are mirrored into every nearby NPC's memory. A new anti-repetition rule
  in the scene prompt tells the model not to re-narrate established beats.
- **Export gaps** — action/internal/narration beats were missing from the
  exported conversation log; `debuglog.js` now renders them by entry type.
- **Player-state awareness** — NPCs in the same room perceive the player's
  clothing state (including nudity) via `[Senses]`, driven by the
  `CLOTHING_STATE_PERCEIVED_PROSE` table in `config.js`.
- **Swim outfit bug** — swimming now renders the player undressed in the water
  and toweled afterward, so generated imagery no longer shows full clothing
  while swimming.
- **Consent consistency** — the scene prompt now forbids re-litigating consent
  with a willing, agreed partner.

**2026-08-28 — house awareness + explicit narration** (verified live):

- **House awareness** — NPCs now know the whole flat, not just the room they
  stand in. The scene prompt carries a `THE HOME` block derived from
  `APARTMENT_LAYOUT`/`OBJECT_DEFS` (what each room contains) and
  `FACILITY_DEFS` + `world.upgrades` (what works in each room: broken TV,
  derelict pool, single countertop burner, etc.), so residents can reference
  the house like people who live in it. TV/game-console are omitted from the
  list when their facility is broken (the thing isn't there).
- **Explicit narration** — `CONTENT_DIRECTIVES.mature.on` rewritten from a
  soft "write like an adult novel" into a prescriptive explicit directive:
  name the act and the body parts, no euphemisms ("her work", "the task at
  hand"), no fade-to-black, moment-by-moment sensory detail for every act.
  Reinforced again in the scene prompt's CRITICAL RULES right beside the
  output contract. Both land only when the mature content flag is on (SFW
  mode still gets "fade to black", no contradiction).

**2026-08-28 — conversation continuity + avatar bubble + phone FAB** (verified live):

- **Conversation continuity** — closing the conversation overlay is now a
  *pause*, not an ending. A paused conversation lives in a `player.conversation`
  session record (`{npcId, roomId, spoken, resumed}`) on the saved game state.
  `activeConversationSession(gameState)` in `ui.js` returns the session only if
  a real exchange has happened (`spoken`) AND both parties are still co-located
  in the session's room (stale sessions are lazily deleted). When the player
  reopens the talk with that NPC, `doTalk` skips the overture resolution and the
  "You approach X to talk." beat, and `conversationContinuityLine` in `llm.js`
  injects a prompt directive into the CURRENT SCENE block (gated on
  `context.conversationNpcId` so it only targets the actual partner) telling the
  model this is one continuous in-person talk: no greetings, no "you're still
  here", continue from the last exchange. Explicit leaves (`doConvLeave`,
  `doConvConfirmAskLeave`, `doStepAway`) and a refused approach clear the
  session. New pause controls: a ✕ minimize button in the conversation header,
  Escape (first press closes the ask menu, second closes the overlay), and a
  backdrop click.
- **Avatar bubble** — while a session is alive and neither party has left the
  room, a small avatar bubble (`#conv-bubble`) sits on the main screen above the
  phone FAB: the NPC's face chip plus name. Tapping it reopens the conversation
  exactly where it paused. Rendered each pass by `renderConvBubble` in
  `render.js`; hidden while the overlay or phone screen is open.
- **Phone FAB off the action bar** — the FAB anchored to the fixed `--footer-h`
  (56px min) but the expanded footer is ~94px, so it overlapped the last action
  chips. `refreshFooterRealHeight` in `render.js` now measures the real footer
  height each render pass into `--footer-real-h`, and `.phone-fab`,
  `.phone-device`, and `.conv-bubble` all anchor above it.
