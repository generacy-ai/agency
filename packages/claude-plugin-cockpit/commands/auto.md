---
description: Drive an epic to epic-complete — auto-transport over cockpit watch events with fused human gates
arguments:
  - name: epic-ref
    description: "Epic reference (owner/repo#N). Required. No flags in v1."
    required: true
---

# Auto Command

Drive the named epic to `epic-complete` by watching state transitions and dispatching to the six existing assist commands' *actions* (CLI verbs + subagent hops), never the assist commands themselves. The loop shape is: **pre-flight → spawn `cockpit watch` → per event: re-check live state → dispatch → write one ledger line → exit on `epic-complete`.** Two hard boundaries are load-bearing: **never merge on red** (validate + green is mechanical; anything red routes through the bounded-fixer branch and, if still red, an escalation gate) and **every gate prompts** (per-gate auto-approve / "full auto" is explicitly out of scope). Analysis lives in subagents (`subagent_type: "general-purpose"`) whose contracts return strict JSON per hop; the parent loop stays thin.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments + pre-flight.** Require exactly one positional `<epic-ref>` (`owner/repo#N`). On usage error, print `Usage: /cockpit:auto <epic-ref>` and exit non-zero. Pre-flight: `command -v generacy` (on failure → **Error handling** class `MISSING_BINARY`); `gh auth status` (on failure → **Error handling** class `AUTH_FAILURE`); confirm the operator's cwd is a writable git repo; create the ledger directory with `mkdir -p .generacy/cockpit/auto-runs` (on failure → **Error handling** class `OTHER`). Compute the run's ledger filename: `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`, where `<epic-ref-slug>` is the epic reference with `/` replaced by `-` and `#` stripped, and `<timestamp>` is `YYYYMMDD-HHMMSS` in the operator's local time captured now.

2. **Spawn `generacy cockpit watch <epic-ref>` in the background.** Use the Bash tool with `run_in_background: true` and capture the process handle. This is the event stream for step 4.

3. **Startup sweep.** Call `generacy cockpit status --json <epic-ref>` and treat every issue whose current transition class is one of D.1–D.9 (below) as a synthetic event. Dispatch each one by one (per § Dispatch and § Ledger) before entering the main loop. This handles the case where the epic already has open work when `/cockpit:auto` is invoked.

