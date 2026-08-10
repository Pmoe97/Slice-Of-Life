# The Handoff Prompt — architecture

The one-phase-per-session prompt: a document you hand an agent **verbatim,
every session, unchanged**, that makes it find its own place in a long
overhaul and leave the next session able to continue.

**Canonical exemplars:**
[`../complete/afterhours-redesign-handoff-prompt.md`](../complete/afterhours-redesign-handoff-prompt.md)
(tightest), [`../complete/inventory-needs-menu-saves-handoff-prompt.md`](../complete/inventory-needs-menu-saves-handoff-prompt.md)
(most rules), [`perchance-agent-handoff-prompt.md`](perchance-agent-handoff-prompt.md)
(the ancestor — one prompt covering several linked plans).

---

## The premise

The agent has **no memory of any previous session**. Not reduced memory —
none. Everything it needs is either in the plan's Handoff section or must be
rediscovered from the code.

That single assumption produces every rule below. The prompt is not
instructions for a task; it is a **protocol for resuming an unfamiliar
project safely**, and the task is incidental.

The prompt is paired 1:1 with a plan and lives beside it. The plan holds *what
to build*; the prompt holds *how to work*. Neither restates the other.

---

## Structure

### Opening — identity and amnesia

One paragraph: what the overhaul is (concretely — a reader should be able to
picture the finished thing), then, stated outright:

> You have no memory of any previous session. Everything you need to know
> about where things stand is either in the target document's **Handoff**
> section or must be discovered by reading the current code — never assume
> continuity with a prior chat.

Then: **"This prompt is reused verbatim for every session. Don't wait to be
told which phase to work on — find it yourself using the steps below."**

That last sentence does real work. Without it the agent asks which phase, and
the whole point is that nobody is there to answer.

### Step 0 — find out where you are (*cheaply*)

Point at the **Status table only**, not the whole plan. On a 1,100-line plan
the difference is most of the context budget.

Then state, in this order:

- **The rule:** first phase not marked Done is yours.
- **The exceptions:** which phases may run out of order, and why. Every real
  plan has some; naming them prevents both needless blocking and unsafe
  skipping.
- **The hard prerequisites:** "never skip Phase 1 before Phase 2" with the
  reason attached.
- **External blocks:** if a phase needs something outside the repo, say what
  to do when it's missing — usually *stop and tell the user* rather than
  improvise.
- **The stop condition:** if everything is Done, stop and report. Without
  this, an agent will invent work.

Close with a budget note: which sections it should read, and that it should
never need the whole document.

### Step 1 — read the Handoff, then the phase

Reading order, explicitly: Handoff → Locked decisions → Data model → the phase
block → Design invariants. Then two rules that matter more than they look:

**Citations drift.**

> Cross-check every cited file and line number against the actual current
> code before trusting it. Find the real current location by name/content, not
> blindly by line number. A stale citation is expected, not an error.

Without this an agent either trusts a moved line number and edits the wrong
place, or stalls reporting a "discrepancy" that is just normal drift.

**Stop and flag, don't improvise.**

> If a phase's instructions conflict with what you find in the live code, or a
> locked decision turns out to be unworkable, **stop and flag it** — add a
> note under "Blockers / flagged deviations" and end the session there rather
> than improvising a silent workaround.

A silent workaround is the single most expensive failure in this workflow: it
looks like progress and is discovered phases later.

### Step 2 — do exactly one phase, then stop

Four parts:

1. **Scope.** One phase. No pulling work forward, *with the reason* — phase
   boundaries encode dependency order, risk, and review granularity.
2. **Reuse, don't approximate.** List the existing patterns this overhaul
   should mirror, by function name and file. Then: go *read* them, don't work
   from the doc's paraphrase.
3. **Hard technical rules.** The project-specific invariants that must survive
   every phase. This is where the scars live — build-system gotchas, security
   posture, the sacred mechanic that must be re-verified whenever touched.
   Each rule should carry its consequence.
4. **Verification is not optional.** Say *where* verification happens (here:
   the live Perchance page, since the runtime needs `root.kv` and the image
   plugin — a local server proves nothing). Name the one or two checks that
   apply to nearly every phase and are easy to skip; here those are the
   save/load round-trip and clock/needs accounting.

Then, emphatically: once the phase is verified, **stop.** Do not roll into the
next one even with budget left. One phase per session is the point.

### Step 3 — write the handoff note before ending, *every time*

The mandatory close, done whether the phase finished, is partial, or is
blocked:

1. **Overwrite** the plan's Handoff section — Resume at / Last session's notes
   / Blockers. Not append; a growing history buries the current state.
2. **Update the Status table row.** Never leave Status and Handoff disagreeing.
3. **Promote any resolved open question** into Locked decisions as a new
   D-number.
