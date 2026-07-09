# Data Model: Cockpit auto mode (v1.5, A-S9) — `/cockpit:auto <epic-ref>`

**Feature**: 392-part-auto-mode-v1
**Date**: 2026-07-09

This feature is a **playbook-document addition** (like #388 / #390), so the "data model" describes:

1. The structural layout of the new `packages/claude-plugin-cockpit/commands/auto.md` file (frontmatter, sections, blocks).
2. The runtime data shapes that flow through the loop (transition events, live-state readings, subagent returns, gate answers, ledger lines).
3. The one-line addition to `packages/claude-plugin-cockpit/README.md`'s command table.

---

## Part 1 — Playbook file structure: `packages/claude-plugin-cockpit/commands/auto.md`

Follows the shape established by the six existing S6 cockpit playbooks (`clarify.md`, `merge.md`, `queue.md`, `review.md`, `status.md`, `watch.md`).

```text
auto.md
├── YAML frontmatter (---)
│   ├── description: <one-line description>
│   └── arguments:
│       ├── epic-ref (positional, required)
│       └── (no flags in v1 — flags are follow-up)
├── # Auto Command
├── (one-paragraph overview of the loop shape)
├── ## User Input (contains `$ARGUMENTS` fenced block per playbook convention)
├── ## Instructions
│   ├── 1. Parse arguments + pre-flight
│   ├── 2. Spawn `generacy cockpit watch <epic-ref>` in the background
│   ├── 3. Startup sweep — call `cockpit status --json <epic-ref>` and enter the loop with the current live state as the first "event"
│   ├── 4. Main loop — for each event line from the watcher:
│   │      a. Re-check live state via `cockpit status --json`
│   │      b. Dispatch (branch on the event class per § Dispatch table below)
│   │      c. Write ledger line (mandatory, one per dispatched event)
│   │      d. Continue until `epic-complete`
│   ├── 5. Watch re-arm — if the watcher process dies while the epic is incomplete, re-spawn it (idempotent via 4a)
│   ├── 6. Exit — on `epic-complete`, kill the watch process, print the run summary, exit zero
│   └── (bounded by numbered steps; sub-branches are the dispatch table below)
├── ## Dispatch (the nine-row event → action mapping — see contracts/dispatch-table.md)
├── ## Gate contract (the four gate types + their AskUserQuestion shape — see contracts/gate-contract.md)
├── ## Ledger (the one-line format + dual-write persistence rule — see contracts/ledger-line.md)
├── ## Invariants (six invariants from spec § Invariants)
├── ## Examples
│   ├── Example 1 — end-to-end run on a 2-phase epic
│   ├── Example 2 — clarification batch gate with N=6 open questions
│   ├── Example 3 — validate-red with fixer + retry escalation
│   └── Example 4 — agent:error with requeue escalation
└── <!-- BEGIN error-conv --> ... <!-- END error-conv --> (verbatim from the six S6 playbooks)
```

### Playbook invariants (structural)

- **PI-1**. Exactly one file at `packages/claude-plugin-cockpit/commands/auto.md` (new file).
- **PI-2**. `---` YAML frontmatter is present at the file's start with `description:` + `arguments:` keys following the S6 convention.
- **PI-3**. `## Instructions` is a numbered top-level step list (6 steps in v1). Sub-branches within a step are the dispatch table, not additional numbered steps.
- **PI-4**. `## Dispatch` block contains **exactly nine rows** matching the events named in spec § Dispatch, verbatim (`waiting-for:clarification`, `waiting-for:<artifact>-review`, `waiting-for:implementation-review`, `waiting-for:manual-validation`, `completed:validate`, `agent:error` / `failed:*` (one row), `phase-complete`, `waiting-for:address-pr-feedback`, unrecognized / ambiguous fallback).
- **PI-5**. `## Gate contract` block names **exactly four gate types**: clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations. It states "nothing else prompts; none of these auto-proceed" verbatim.
- **PI-6**. `## Ledger` block states the format (`issue · transition · action · outcome`), the mandatory-per-dispatch rule (a dispatch without a ledger line is a protocol violation), and the dual-write persistence rule (transcript + `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger`).
- **PI-7**. `## Invariants` block contains **exactly six invariants** matching spec § Invariants, verbatim: never merge on red; cockpit comments marked; add-only advance; no cross-slash-command invocation; analysis in subagents (#390); autonomy policy out of scope.
- **PI-8**. `## Examples` block contains **at least four examples** covering: end-to-end run, clarification batch gate (N>1), validate-red with fixer + retry, `agent:error` with requeue.
- **PI-9**. `<!-- BEGIN error-conv --> ... <!-- END error-conv -->` block is byte-identical to the equivalent block in the six S6 playbooks (canonical source of truth is README § Error Handling; the block cites it inline).

### File-level invariants (cross-file)

- **FI-1**. `packages/claude-plugin-cockpit/README.md`'s § Available Commands table has a new row for `/cockpit:auto` (see Part 3 below). No other change to README (the overview paragraph that #390 amended is byte-identical).
- **FI-2**. Sibling playbooks (`clarify.md`, `merge.md`, `queue.md`, `review.md`, `status.md`, `watch.md`) are byte-identical on this branch. `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` returns empty.
- **FI-3**. `.specify/memory/constitution.md` does not exist on this branch (unchanged; same finding as #388 / #390).

---

## Part 2 — Runtime data shapes

The auto command operates over five data flows:

### 2.1 Transition event (from `cockpit watch` stdout)

**Producer**: `generacy cockpit watch <epic-ref>` background process.
**Consumer**: The main-loop step 4a (re-check) and 4b (dispatch).
**Shape**: One line per event, matching S8's transition-line format. Illustrative:

```text
<owner>/<repo>#<n> · <transition-class>[:<subtype>]
```

Examples:
- `christrudelpw/epic#42 · waiting-for:clarification`
- `christrudelpw/epic#42 · waiting-for:implementation-review`
- `christrudelpw/epic#42 · completed:validate`
- `christrudelpw/epic#42 · phase-complete`
- `christrudelpw/epic#42 · epic-complete`
- `christrudelpw/epic#42 · agent:error`
- `christrudelpw/epic#42 · failed:validate`

**Trust boundary**: The transition line is **advisory** — the parent re-checks live state via `cockpit status --json` on every event before dispatching (spec § Loop). Stream lines can be stale (e.g., the watcher emitted an event, the operator ran an assist command in parallel, the label transitioned onward).

### 2.2 Live state (from `cockpit status --json`)

**Producer**: `generacy cockpit status <epic-ref> --json` (called on every event + on startup sweep).
**Consumer**: Dispatch logic (branches on the *live* transition class, not the streamed one).
**Shape**: JSON — the canonical shape is owned by S8. Illustrative fields the playbook depends on:

```json
{
  "epic": "<owner>/<repo>#<n>",
  "state": "<epic-level state>",
  "phases": [
    {
      "phase": "P1",
      "state": "complete | in-progress | queued | ...",
      "issues": [
        {
          "issue": "<owner>/<repo>#<m>",
          "labels": ["waiting-for:implementation-review", ...],
          "transition_class": "waiting-for:implementation-review",
          "pr": "<owner>/<repo>#<pr-n>",
          "checks_state": "green | red | pending | ...",
          "error_evidence": null | {...}
        }
      ]
    }
  ]
}
```

**Trust boundary**: The playbook trusts `cockpit status --json` as the source of truth. If it disagrees with the streamed event, the JSON wins (spec § Loop: "stream lines can be stale").

### 2.3 Subagent returns

Four distinct subagent boundaries, each with a fixed structured-return schema (see [contracts/subagent-boundaries.md](./contracts/subagent-boundaries.md) for the full contract).

#### 2.3.1 Clarification drafter — return

```json
[
  {
    "question_id": <int>,
    "drafted_answer": "<text>",
    "provenance": "<citation string — spec.md § Section, plan.md § Section, or path:line>"
  },
  ...
]
```

Or `{"error": "<description>"}` for hard failure. Zero questions is `[]` and short-circuits the gate.

#### 2.3.2 Review-verdict analyzer — return

Same shape as #390's contract (retained verbatim):

```json
[
  {
    "file": "<path>",
    "line": <int>,
    "summary": "<one-line>",
    "failure_scenario": "<one-to-three sentences>"
  },
  ...
]
```

Or `[]` (zero findings) or `{"error": "<description>"}`.

#### 2.3.3 Manual-validation summarizer — return

```json
{
  "scenarios": ["<one-line scenario>", ...],
  "acceptance_checks": ["<one-line check>", ...]
}
```

Or `{"error": "<description>"}`.

#### 2.3.4 Bounded fixer — return

```json
{
  "fixed": <bool>,
  "summary": "<text — what was changed, on the specific outcome that was red>",
  "reason": "<text — present when fixed: false, explaining why (design judgment required, ambiguous root cause, unreachable failure locally, etc.)>"
}
```

**Trust boundary**: The parent parses each return message as JSON. Parse failures or shape mismatches route to the escalation gate (Unrecognized state → Skip / Stop). No tolerant parsing.

### 2.4 Gate answers (from `AskUserQuestion`)

**Producer**: `AskUserQuestion` tool.
**Consumer**: Post-gate branch logic (post the answered clarification, apply the review verdict, call `cockpit advance` / `cockpit merge` / `cockpit queue` / `cockpit resume`).
**Shape**: Per the tool contract — one of the listed option labels, or "Other" free-text.

Four gate types (see [contracts/gate-contract.md](./contracts/gate-contract.md)):

| Gate | Options |
|------|---------|
| Clarification batch (per question) | `Approve draft (Recommended)` / `Skip this question`; "Other" free-text = edit path |
| Review verdict (artifact or implementation) | `approve` / `request-changes` / `abort` (same as #388) |
| Manual-validation | `manually validated` / `not yet` (single confirm) |
| Phase-queue confirmation | `Queue P<next> (<N> issues) (Recommended)` / `Cancel` |
| Escalation — validate/merge red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
| Escalation — agent:error / failed:* | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
| Escalation — unrecognized state | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` |

Escalation gates are subtypes of "red/error escalations" — one gate type with three action-set variants.

### 2.5 Ledger line

**Producer**: Every dispatch step (mandatory per PI-6 and spec § Loop).
**Consumer**: Transcript (visible to operator) + `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger` (persistent).
**Shape** (per spec § Loop and [contracts/ledger-line.md](./contracts/ledger-line.md)):

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

Examples:
- `christrudelpw/epic#42 · waiting-for:implementation-review · review-analysis+advance · approved`
- `christrudelpw/epic#42 · completed:validate · merge · merged (PR #43)`
- `christrudelpw/epic#42 · agent:error · escalation-gate · requeue (cockpit resume)`
- `christrudelpw/epic#42 · waiting-for:clarification · clarification-batch · posted 4/6, skipped 2`
- `christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (5 issues)`

**Trust boundary**: The ledger is append-only. The parent never rewrites a prior line. A dispatch that produces no ledger line is a **protocol violation** — this is the #388 enforcement-style rule.

---

## Part 3 — README.md addition (`packages/claude-plugin-cockpit/README.md`)

### Pre-392 shape (§ Available Commands table, current — post-#390)

```markdown
| Command | Description |
|---------|-------------|
| `/cockpit:watch` | Stream `generacy cockpit watch <epic-ref>` and suggest the next `/cockpit:*` verb per transition |
| `/cockpit:status` | Render `generacy cockpit status <epic-ref>` output for an epic and its children |
| `/cockpit:queue` | Confirm-gated wrapper over `generacy cockpit queue <phase>` |
| `/cockpit:clarify` | Draft grounded answers for an epic's open clarifications, approve per-question, post, and advance the gate |
| `/cockpit:review` | Review a speckit gate — artifact (`spec-review`/`clarification-review`/`plan-review`/`tasks-review`) or `implementation-review` PR diff — and advance on approval |
| `/cockpit:merge` | Merge a PR via `generacy cockpit merge`; on red, spawn a bounded fixer subagent and re-evaluate. Never merges on red |
```

### Post-392 shape (target)

One additional row at the bottom:

```markdown
| `/cockpit:auto` | Drive an epic to `epic-complete` — watch transitions, dispatch through CLI verbs + subagents, gate on judgment surfaces. Never merges on red; every gate prompts (no auto-approve). |
```

### README invariants

- **RI-1**. Table row for `/cockpit:auto` present, positioned after the `/cockpit:merge` row (alphabetical or workflow-ordering — the assist commands are ordered by workflow phase, and `auto` is the meta-command that composes them all; placing it at the bottom of the table is the natural fit).
- **RI-2**. The overview paragraph (line 7, amended by #390) is byte-identical on this branch. `grep -c "no cross-slash-command invocation" packages/claude-plugin-cockpit/README.md` returns exactly 1.
- **RI-3**. § Installation, § Distribution, § Error Handling, § Related, § License sections are byte-identical.
- **RI-4**. The runtime dependencies section still lists `generacy` and `gh`; no new runtime dependency is added by `auto.md` (the new `cockpit resume` verb ships in the same `generacy` binary and does not add a new external dependency).

---

## Part 4 — Sub-entities detail

### 4.1 `.generacy/cockpit/auto-runs/` directory

**Owner**: The operator's cwd (a writable git repo).
**Created by**: `auto.md` step 4c on first dispatch, via `mkdir -p .generacy/cockpit/auto-runs`.
**Contents**: One ledger file per invocation.

**Filename shape**: `<epic-ref-slug>-<timestamp>.ledger`
- `<epic-ref-slug>` = the epic reference with `/` replaced by `-` and `#` stripped (e.g., `christrudelpw/epic#42` → `christrudelpw-epic-42`).
- `<timestamp>` = `YYYYMMDD-HHMMSS` in the operator's local time.

Example: `.generacy/cockpit/auto-runs/christrudelpw-epic-42-20260709-143022.ledger`

### 4.2 Watch process

**Spawned in**: `auto.md` step 2, via Bash tool with `run_in_background: true`.
**Killed in**: Step 6 (`epic-complete` clean exit) or step 5 (if the watcher dies and needs re-spawn, the dead process is not "killed" — it's already dead).
**Re-arm rule**: If the process dies while the epic is incomplete, step 5 re-spawns it. The startup-sweep + live-state re-check pair ensure the re-arm is idempotent (events streamed after re-arm that duplicate already-dispatched work are recognized as no-ops by the re-check step).

### 4.3 Session mute set

**Owner**: In-memory state of the running `/cockpit:auto` invocation.
**Contents**: A set of `<issue-ref>` strings.
**Populated by**: The `Skip` escalation action (Q3=D, spec § Dispatch).
**Consumed by**: Step 4b — if an event's issue-ref is in the mute set, skip the dispatch and write a ledger line noting the mute.
**Lifetime**: Only the current auto run. Never persisted to disk; never touched labels.
**Rationale**: Session-local mute preserves invariant §3 (add-only advance). Muted issues resurface on the next auto run's startup sweep, which is correct.

### 4.4 Run summary

**Produced in**: Step 6 (`epic-complete`).
**Shape**: One paragraph or short table summarizing the run — count of events dispatched, count per gate class, count of muted issues, count of ledger lines, exit reason, ledger file path.

Example:

```text
Auto run complete.

Epic: christrudelpw/epic#42 · Exited: epic-complete
Events dispatched: 27
  · Clarification batches: 3 (12/14 answers posted, 2 skipped)
  · Review verdicts: 8 (6 approved, 2 request-changes)
  · Manual-validation gates: 2 (both validated)
  · Phase-queue confirmations: 2 (P2, P3 queued)
  · Merges: 6 (all green, 0 fixer runs)
  · Escalations: 0
Muted issues (session-local): 0
Ledger file: .generacy/cockpit/auto-runs/christrudelpw-epic-42-20260709-143022.ledger
```

---

## Part 5 — Relationships

```text
Instructions.steps[4].main-loop
  ├─ reads: Transition event (from cockpit watch stdout)   ──► 2.1
  ├─ calls: cockpit status --json  ──►  Live state          ──► 2.2
  ├─ branches on: transition_class (live)  ──► § Dispatch table (nine rows)
  ├─ optionally spawns: one of four subagent hops           ──► 2.3
  ├─ optionally prompts: one of four gate types             ──► 2.4
  └─ always writes: one Ledger line                         ──► 2.5

Dispatch table (nine rows, one per event class)
  ├─ waiting-for:clarification         ──► Clarification drafter subagent + fused batch gate + gh issue comment + cockpit advance
  ├─ waiting-for:<artifact>-review     ──► Review analyzer subagent + verdict gate + cockpit advance / COMMENT review
  ├─ waiting-for:implementation-review ──► Same as artifact-review (uses #390 contract for the analyzer)
  ├─ waiting-for:manual-validation     ──► Manual-validation summarizer subagent + confirm gate + cockpit advance
  ├─ completed:validate (checks green) ──► cockpit merge (no gate — human verdict was implementation-review)
  ├─ completed:validate (red) / merge red ──► Bounded fixer subagent + (if still red) escalation gate
  ├─ agent:error / failed:*            ──► Fetch evidence + escalation gate (Requeue = cockpit resume)
  ├─ phase-complete                    ──► Phase-queue confirmation gate + cockpit queue --yes
  ├─ waiting-for:address-pr-feedback   ──► Ledger line only (server-side owns it)
  └─ unrecognized / ambiguous          ──► Escalation gate (Skip / Stop only, no Retry)

Gate contract (four gate types)
  ├─ Clarification batches             ──► ceil(N/4) AskUserQuestion calls in one response; "Other" = edit path
  ├─ Review/validation verdicts        ──► Single AskUserQuestion with approve/request-changes/abort (or manually-validated/not-yet)
  ├─ Phase-queue confirmations         ──► Single AskUserQuestion with Queue/Cancel
  └─ Red/error escalations             ──► Single AskUserQuestion with Retry/Skip/Stop or Requeue/Skip/Stop or Skip/Stop

Subagent hops (four types, all subagent_type: "general-purpose" per #390)
  ├─ Clarification drafter             ──► Returns [{question_id, drafted_answer, provenance}, ...] or {"error"}
  ├─ Review-verdict analyzer           ──► Returns [{file, line, summary, failure_scenario}, ...] or [] or {"error"} — #390 contract
  ├─ Manual-validation summarizer      ──► Returns {scenarios: [...], acceptance_checks: [...]} or {"error"}
  └─ Bounded fixer                     ──► Returns {fixed: bool, summary, reason?}

Ledger line
  ├─ Format: issue · transition · action · outcome
  ├─ Written to: transcript (visible) + .generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger (persistent)
  └─ Mandatory per dispatch (dispatch without ledger = protocol violation, #388 enforcement style)

Session mute set (in-memory)
  ├─ Populated by: Skip escalation action
  └─ Consumed by: dispatch step (mute → ledger line only, no CLI action)
```

---

## Part 6 — Validation rules (non-normative summary)

- The parent's loop body (step 4) is exactly four operations per event: re-check live state → dispatch → gate (optional) → ledger. Nothing else.
- Every event that reaches the dispatch table produces exactly one ledger line.
- No `AskUserQuestion` invocation exists in the playbook outside the four gate types listed in § Gate contract.
- No `cockpit advance` invocation exists in the playbook with a `--skip` flag or equivalent state-forging argument.
- No `gh pr merge` (or equivalent direct-merge) invocation exists in the playbook. The only merge primitive is `cockpit merge`.
- No `/cockpit:*` slash-command invocation exists in the playbook. Cross-command composition is CLI verb + subagent only.
- Every subagent hop uses `subagent_type: "general-purpose"` unconditionally. No fallback branches on agent-type availability.
- Every subagent return is parsed as JSON with a fixed schema. Parse failures or shape mismatches route to the escalation gate.
- The clarification batch gate presents drafts + `ceil(N/4)` `AskUserQuestion` calls in the same assistant response. No two-turn pattern.
- The bounded fixer subagent returns `{fixed, summary, reason?}` and runs at most once per red event autonomously; further runs require the escalation gate's Retry action.
- The `Skip` action in every escalation gate is session-local mute only. No label writes.
- The ledger file is created via `mkdir -p .generacy/cockpit/auto-runs` on first dispatch and appended one line per dispatch via `>> .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`.
- The watch process is spawned as a background Bash process and re-armed idempotently if it dies while the epic is incomplete.
- The run summary at exit references the ledger file's absolute path so the operator can find it.