4. **Main loop.** New lines from the background watch process output are read **unfiltered**. Every non-empty line (trim leading/trailing whitespace, then any remaining content — including malformed or truncated JSON) is an event; whitespace-only lines are dropped as line-framing hygiene. Content-shape heuristics (must-start-with-`{`, must-parse-as-JSON, or similar) are prohibited — a truncated flush would be dropped silently, which is under-delivery, the failure class this fix exists to kill.

   **Never construct field- or content-based filters over the stream.** The stream carries more than one event shape: legacy per-issue transitions use the envelope `{ts, repo, kind, number, event, labels}` and have **no `type` field**; only S8 synthetic aggregates (`phase-complete`/`epic-complete`) carry `type`. Filtering on `type` would drop every real transition event. The T-S4 anti-pattern — `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` — is prohibited. Over-delivery is harmless (step 4a re-check absorbs it); under-delivery is silent loop death — this asymmetry is the entire justification for the no-filter rule.

   If the harness's stream-monitor primitive requires a match pattern to arm a reader, the sanctioned pattern is any non-empty line (regex `.+`, or the newline-delimited-read equivalent) — never a JSON field, JSON key, `type`/`event` substring, or any schema-shape discriminator.

   Each read from the background watch process output is bounded to **30 seconds** per iteration. The 30-second bounded read is the sole new detection mechanism admitted by this fix: a dead reader cannot event-drive its own diagnosis, so a bounded read is required to make the empty-read counter observable at step 5's liveness cross-check.

   For each event line consumed:
   - **(a) Re-check live state** via `generacy cockpit status --json <epic-ref>`. The streamed line is advisory; the live JSON is authoritative (spec § Loop). If the epic's live state is `epic-complete`, go to step 6.
   - **(b) Dispatch** per § Dispatch below, branching on the *live* transition class.
   - **(c) Write one ledger line** per § Ledger (transcript print + append to the run's `.ledger` file). A dispatch without a ledger line is a protocol violation.
   - **(d) Continue** the loop.

   Issue-history footnote: on the T-S4 run, `cockpit watch` produced 17 NDJSON lines and 1 reached the loop; the other 16 legacy per-issue events were dropped by an improvised field-based filter (see agency#394). This is an instance of the "instruction gap → improvisation" class that #384 (Terminal Outcome Check) and #388 (fusion) instanced at the review gate; #394 instances it at the mechanism gap in the consumption recipe.

5. **Watch re-arm.** If the background `cockpit watch` process dies while the epic is incomplete, re-spawn it (repeat step 2's Bash invocation). The **Startup sweep** (step 3) + the live-state re-check (4a) make the re-arm idempotent — spawning `cockpit watch` twice on the same live state produces no duplicate action, because the re-check catches events that are already dispatched (state moved on).

   **Liveness cross-check.** A live watch process with a dead consumer must be treated as a broken loop — the mechanism-gap defense-in-depth analogue of this step's process-death defense, not a replacement. The cross-check fires only on the conjunction of:
   1. The background watch process is alive (still running per Bash tool handle status).
   2. **N=4 consecutive empty reads** have elapsed from step 4's 30-second bounded read (~2 minutes of silence).
   3. `generacy cockpit status --json <epic-ref>` reports at least one issue in a D.1–D.9 transition class (actionable live state).

   The `cockpit status --json` call runs **only at the threshold** (after N=4 empty reads), not on every empty read. The cross-check is **compound**: silence alone is normal during long implement stretches and does not fire it — the compound predicate (silence AND actionable live state) is what distinguishes a broken consumer from an idle loop.

   **Recovery** is exactly: re-arm the stream reader (same mechanism as the process-death path above) + re-run step 3 (startup sweep). Both are idempotent per the L.5 rule so no duplicate action can result. **No new recovery machinery is introduced** — this constraint applies to the recovery path only; step 4's 30-second bounded read + N=4 empty-read counter is the only new detection mechanism admitted by this fix.

6. **Exit.** On `epic-complete`, kill the background watch process, print the run summary per § Ledger L.6 (including the absolute path of the run's `.ledger` file), and exit zero. Non-`epic-complete` exits (Stop from an escalation gate, unrecoverable error) print an abbreviated summary with the exit reason.

## Dispatch

The following nine event classes are dispatched per this table. The parent **always** re-checks live state on every event (step 4a) — streamed lines are advisory (spec § Loop trust boundary). Each dispatch is composed of **CLI verb + optional subagent + optional gate**; no dispatch invokes a `/cockpit:*` slash command (invariant §4).

| # | Event | Action shape |
|---|-------|--------------|
| D.1 | `waiting-for:clarification` | Clarification drafter subagent → fused batch gate → post + `cockpit advance` |
| D.2 | `waiting-for:<artifact>-review` | Review-verdict analyzer subagent → fused verdict gate → `cockpit advance` OR `COMMENT` review |
| D.3 | `waiting-for:implementation-review` | Same as D.2 (uses #390 contract for PR-scope analyzer) |
| D.4 | `waiting-for:manual-validation` | Manual-validation summarizer subagent → confirm gate → `cockpit advance` |
| D.5 | `completed:validate` + green | `cockpit merge` (no gate — human verdict was implementation-review) |
| D.6 | `completed:validate` + red / merge red | Bounded fixer subagent (once) → still red → escalation gate (Retry / Skip / Stop) |
| D.7 | `agent:error` / `failed:*` | Fetch evidence → escalation gate (Requeue / Skip / Stop) |
| D.8 | `phase-complete` | Phase-queue confirmation gate → `cockpit queue --yes` |
| D.9 | `waiting-for:address-pr-feedback` | Ledger line only (server-side owns it) |
| D.9a | `waiting-for:pr-feedback` | Ledger line only (legacy alias) |
| D.9b | `waiting-for:children-complete` | Ledger line only (epic-container state) |
| D.9c | `waiting-for:dependencies` | Ledger line only (engine-owned cross-issue wait) |
| D.11 | `waiting-for:merge-conflicts` | Escalation gate (`I've resolved it` / `Skip` / `Stop`) |
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |

### D.1 — `waiting-for:clarification`

**Trigger**: An issue enters `waiting-for:clarification` (open clarification questions posted, awaiting operator-authored answers). Verbatim event string: `waiting-for:clarification`.

**Dispatch**:
1. **Fetch context**: `generacy cockpit context <issue-ref>` (the same CLI verb `/cockpit:clarify` uses — the renamed successor to `clarify-context`).
2. **Spawn clarification drafter subagent** (see § Gate contract G.1 and the SB.1 return schema below). Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Draft clarifications <issue-ref>"
   prompt: <inlined open-question list + spec/plan bodies + touched-files context + return-schema directive>
   ```
   The subagent MUST NOT invoke any slash command. It returns a single JSON value — either an array of `{question_id, drafted_answer, provenance}` (one per open question, in order), or `{"error": "<description>"}`. No prose, no fenced block.
3. **Present fused batch gate** (see § Gate contract G.1). In one assistant response: presentation block with numbered `### Q<n>` drafts and one-line `_provenance: …_` citations; **plus** `ceil(N/4)` `AskUserQuestion` calls, one per open clarification, options exactly `Approve draft (Recommended)` / `Skip this question`, header `Q<n>` (≤ 12 chars), `multiSelect: false`. Built-in "Other" free-text = edit path — the operator's replacement text is posted verbatim in place of the draft.
4. **Assemble comment body**: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per approved (or edited) answer. Write to `/tmp/cockpit-auto-clarify-<issue>-<unix_ts>.md`. Post via `gh issue comment "$ISSUE" --body-file <tmpfile>` — use `--body-file` exclusively (never `-b` / `--body`; shell quoting risks stripping the marker).
5. **Advance gate**: If every open question received an approved or edited answer, run `generacy cockpit advance --gate clarification <issue-ref>`. If some were skipped, do not advance — write a ledger line noting the partial state (`posted <k>/<N>, skipped <s>`) and continue.

**Ledger line**: `<issue-ref> · waiting-for:clarification · clarification-batch · <outcome>` where outcome is one of `advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>`.

**Failure modes**:
- Subagent returns `{"error": …}` → **Error handling** class `OTHER`; do not post; do not advance; write ledger line noting the error.
- All answers skipped → do not post; do not advance; ledger line `all answers skipped`.
- Post fails → **Error handling**; ledger line noting the failure (do not attempt retraction).
- Advance fails → **Error handling**; ledger line noting the failure.

### D.2 — `waiting-for:<artifact>-review`

**Trigger**: An issue enters `waiting-for:spec-review`, `waiting-for:clarification-review`, `waiting-for:plan-review`, or `waiting-for:tasks-review`. Verbatim event string: `waiting-for:<artifact>-review`.

**Dispatch**:
1. **Resolve target artifact** — parse `<artifact>` from the transition class; identify the file to review (e.g., `specs/<issue-slug>/spec.md`, `plan.md`, `tasks.md`, `clarifications.md`).
2. **Spawn review-verdict analyzer subagent** — reuses #390's contract verbatim. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Review artifact <name>"
   prompt: <artifact path + gate name + review instructions + return-schema directive>
   ```
   The subagent reads the artifact + surrounding context directly and returns a single JSON value — either an array of `[{file, line, summary, failure_scenario}, ...]`, `[]` for zero findings, or `{"error": "<description>"}`. No prose, no fenced block. **MUST NOT print raw JSON under any circumstance.** The parent renders the parsed array as a findings-summary table; it never restates the JSON verbatim.
3. **Present fused verdict gate** (see § Gate contract G.2). In one assistant response: findings-summary table (per #388 C.3.5 shape) + `Suggested decision: <approve | request-changes>` line + single `AskUserQuestion` with options `approve` / `request-changes` / `abort` (in that order), header `Verdict`, `multiSelect: false`. For zero findings (`[]`), still present the gate — the row is `| (none) | | | |` with `Suggested decision: approve`.
4. **Apply verdict**:
   - `approve` → `generacy cockpit advance --gate <gate-name> <issue-ref>`.
   - `request-changes` → post a `COMMENT` review with per-finding inline threads (each finding becomes a `Comment` on `file:line` with body `<summary> — <failure_scenario>`); the server-side feedback loop owns the rest — no `advance` call.
   - `abort` → do nothing (no post, no advance).

**Ledger line**: `<issue-ref> · waiting-for:<artifact>-review · review-analysis+<verdict> · <outcome>` — outcomes: `approved` / `request-changes (<count> findings)` / `aborted` / `advance failed` / `error: <description>`.

**Failure modes**: `[]` still prompts the gate (assist-mode contract preserved). `{"error": …}` → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Parse failure or other shape → **Error handling** with the raw return quoted.

### D.3 — `waiting-for:implementation-review`

**Trigger**: A PR enters `waiting-for:implementation-review`. Verbatim event string: `waiting-for:implementation-review`.

**Dispatch**: Structurally identical to D.2; the only difference is the scope passed to the subagent — an artifact file (D.2) vs. a PR reference (D.3). Both use the #390 contract verbatim.

1. **Resolve PR** — from `cockpit status --json`, get the issue's associated PR ref (`<owner>/<repo>#<pr-n>`).
2. **Spawn review-verdict analyzer subagent** — same subagent as D.2, invoked with the PR ref as scope:
   ```
   subagent_type: "general-purpose"
   description: "Code review PR #<n>"
   prompt: <PR ref + review instructions + return-schema directive>
   ```
   The prompt carries only the PR reference; the subagent fetches its own diff via `gh pr diff <owner>/<repo>#<pr-n>` and reads surrounding files as needed. Returns strict JSON per the SB.2 schema. The raw-JSON-suppression clause carried forward from #388 / #390 (canonical inline occurrence is in D.2 prose above) applies here identically — the parent renders the parsed findings as a table; it never restates the JSON verbatim.
3. **Present fused verdict gate** — same as D.2 (see § Gate contract G.2).
4. **Apply verdict** — same as D.2.

**Ledger line**: `<issue-ref> · waiting-for:implementation-review · review-analysis+<verdict> · <outcome>`.

### D.4 — `waiting-for:manual-validation`

**Trigger**: An issue enters `waiting-for:manual-validation` (implementation approved, awaiting manual smoke test). Verbatim event string: `waiting-for:manual-validation`.

**Dispatch**:
1. **Spawn manual-validation summarizer subagent** — the parent MUST NOT read the spec / issue body / PR body inline (Q4=B, AP-9). All artifact reads happen inside the subagent. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Manual val summary <issue-ref>"
   prompt: <issue-ref + PR-ref + read-and-summarize instructions + return-schema directive>
   ```
   The subagent reads spec §Success Criteria + the issue's acceptance criteria + the PR title/body, and returns a single JSON value — either `{scenarios: [...], acceptance_checks: [...]}` (one-line entries in each list) or `{"error": "<description>"}`. No prose, no fenced block.
2. **Present manual-validation gate** (see § Gate contract G.3). In one assistant response: `**Scenarios to test:**` bulleted list + `**Acceptance checks:**` bulleted list (rendered verbatim from the structured return) + single `AskUserQuestion` with options `manually validated` / `not yet`, header `Validated?` (≤ 12 chars), `multiSelect: false`.
3. **Apply verdict**:
   - `manually validated` → `generacy cockpit advance --gate manual-validation <issue-ref>`.
   - `not yet` → do nothing (the label stays; the event will re-fire when the operator confirms later or takes another action).

**Ledger line**: `<issue-ref> · waiting-for:manual-validation · manual-validation-summary+<verdict> · <outcome>` — outcomes: `manually validated` / `not yet` / `error: <description>`.

**Failure modes**: `{"error": …}` → **Error handling** class `OTHER`; do not invoke gate; ledger line.

### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green. Verbatim event string: `completed:validate`.

**Dispatch**:
1. **Confirm state via `cockpit status --json`** — verify `checks_state == "green"` and no infrastructure/runner failures. A `completed:validate` streamed event whose live state shows red falls through to D.6.
2. **Merge**: `generacy cockpit merge <pr-ref>` (squash, branch delete per the CLI's default).
3. **No gate.** The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt.

**Never merge on red** — the branch exists here strictly on the `result: merged` outcome (invariant §1).

**Ledger line**: `<issue-ref> · completed:validate · merge · <outcome>` — outcomes: `merged (PR #<n>)` / `blocked: missing-approval` / `blocked: draft` / `blocked: pending` / `blocked: missing-label` / `infrastructure failure — <checks>`.

**Failure modes**:
- `cockpit merge` returns `result: "red"` → fall through to D.6 (fixer branch).
- `cockpit merge` returns `result: "blocked"` → handle per `merge.md`'s existing decision tree (missing-label / missing-approval / draft / pending). For `pending`, defer to the watcher (do not poll). For other blocked reasons, ledger line and continue.
- Infrastructure/runner failure → do not burn a fixer attempt; ledger line `infrastructure failure — <check names>` and continue.

### D.6 — `completed:validate` (red) / merge red → bounded fixer subagent

**Trigger**: `completed:validate` with `checks_state == "red"` OR a `cockpit merge` call in D.5 returned `result: "red"`.

**Dispatch**:
1. **Classify failing checks** — infrastructure/runner failures abort without burning an attempt (repo-owned CI classes only: tests / lint / typecheck / build).
2. **Spawn bounded fixer subagent** — runs **once autonomously** per red event. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Fix red checks PR #<n>"
   prompt: <PR ref + failing-check summaries + outcome-scoping directive + return-schema directive>
   ```
   The prompt is **outcome-scoped**, verbatim:
   > "Make this specific red green (the named failing checks: `<check names>`). No refactors, no feature work, no scope expansion, no 'while I'm here' cleanups. If the fix requires design judgment (ambiguous root cause, multiple viable approaches, an architectural decision), stop and return `{fixed: false, reason: '<explanation>'}` instead of guessing."
   The subagent MAY read surrounding files, run local checks, and iterate on its own fix before returning; it MAY push commits to `pr.head_ref`. It MUST NOT call `generacy cockpit merge` (the parent owns the loop). It MUST NOT invoke any slash command. Return contract: a single JSON value `{fixed: bool, summary, reason?}` — no error shape (errors surface as `{fixed: false, reason: "<error description>"}`).
3. **Re-evaluate**:
   - `{fixed: true, summary: …}` → loop back to D.5 (re-run `cockpit merge`; the re-check catches whether the fix actually turned checks green).
   - `{fixed: false, summary: …, reason: …}` → present escalation gate (see § Gate contract G.4a) with options `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
4. **Apply escalation verdict**:
   - `Retry` → re-run the fixer subagent **once** (operator-approved single re-run; the gate is the bound). Each Retry produces a new ledger line and a new subagent invocation.
   - `Skip` → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.**
   - `Stop` → kill watch; run summary; exit auto cleanly. **No label writes.**

The fixer runs **once autonomously** per red event; each further run requires the escalation gate's Retry. Bounded by outcome scope, not file scope.

**Ledger lines** (mandatory per-attempt):
- Successful fix: `<issue-ref> · completed:validate:red · fixer · fixed`.
- Unfixed (about to escalate): `<issue-ref> · completed:validate:red · fixer · unfixed → escalation`.
- Escalation outcome: `<issue-ref> · completed:validate:red · fixer+escalation-gate · <retry | skip (session-local mute) | stop (exit)>`.

### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch**:
1. **Fetch evidence** — read the alert content (bot-authored comment on the issue with the failure evidence). Use `gh issue view <issue-ref> --comments --json comments -q '.comments[]'` or equivalent.
2. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block including the evidence (last N lines of the failure trace, or the alert comment body) + single `AskUserQuestion` with options `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`.
3. **Apply verdict**:
   - `Requeue` → `generacy cockpit resume <issue-ref>` (engine verb per Assumption A2 — clears `agent:error` / `failed:*`, restores the phase's `waiting-for:` / `completed:` resume pair).
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Degradation clause**: If `generacy cockpit resume` is unavailable (G-S8 did not ship the verb, per Assumption A2), Requeue degrades to Skip with an explicit ledger note: `<issue-ref> · <transition> · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

**Ledger line**: `<issue-ref> · <agent:error | failed:<subtype>> · escalation-gate · <outcome>` — outcomes: `requeue (cockpit resume)` / `requeue failed: <description>` / `skip (session-local mute)` / `skip (cockpit resume unavailable — G-S8 prerequisite)` / `stop (exit)`.

**Failure modes**: `cockpit resume` returns non-zero → **Error handling** class `OTHER`; ledger line; leave the issue in its failed state (do not retry automatically).

### D.8 — `phase-complete` → phase-queue confirmation gate

**Trigger**: A phase completes (all its issues reached terminal states). S8 emits `phase-complete` when the epic's next phase is ready to queue. Verbatim event string: `phase-complete`.

**Dispatch**:
1. **Compute next phase scope** — from `cockpit status --json`, identify the next phase (P<next>) and its N issues.
2. **Present phase-queue gate** (see § Gate contract G.5). In one assistant response: presentation block with next-phase issue list numbered with titles + single `AskUserQuestion` with options `Queue P<next> (<N> issues) (Recommended)` / `Cancel`, header `QueueP<next>`, `multiSelect: false`.
3. **Apply verdict**:
   - `Queue P<next>` → `generacy cockpit queue <epic-ref> P<next> --yes` (the CLI's `--yes` flag is used because the gate itself is the confirmation).
   - `Cancel` → ledger line noting the cancellation; continue loop.

**Ledger line**: `<epic-ref> · phase-complete · phase-queue-gate · <queued P<next> (<N> issues) | cancelled>`.

### D.9 — `waiting-for:address-pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:address-pr-feedback`. Verbatim event string: `waiting-for:address-pr-feedback`.

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — this transition is **server-side-owned** (the plugin has no local action to add). The ledger line accounts for the event; the loop continues.

**Ledger line**: `<issue-ref> · waiting-for:address-pr-feedback · (no-op) · server-side-owned`.

### D.9a — `waiting-for:pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:pr-feedback`. Verbatim event string: `waiting-for:pr-feedback`. Legacy alias of the engine-owned feedback loop (D.9 `waiting-for:address-pr-feedback` is the modern shape; some pre-migration epics still emit the shorter `pr-feedback` label).

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:pr-feedback · (no-op) · server-side-owned`.

### D.9b — `waiting-for:children-complete` → ledger only

**Trigger**: An epic-container issue enters `waiting-for:children-complete`. Verbatim event string: `waiting-for:children-complete`. Epic-container state — the running auto loop *is* its resolution (children dispatch as they transition; on the last child's completion, this label transitions naturally to `epic-complete` without operator input).

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:children-complete · (no-op) · server-side-owned`.

### D.9c — `waiting-for:dependencies` → ledger only

**Trigger**: An issue enters `waiting-for:dependencies`. Verbatim event string: `waiting-for:dependencies`. Engine-owned cross-issue wait — resolved server-side when the depended-on issue transitions.

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:dependencies · (no-op) · server-side-owned`.

### D.11 — `waiting-for:merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)

**Trigger**: An issue enters `waiting-for:merge-conflicts` (base-sync produced a merge conflict; the branch cannot be advanced without an operator-authored resolution). Verbatim event string: `waiting-for:merge-conflicts`.

**Dispatch**:
1. **Fetch context.** Read the pause-alert comment posted by the engine when the label was set (via `gh issue view --comments <issue-ref>`). Extract the list of conflicted paths.
2. **Present escalation gate** (see § Gate contract G.4d). In one assistant response: presentation block including the conflicted paths + single `AskUserQuestion` with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`.
3. **Apply verdict**:
   - `I've resolved it — advance the gate` → run `generacy cockpit advance --gate merge-conflicts <issue-ref>`. On zero exit: ledger `advanced`; continue. **On non-zero exit: re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block** (see § Gate contract G.4d re-present shape). The operator may retry, skip, or stop from the re-presented gate.
   - `Skip (session-local mute)` → add `<issue-ref>` to session mute set; ledger line `skip (session-local mute)`; continue.
   - `Stop (exit auto)` → kill watch; summary; exit.

**Future degradation**: Once the engine-side merge-conflicts resolver ships (companion finding in generacy dead-end-gate), this row degrades to ledger-only (D.9-shape) — the label becomes server-side-owned. Until then, this escalation gate is the operator's resolution surface.

**Ledger line**: `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · <advanced | advance failed: <description> | skip (session-local mute) | stop (exit)>`.

### D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)

**Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9 (including D.9a/b/c) or D.11. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape, **(d) the `waiting-for:*` label is a token that does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)**.

**Any `waiting-for:*` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of `waiting-for:*` states the loop may treat as no-ops (via the named ledger-only rows D.9, D.9a, D.9b, D.9c). "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` state unless the table explicitly names it ledger-only. If the table does not name it, D.10 fires — verbatim state in the presentation block.

**Dispatch**:
1. **Present escalation gate** (see § Gate contract G.4c). In one assistant response: presentation block including the observed state (verbatim from `cockpit status --json`) + streamed event line + single `AskUserQuestion` with options `Skip (session-local mute) (Recommended)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. **NEVER Retry** (nothing to retry — we don't know what to do).
2. **Apply verdict**:
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Never guess** — the escalation gate is the surface for any state class the playbook cannot dispatch.

**Ledger line**: `<issue-ref> · <observed-state> · unrecognized-state · <skip (session-local mute) | stop (exit)>`.

## Gate contract

Four gate types — **clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations** — are the exhaustive human-interaction surface. **Nothing else prompts; none of these auto-proceed.** Every gate is fused with its presentation in one assistant response (#388 pattern applied uniformly). Every gate uses `AskUserQuestion` — never a Bash `read` prompt, never a text-only question the operator answers in prose.

| # | Gate | Options | Presentation |
|---|------|---------|--------------|
| G.1 | Clarification batch | `Approve draft (Recommended)` / `Skip this question` × `ceil(N/4)` calls | Numbered drafts with provenance |
| G.2 | Review verdict | `approve` / `request-changes` / `abort` (single call) | Findings-summary table + Suggested decision |
| G.3 | Manual-validation confirm | `manually validated` / `not yet` (single call) | Scenarios + acceptance_checks lists |
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:* | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (d) | Escalation: Merge-conflicts | `I've resolved it — advance the gate` / `Skip` / `Stop` (single call) | Conflicted paths (+ CLI stderr on re-present) |
| G.4 (c) | Escalation: unrecognized state | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
| G.5 | Phase-queue confirmation | `Queue P<next> (Recommended)` / `Cancel` (single call) | Next-phase issue list |

### G.1 — Clarification batch gate

**Trigger**: D.1 (`waiting-for:clarification`).

**Presentation** (in the same response as the `AskUserQuestion` calls):

```markdown
Drafted answers for <issue-ref> (N open questions):

### Q1: <question title / summary>
<drafted answer, ~4-8 sentences>
_provenance: <citation>_

### Q2: <question title / summary>
<drafted answer>
_provenance: <citation>_

... (Q3 through QN)
```

**Gate invocation**: `ceil(N/4)` `AskUserQuestion` calls in the **same response**, one question per open clarification, each with:
- **Question text**: `Approve Q<n>? "<question summary>"`
- **Header**: `Q<n>` (≤ 12 chars)
- **Options** (exactly two, discrete, in this order):
  1. `Approve draft (Recommended)` — post the drafted body verbatim
  2. `Skip this question` — drop this answer from the run
- **multiSelect**: `false`

**Edit path**: The built-in "Other" free-text channel per `AskUserQuestion` is the edit path. Whatever replacement text the operator types is posted **verbatim** in place of the draft. No explicit "Edit" option is listed — listing "Edit" would require a second turn to collect the replacement text, reintroducing the #388 turn-split this gate exists to prevent.

**Post-gate behavior**:
- Approved answers → posted as one marker-prefixed comment (per D.1 step 4).
- Skipped answers → dropped; do not appear in the comment.
- Edited answers ("Other" free-text) → posted verbatim.
- All approved → `cockpit advance --gate clarification`; ledger `advanced`.
- Some approved, some skipped → post the approved subset; do not advance; ledger `posted <k>/<N>, skipped <s>`.
- All skipped → post no comment; do not advance; ledger `all answers skipped`.

### G.2 — Review verdict gate (artifact and implementation)

**Trigger**: D.2 (`waiting-for:<artifact>-review`) or D.3 (`waiting-for:implementation-review`).

**Presentation** (in the same response as the `AskUserQuestion` call) — the findings-summary table verbatim per #388 C.3.5:

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | <path>:<line> | <one-line finding summary> | Yes |
| 2 | <path>:<line> | <one-line finding summary> | No |
| ... |

Suggested decision: <approve | request-changes>
```

For zero findings (`[]` from the subagent):

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |

Suggested decision: approve
```

**Retained rule** (canonical inline occurrence is in D.2 prose — the raw-JSON-suppression clause carried forward from #388 / #390): the subagent's structured return is parsed and rendered as a table; it is never restated verbatim in the response body.

**Gate invocation**: One `AskUserQuestion` call in the same response, with:
- **Question text**: `Verdict for <issue-ref> (<gate-name>)?`
- **Header**: `Verdict` (≤ 12 chars)
- **Options** (exactly three, discrete, in this order):
  1. `approve` — advance the gate
  2. `request-changes` — post COMMENT review with per-finding inline threads
  3. `abort` — do nothing
- **multiSelect**: `false`

**Post-gate behavior**:
- `approve` → `generacy cockpit advance --gate <gate-name> <issue-ref>`.
- `request-changes` → post a `COMMENT` review with per-finding inline threads.
- `abort` → do nothing.

Hard-error subagent returns (`{"error": …}` or unparseable) → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Zero findings still invokes `AskUserQuestion` — no auto-approve smuggled in.

### G.3 — Manual-validation confirm gate

**Trigger**: D.4 (`waiting-for:manual-validation`).

**Presentation** (in the same response as the `AskUserQuestion` call) — the subagent's structured summary rendered as bullet lists:

```markdown
Manual validation checklist for <issue-ref> (PR <pr-ref>):

**Scenarios to test:**
- <scenario 1>
- <scenario 2>
- ...

**Acceptance checks:**
- <check 1>
- <check 2>
- ...
```

**Gate invocation**: One `AskUserQuestion` call in the same response, with:
- **Question text**: `Have you manually validated <issue-ref>?`
- **Header**: `Validated?` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `manually validated` — advance the gate
  2. `not yet` — do nothing; the event will re-fire when the operator confirms later
- **multiSelect**: `false`

The scenarios and acceptance_checks lists come **only** from the subagent hop — no inline artifact reads in the parent (Q4=B).

### G.4 — Escalation gate (three subtypes)

**Trigger**: One of:
- (a) `completed:validate` red / merge red after fixer runs and returns `{fixed: false, …}` (D.6).
- (b) `agent:error` / `failed:*` (D.7).
- (d) `waiting-for:merge-conflicts` (D.11).
- (c) Unrecognized / ambiguous state (D.10).

**Presentation** (in the same response as the `AskUserQuestion` call) — evidence formatted per subtype.

**(a) Validate-red / merge-red**:

```markdown
Fixer could not resolve <issue-ref> (PR <pr-ref>):

<fixer summary — the subagent's `summary` field>

Reason (from fixer): <fixer's `reason` field>

Failing checks: <check names>
```

**(b) `agent:error` / `failed:*`**:

```markdown
Agent error on <issue-ref>:

<evidence — bot-authored alert comment body from gh issue view --comments, or the failure trace>
```

**(d) Merge-conflicts**:

Initial presentation:

```markdown
Merge conflicts on <issue-ref>:

Conflicted paths (from engine pause alert):
- <path 1>
- <path 2>
- ...

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to run `generacy cockpit advance --gate merge-conflicts <issue-ref>`.
```

Re-presentation on non-zero CLI exit (Q3=A shape):

```markdown
Advance failed for <issue-ref>:

<CLI stderr verbatim, from `generacy cockpit advance --gate merge-conflicts <issue-ref>`>

Merge conflicts on <issue-ref>:

Conflicted paths (from engine pause alert):
- <path 1>
- <path 2>
- ...

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to run `generacy cockpit advance --gate merge-conflicts <issue-ref>`.
```

**(c) Unrecognized state**:

```markdown
Unrecognized state on <issue-ref>:

Observed: <raw state from cockpit status --json>

Streamed event: <original transition line>
```

**Gate invocation**: One `AskUserQuestion` call in the same response, with:
- **Question text**: `How to proceed on <issue-ref>?`
- **Header**: `Escalate` (≤ 12 chars)
- **Options** (subtype-specific, in the listed order):

  | Subtype | Options |
  |---------|---------|
  | (a) validate-red / merge-red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (b) agent:error / failed:* | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (d) merge-conflicts | `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (c) unrecognized state | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |

- **multiSelect**: `false`

**Post-gate mechanism sentences** (verbatim per Q3=D):
- `Retry` (subtype a only) → re-run the fixer subagent **once**. If `{fixed: true}`, loop back to D.5; if `{fixed: false}`, re-present the escalation gate.
- `Requeue` (subtype b only) → `generacy cockpit resume <issue-ref>` (Assumption A2). If verb missing, degrade to Skip with explicit ledger note.
- `I've resolved it — advance the gate` (subtype d only) → `generacy cockpit advance --gate merge-conflicts <issue-ref>`. On zero exit, ledger `advanced` and continue. On non-zero exit, re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block (see § D.11 dispatch step 3).
- `Skip` (all subtypes) → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.**
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**

### G.5 — Phase-queue confirmation gate

**Trigger**: D.8 (`phase-complete`).

**Presentation** (in the same response as the `AskUserQuestion` call):

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...
```

**Gate invocation**: One `AskUserQuestion` call in the same response, with:
- **Question text**: `Queue P<next> (<N> issues)?`
- **Header**: `QueueP<next>` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `Queue P<next> (<N> issues) (Recommended)` — call `cockpit queue`
  2. `Cancel` — do nothing (the phase-complete state persists)
- **multiSelect**: `false`

On `Queue`, the CLI verb is called with `--yes` — the gate itself is the confirmation.

## Ledger

**Format sentence** (verbatim):

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

or, using the mnemonic column names: `issue · transition · action · outcome`. The separator is the middle-dot ` · ` (U+00B7) with a single space on each side.

**Mandatory-per-dispatch rule** (#388 enforcement style, verbatim):

> A dispatch without a ledger line is a protocol violation.

**What counts as a "dispatch"**: any event line from `cockpit watch` that the parent processes (branches into the dispatch table); any event synthesized by the startup sweep; any escalation-gate retry that re-runs the fixer or re-presents the escalation gate; any session-mute skip.

**What does NOT count**: re-check calls that don't produce a dispatch decision; watch re-arms (spawning `cockpit watch` again after it dies); pre-flight failures (before the loop begins).

**Persistence rule (dual-write, unconditional)**:

Every ledger line is:
1. **Printed to the transcript** on its own line, prefixed with `[ledger] ` for visual scanning.
2. **Appended to the persistent file** at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`, one line per dispatch, in the exact `<issue-ref> · <transition-class> · <action> · <outcome>` format (no `[ledger] ` prefix in the file).

Write mechanism: `echo "<line>" >> .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` — one append per dispatch, no rewriting.

**Epic-ref-slug rule**: the epic reference with `/` replaced by `-` and `#` stripped (e.g., `christrudelpw/epic#42` → `christrudelpw-epic-42`).

**Timestamp format**: `YYYYMMDD-HHMMSS` in the operator's local time, captured at the start of the run (step 1).

**Idempotency rule (L.5 — startup sweep + live-state re-check)**: The startup sweep (step 3) + the live-state re-check (step 4a) guarantee that spawning `cockpit watch` twice on the same live state produces no duplicate action. Each synthetic event from the startup sweep produces its own ledger line, per the mandatory-per-dispatch rule. On watch re-arm (step 5), events streamed for state already dispatched are recognized as no-ops by the re-check step and dispatched only if the live state is still actionable.

### Action + outcome vocabulary (per dispatch row)

Stable strings per dispatch table row, so `grep` recipes on `<action>` / `<outcome>` are reliable.

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| D.1 clarification | `clarification-batch` | `advanced`, `posted <k>/<N>, skipped <s>`, `all answers skipped`, `error: <description>` |
| D.2 artifact-review | `review-analysis+advance` | `approved`, `advance failed`, `error: <description>` |
| D.2 artifact-review | `review-analysis+comment-review` | `request-changes (<count> findings)` |
| D.2 artifact-review | `review-analysis+abort` | `aborted` |
| D.3 implementation-review | (same as D.2) | (same as D.2) |
| D.4 manual-validation | `manual-validation-summary+advance` | `manually validated` |
| D.4 manual-validation | `manual-validation-summary+wait` | `not yet` |
| D.5 merge (green) | `merge` | `merged (PR #<n>)`, `blocked: missing-approval`, `blocked: draft`, `blocked: pending`, `blocked: missing-label`, `infrastructure failure — <checks>` |
| D.6 fixer | `fixer` | `fixed`, `unfixed → escalation` |
| D.6 fixer + escalation | `fixer+escalation-gate` | `retry`, `skip (session-local mute)`, `stop (exit)` |
| D.7 agent-error / failed | `escalation-gate` | `requeue (cockpit resume)`, `requeue failed: <description>`, `skip (session-local mute)`, `skip (cockpit resume unavailable — G-S8 prerequisite)`, `stop (exit)` |
| D.8 phase-complete | `phase-queue-gate` | `queued P<next> (<N> issues)`, `cancelled` |
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.9a pr-feedback | `(no-op)` | `server-side-owned` |
| D.9b children-complete | `(no-op)` | `server-side-owned` |
| D.9c dependencies | `(no-op)` | `server-side-owned` |
| D.11 merge-conflicts | `escalation-gate` | `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
| mute-set hit | `(muted)` | `skip (session-local mute active)` |

### L.6 — Run summary at exit

On `epic-complete` exit (step 6), print a run summary paragraph and include the persistent ledger file's absolute path:

```text
Auto run complete.

Epic: <epic-ref> · Exited: epic-complete
Events dispatched: <N>
  · Clarification batches: <k1>
  · Review verdicts: <k2>
  · Manual-validation gates: <k3>
  · Phase-queue confirmations: <k4>
  · Merges: <k5> (<green>/<red>, <fixer runs>)
  · Escalations: <k6>
Muted issues (session-local): <s>
Ledger file: <absolute path to .ledger file>
```

Counts are derived from the ledger file (or the in-memory count if the file is unavailable). Non-`epic-complete` exits (Stop from an escalation gate, pre-flight failure) print an abbreviated summary with the exit reason.

## Invariants

1. **Never merge on red.** `completed:validate` + green routes straight to `cockpit merge`; anything red routes through the bounded-fixer branch and, if still red, the escalation gate. The branch exits `0` only on `result: merged`.
2. **Cockpit comments marked.** Every comment the playbook posts to an issue or PR carries the `<!-- generacy-cockpit:… -->` prefix marker (e.g., `<!-- generacy-cockpit:clarification-answers -->`).
3. **Add-only advance.** `Skip` in every escalation gate is **session-local mute only** — labels are untouched, `cockpit advance` is never called with a fake-skip flag. A muted issue resurfaces in the next auto run's startup sweep.
4. **No cross-slash-command invocation** from `auto.md`. Cross-command composition is CLI verb (`generacy cockpit …`) + subagent boundary only. No `/cockpit:*`, `/code-review`, or `/speckit:*` invocation from the parent's execution path.
5. **Analysis in subagents** whose contracts end with the subagent — the #390 pattern. All four analysis workloads (clarification drafting, review verdict, manual-validation summary, bounded fixer) live inside `subagent_type: "general-purpose"` hops with strict-JSON returns.
6. **Autonomy *policy* out of scope.** Per-gate auto-approve and "full auto" mode are explicitly out of scope in v1. Every gate prompts; none auto-proceed.
7. **Stream consumption is unfiltered.** Every non-empty line from `cockpit watch` is an event; content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.

## Examples

### Example 1 — End-to-end run on a synthetic 2-phase epic

Command: `/cockpit:auto christrudelpw/epic#42`

Run shape:

1. **Startup sweep** — the parent calls `cockpit status --json christrudelpw/epic#42` and finds P1 has three actionable children: `#43` in `waiting-for:clarification`, `#44` in `waiting-for:implementation-review`, `#45` in `waiting-for:manual-validation`. Each is dispatched in order.
2. **D.1 for #43** — clarification drafter subagent → fused batch gate with N=3 questions (`ceil(3/4) = 1` `AskUserQuestion` call in one response) → all approved → post + `cockpit advance --gate clarification`.
   - Ledger: `christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · advanced`.
3. **D.3 for #44** — review analyzer subagent (`gh pr diff` inside the subagent) → zero findings → fused verdict gate with `Suggested decision: approve` → operator selects `approve` → `cockpit advance --gate implementation-review`.
   - Ledger: `christrudelpw/epic#44 · waiting-for:implementation-review · review-analysis+advance · approved`.
4. **D.4 for #45** — manual-validation summarizer subagent → confirm gate (scenarios + acceptance_checks) → operator selects `manually validated` → `cockpit advance --gate manual-validation`.
   - Ledger: `christrudelpw/epic#45 · waiting-for:manual-validation · manual-validation-summary+advance · manually validated`.
5. **Main loop begins** — the watcher streams `christrudelpw/epic#44 · completed:validate` (checks all green).
6. **D.5 for #44** — `cockpit merge` → `result: merged` → PR #<n> merged (squash, branch delete).
   - Ledger: `christrudelpw/epic#44 · completed:validate · merge · merged (PR #46)`.
7. Similar for #43, #45.
8. Watcher streams `christrudelpw/epic#42 · phase-complete`.
9. **D.8 phase-queue confirmation** — presentation shows P2 with 4 issues → operator selects `Queue P2 (4 issues)` → `cockpit queue christrudelpw/epic#42 P2 --yes`.
   - Ledger: `christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (4 issues)`.
10. P2 runs to completion the same way.
11. Watcher streams `christrudelpw/epic#42 · epic-complete`.
12. **Exit** — parent kills the watch process, prints the run summary per L.6 with the ledger file's absolute path, exits zero.

### Example 2 — Clarification batch gate with N=6 open questions

Trigger: D.1 for `christrudelpw/epic#43` with 6 open clarifications.

The subagent returns 6 drafted answers in one JSON array. The parent renders:

```markdown
Drafted answers for christrudelpw/epic#43 (6 open questions):

### Q1: What auth mode?
<drafted answer>
_provenance: spec.md § Auth_

### Q2: Timeout policy?
<drafted answer>
_provenance: plan.md § Timeouts_

... (Q3 through Q6)
```

Then, **in the same assistant response**, `ceil(6/4) = 2` `AskUserQuestion` calls fanned out:

- **Call 1**: 4 questions (Q1–Q4), each with options `Approve draft (Recommended)` / `Skip this question`, headers `Q1`, `Q2`, `Q3`, `Q4`.
- **Call 2**: 2 questions (Q5–Q6), same options, headers `Q5`, `Q6`.

Operator responses (illustrative): Q1 approved, Q2 approved, Q3 skipped, Q4 approved, Q5 selected "Other" and typed a replacement answer, Q6 skipped.

Post-gate: post the assembled comment with Q1/Q2/Q4/Q5 (5 answers, Q5 with the edited body); do not advance (2 skipped).

Ledger: `christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · posted 4/6, skipped 2`.

### Example 3 — Validate-red with fixer that returns unfixed, followed by G.4a Retry

Trigger: `christrudelpw/epic#44` enters `completed:validate` with `checks_state: "red"` (one failing test in `packages/foo/tests/bar.test.ts`).

Flow:

1. **D.6** — classify checks (test failure, repo-owned CI class ✓), spawn bounded fixer subagent.
2. Fixer returns:
   ```json
   {"fixed": false, "summary": "attempted to fix bar.test.ts assertion; the underlying failure is a race between two callbacks that requires a design decision on ordering guarantees", "reason": "ambiguous root cause — design judgment required"}
   ```
3. Ledger: `christrudelpw/epic#44 · completed:validate:red · fixer · unfixed → escalation`.
4. **G.4a escalation gate** presentation:
   ```markdown
   Fixer could not resolve christrudelpw/epic#44 (PR christrudelpw/repo#46):

   attempted to fix bar.test.ts assertion; the underlying failure is a race between two callbacks that requires a design decision on ordering guarantees

   Reason (from fixer): ambiguous root cause — design judgment required

   Failing checks: test:bar
   ```
   Single `AskUserQuestion` with options `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
5. Operator selects `Retry`. Fixer re-runs once (new dispatch, new ledger line).
6. Ledger: `christrudelpw/epic#44 · completed:validate:red · fixer+escalation-gate · retry`.

### Example 4 — `agent:error` with G.4b Requeue → `cockpit resume`

Trigger: `christrudelpw/epic#47` enters `agent:error` (bot-authored alert comment posted with failure trace per #865's shape).

Flow:

1. **D.7** — fetch evidence via `gh issue view christrudelpw/epic#47 --comments --json comments`.
2. **G.4b escalation gate** presentation:
   ```markdown
   Agent error on christrudelpw/epic#47:

   Runner reported: process exited 137 after 90s (OOM). Retry may succeed on a fresh runner.
   ```
   Single `AskUserQuestion` with options `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`.
3. Operator selects `Requeue`.
4. Parent calls `generacy cockpit resume christrudelpw/epic#47`.
5. Ledger: `christrudelpw/epic#47 · agent:error · escalation-gate · requeue (cockpit resume)`.

If `cockpit resume` were not available (G-S8 didn't ship the verb, per Assumption A2), Requeue would degrade to Skip with an explicit ledger note: `christrudelpw/epic#47 · agent:error · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->