4. **Phase-specific obligations** — e.g. "record the measured save-snapshot
   size," a number nobody else will go measure.
5. **Mark the plan complete** if this was the last phase, so Step 0 next time
   correctly reports it done.

Close with the reason, which is what makes agents actually do it:

> A half-finished phase with a precise Handoff note is recoverable; a
> half-finished phase with no note is not.

---

## The other kind: a discovery prompt

A **one-shot** prompt handed to an agent that can see something you can't —
another codebase, a live service, a system behind a login. It produces a
reference document, then it's done. Worked example:
[`perchance-menu-discovery-prompt.md`](perchance-menu-discovery-prompt.md),
which produced `../structural/perchance-menu-conventions.md`.

Its shape is different:

- **State the sources explicitly**, and that this is documentation only — no
  code changes.
- **Number the sections you want back**, in order, and weight them: say which
  section matters most and demand exhaustiveness there.
- **Ask for real quoted code**, not paraphrase, for anything you intend to
  reimplement.
- **Forbid inference.** *"If you cannot find something, write 'not found in
  source' rather than inferring it — I would rather have a gap I can fill than
  a plausible guess I can't distinguish from fact."* This is the most valuable
  line in the whole pattern.
- **Ask for the flaws.** A "things I'd flag" section turns a transcription
  into a review. The menu discovery returned eight real defects, including a
  comparator bug and an uncapped retry loop — all of which were then
  deliberately *not* copied.
- **Ask for differences to be preserved**, not averaged, when reading several
  sources.

A discovery prompt's output is a `structural/` reference, not a plan. Treat it
as evidence: it documents real code **including its bugs**, so the plan that
consumes it should record explicit *deviations* rather than adopting it whole.

---

## Skeleton

```markdown
You are one session in a long-running series implementing the **<name>**
overhaul for this game — <one concrete sentence about the finished thing>.
You have no memory of any previous session. Everything you need to know about
where things stand is either in the target document's **Handoff** section or
must be discovered by reading the current code — never assume continuity with
a prior chat.

**This prompt is reused verbatim for every session.** Don't wait to be told
which phase to work on — find it yourself using the steps below.

## Step 0 — find out where you are (cheap: the Status table, not the full doc)

Read only the `## Handoff — read this first` section and the `## Status` table
in `<path to plan>`.

The first phase not marked "Done" is your phase. The phases must be done in
order, with these exceptions: <...>. Never skip <X> before <Y> — <reason>.

If all phases are complete, **stop** and report that completion to the user.

You should never need to fully read the whole plan document in a session.

## Step 1 — read the plan's Handoff section, then the relevant phase

- Handoff first — it is the single source of truth for where the last session
  left off.
- Then "Locked decisions", "Data model", the phase block, and "Design
  invariants".
- **Cross-check every cited file and line number against the actual current
  code before trusting it.** A stale citation is expected, not an error.
- If a phase conflicts with the live code, or a locked decision turns out
  unworkable, **stop and flag it** under "Blockers / flagged deviations" and
  end the session there rather than improvising a silent workaround.

## Step 2 — do exactly one phase, then stop

- Implement **only** that phase. Phase boundaries are deliberate.
- When told to reuse a pattern, go read that code and match its current shape.
  Patterns to mirror: <list, by name and file>.
- **Hard technical rules:** <project invariants, each with its consequence>
- **Actually run the phase's Verification steps.** Verification happens
  <where>. At minimum, <the two checks that apply to nearly every phase>.
- Once verified, **stop.** One phase per session is the point.

## Step 3 — mandatory: write the handoff note before ending, every time

1. Overwrite the plan's Handoff section (Resume at / Last session's notes /
   Blockers). Name the real identifiers you created — the next session greps.
2. Update the phase's row in the Status table. Never leave Status and Handoff
   disagreeing.
3. Promote any resolved open question into Locked decisions as a new D-number.
4. <any phase-specific obligation>
5. If this was the last phase, mark the plan's Status header complete.

Do not end a session without doing this. A half-finished phase with a precise
Handoff note is recoverable; a half-finished phase with no note is not.
```

---

## Why it's shaped this way

Every rule above is a scar:

| Rule | What went wrong without it |
|---|---|
| Read the Status table, not the plan | Sessions burned most of their budget reading 1,100 lines before writing anything |
| Citations drift; find by name | An agent trusted a moved line number and edited the wrong function |
| Stop and flag, don't improvise | Silent workarounds surfaced phases later, disguised as progress |
| One phase, then stop | Two phases in one session meant neither was reviewable |
| Overwrite the Handoff | Appended notes grew until the current state was buried |
| Verification is not optional | "The code looks right" shipped a phase that never ran |
| Say where verification happens | A local server can't exercise a Perchance runtime; a "verified" phase wasn't |
