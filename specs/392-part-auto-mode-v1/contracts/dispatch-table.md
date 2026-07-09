# Contract: Dispatch Table

**Feature**: 392-part-auto-mode-v1
**Target**: `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch

This contract defines the nine-row event → action mapping that `auto.md` inlines verbatim in the `## Dispatch` block. The table is the transport contract with the S8 event stream — every event class the auto command handles is enumerated here, with the exact CLI verb / subagent hop / gate invocation the parent runs in response.

The mapping is **inlined verbatim** in `auto.md` per spec § Dispatch and the self-contained-commands principle. This contract file is the design-time source of truth; the playbook is the runtime source of truth.

---

## D.0 — Scope

Applies to the nine event classes emitted by `generacy cockpit watch <epic-ref>` per S8's transition-stream contract. Additional event classes S8 may add later are handled by the fallback row (D.9 — unrecognized / ambiguous state).

The parent **always** re-checks live state via `cockpit status --json` before dispatching (spec § Loop). The streamed event is advisory; the live state is authoritative. Rows below assume the re-check has confirmed the streamed transition class.

---

## D.1 — `waiting-for:clarification`

**Trigger**: An issue enters `waiting-for:clarification` (open clarification questions posted, awaiting operator-authored answers).

**Dispatch**:
1. **Fetch context**: `generacy cockpit context <issue-ref>` (same verb used by `/cockpit:clarify` — the renamed successor to `clarify-context`).
2. **Spawn clarification drafter subagent** (see [subagent-boundaries.md](./subagent-boundaries.md) § SB.1). Prompt carries the fetched context (open questions + spec/plan/touched-files context). Returns an array of `{question_id, drafted_answer, provenance}` or `{"error": …}`.
3. **Present fused batch gate** (see [gate-contract.md](./gate-contract.md) § G.1). In one assistant response: presentation block (each drafted answer numbered with provenance) + `ceil(N/4)` `AskUserQuestion` calls, one question per clarification, options `Approve draft (Recommended)` / `Skip this question`. Built-in "Other" free-text = edit path.
4. **Assemble comment body**: byte-exact per `/cockpit:clarify`'s convention (`<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per approved / edited answer). Write to `/tmp/cockpit-auto-clarify-<issue>-<unix_ts>.md`. Post via `gh issue comment "$ISSUE" --body-file <tmpfile>`. Use `--body-file` exclusively (never `-b` / `--body` — shell quoting risks stripping the marker).
5. **Advance gate**: If every open question received an approved (or edited) answer, run `generacy cockpit advance --gate clarification <issue-ref>`. If some were skipped, do not advance — write a ledger line noting the partial state and continue the loop.

**Ledger line**: `<issue-ref> · waiting-for:clarification · clarification-batch · posted <k>/<N>, skipped <s>` (or `advanced` on step 5 success).

**Failure modes**:
- Subagent returns `{"error": …}` → route to Error handling class `OTHER`; do not post; do not advance; write ledger line noting the error.
- All answers skipped → do not post; do not advance; write ledger line `all answers skipped; no comment posted`.
- Post fails → route to Error handling; write ledger line noting the failure (comment stays live if partially posted — do not attempt retraction).
- Advance fails → route to Error handling; write ledger line noting the failure.

---

## D.2 — `waiting-for:<artifact>-review`

**Trigger**: An issue enters one of `waiting-for:spec-review`, `waiting-for:clarification-review`, `waiting-for:plan-review`, `waiting-for:tasks-review`.

**Dispatch**:
1. **Resolve target artifact** — parse `<artifact>` from the transition class; identify the file to review (e.g., `specs/<issue-slug>/spec.md`).
2. **Spawn review-verdict analyzer subagent** (see [subagent-boundaries.md](./subagent-boundaries.md) § SB.2). Prompt carries the issue ref + gate name; subagent reads the artifact + surrounding context and returns findings array `[{file, line, summary, failure_scenario}, ...]`, `[]`, or `{"error": …}`.
3. **Present fused verdict gate** (see [gate-contract.md](./gate-contract.md) § G.2). In one assistant response: findings-summary table (per #388's C.3.5 shape) + `Suggested decision:` line + single `AskUserQuestion` with options `approve` / `request-changes` / `abort`.
4. **Apply verdict**:
   - `approve` → `generacy cockpit advance --gate <gate-name> <issue-ref>`.
   - `request-changes` → post a `COMMENT` review with per-finding inline threads (each finding becomes a `Comment` on `file:line` with body `<summary> — <failure_scenario>`); the server-side feedback loop owns the rest — no `advance` call.
   - `abort` → do nothing (no post, no advance); write ledger line noting the abort.

**Ledger line**: `<issue-ref> · waiting-for:<artifact>-review · review-analysis+<verdict> · <outcome>`.

**Failure modes**: same as #388/#390 — `[]` still prompts the gate (assist-mode contract preserved); `{"error": …}` routes to Error handling class `OTHER`; parse failure or other-shape return routes to Error handling with the raw return quoted.

---

## D.3 — `waiting-for:implementation-review`

**Trigger**: A PR enters `waiting-for:implementation-review` (PR opened, tests passing, awaiting code review).

**Dispatch**:
1. **Resolve PR** — from `cockpit status --json`, get the issue's associated PR ref (`<owner>/<repo>#<n>`).
2. **Spawn review-verdict analyzer subagent** (see [subagent-boundaries.md](./subagent-boundaries.md) § SB.2 — same subagent as D.2, invoked with `<owner>/<repo>#<pr-n>` as the scope). Uses the exact #390 contract: `subagent_type: "general-purpose"`, prompt carries only the PR reference, subagent fetches its own diff via `gh pr diff`, returns strict JSON per SB.2.
3. **Present fused verdict gate** — same as D.2.
4. **Apply verdict** — same as D.2.

**Ledger line**: `<issue-ref> · waiting-for:implementation-review · review-analysis+<verdict> · <outcome>`.

**Note**: D.3 is structurally identical to D.2; the only difference is the scope passed to the subagent (an artifact file vs. a PR reference). Both use the #390 contract.

---

## D.4 — `waiting-for:manual-validation`

**Trigger**: An issue enters `waiting-for:manual-validation` (implementation approved, awaiting manual smoke test).

**Dispatch**:
1. **Spawn manual-validation summarizer subagent** (see [subagent-boundaries.md](./subagent-boundaries.md) § SB.3). Prompt carries the issue ref + PR ref. Subagent reads spec §Success Criteria + issue acceptance criteria + PR title/body and returns `{scenarios: [...], acceptance_checks: [...]}` or `{"error": …}`.
2. **Present manual-validation gate** (see [gate-contract.md](./gate-contract.md) § G.3). In one assistant response: scenarios + acceptance_checks rendered as bullet lists + single `AskUserQuestion` with options `manually validated` / `not yet`.
3. **Apply verdict**:
   - `manually validated` → `generacy cockpit advance --gate manual-validation <issue-ref>`.
   - `not yet` → do nothing (write ledger line and continue; the label stays, the event will re-fire when the operator confirms later or takes another action).

**Ledger line**: `<issue-ref> · waiting-for:manual-validation · manual-validation-summary+<verdict> · <outcome>`.

**Failure modes**: `{"error": …}` from the summarizer → route to Error handling class `OTHER`; write ledger line.

---

## D.5 — `completed:validate` (checks green) → **merge without gate**

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green.

**Dispatch**:
1. **Confirm state via `cockpit status --json`** — verify `checks_state == "green"` and no infrastructure/runner failures. (The re-check is essential here — a `completed:validate` streamed event with red-live-state falls through to D.6.)
2. **Merge**: `generacy cockpit merge <pr-ref>` (squash, branch delete per the CLI's default).
3. **No gate**: The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt.

**Ledger line**: `<issue-ref> · completed:validate · merge · merged (PR #<n>)`.

**Failure modes**:
- `cockpit merge` returns `result: "red"` → fall through to D.6 (fixer branch).
- `cockpit merge` returns `result: "blocked"` → route to appropriate `blocked` handling per `merge.md`'s existing decision tree (missing-label / missing-approval / draft / pending). For `pending`, defer to the watcher (do not poll — spec § Invariants). For other blocked reasons, write ledger line and continue.
- Infrastructure/runner failure → do not burn a fixer attempt; write ledger line `Stopped: infrastructure failure — <check names>` and continue.

**Invariant coupling**: Never merge on red (spec § Invariants §1) — the branch exists here strictly on the `result: "merged"` outcome.

---

## D.6 — `completed:validate` (red) / merge red → **bounded fixer subagent**

**Trigger**: `completed:validate` with `checks_state == "red"` OR a `cockpit merge` call in D.5 returned `result: "red"`.

**Dispatch**:
1. **Classify failing checks** — infrastructure/runner failures abort without burning an attempt (per `merge.md` § step 6.1). Repo-owned CI classes only (tests / lint / typecheck / build).
2. **Spawn bounded fixer subagent** (see [subagent-boundaries.md](./subagent-boundaries.md) § SB.4). Prompt is outcome-scoped ("make this specific red green; no refactors, no feature work, no scope expansion; if it needs design judgment, stop and return an explanation"). Subagent returns `{fixed: bool, summary, reason?}`.
3. **Re-evaluate**:
   - `fixed: true` → loop back to D.5 (re-run `cockpit merge`; the re-check step catches whether the fix actually turned the checks green).
   - `fixed: false` → present escalation gate (see [gate-contract.md](./gate-contract.md) § G.4). Options: `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
4. **Apply escalation verdict**:
   - `Retry` → re-run the fixer subagent once (operator-approved single re-run; the gate is the bound).
   - `Skip` → add `<issue-ref>` to the session mute set; write ledger line; continue loop (labels untouched).
   - `Stop` → kill watch process; print run summary; exit auto cleanly.

**Ledger line (successful fix)**: `<issue-ref> · completed:validate:red · fixer · fixed`.
**Ledger line (escalation)**: `<issue-ref> · completed:validate:red · fixer+escalation-gate · <retry|skip|stop>`.

**Invariant coupling**: The fixer runs **once autonomously** per red event (FR-012 reworded, not contradicted). Each further run requires the escalation gate. Bounded by outcome scope (Q1=D refined), not file scope.

---

## D.7 — `agent:error` / `failed:*` → **escalation gate (Requeue path)**

**Trigger**: An issue enters `agent:error` or any `failed:*` state.

**Dispatch**:
1. **Fetch evidence** — read the alert content per #865's shape (bot-authored comment on the issue with the failure evidence). Use `gh issue view <issue-ref> --comments --json comments -q '.comments[]'` or equivalent.
2. **Present escalation gate** (see [gate-contract.md](./gate-contract.md) § G.4). Presentation block includes the evidence (last N lines of the failure trace, or the alert comment body). Single `AskUserQuestion` with options `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`.
3. **Apply verdict**:
   - `Requeue` → `generacy cockpit resume <issue-ref>` (new engine verb per Assumption A2 — clears `agent:error` / `failed:*`, restores the phase's `waiting-for:` / `completed:` resume pair).
   - `Skip` → add `<issue-ref>` to session mute set; write ledger line; continue.
   - `Stop` → kill watch; print summary; exit.

**Ledger line**: `<issue-ref> · <agent:error | failed:<subtype>> · escalation-gate · <requeue|skip|stop>`.

**Failure modes**:
- `cockpit resume` doesn't exist yet (G-S8 didn't ship the verb) → Requeue degrades to Skip with an explicit ledger note: `<issue-ref> · <transition> · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.
- `cockpit resume` returns non-zero → route to Error handling class `OTHER`; write ledger line noting the failure; leave the issue in its failed state (do not retry the verb automatically).

**Invariant coupling**: Never guess. The escalation gate is the surface; no automated recovery from failure states.

---

## D.8 — `phase-complete` → **phase-queue confirmation gate**

**Trigger**: A phase completes (all its issues reached terminal states). S8 emits `phase-complete` when the epic's next phase is ready to queue.

**Dispatch**:
1. **Compute next phase scope** — from `cockpit status --json`, identify the next phase (P<next>) and its N issues.
2. **Present phase-queue gate** (see [gate-contract.md](./gate-contract.md) § G.5). Presentation block: `Queue P<next> with N issues?` + issue list (one per line, with title). Single `AskUserQuestion` with options `Queue P<next> (<N> issues) (Recommended)` / `Cancel`.
3. **Apply verdict**:
   - `Queue P<next>` → `generacy cockpit queue <epic-ref> P<next> --yes` (uses the `--yes` flag to skip the CLI's own confirmation — the operator has already confirmed via the gate).
   - `Cancel` → write ledger line noting the cancellation; continue loop (the phase-complete state persists; the operator can re-trigger by another event or a follow-up run).

**Ledger line**: `<issue-ref> · phase-complete · phase-queue-gate · <queued P<next> (<N> issues) | cancelled>`.

**Note**: The gate applies to the *epic*, not an issue — the `<issue-ref>` in the ledger line is the epic reference (or the phase-complete event's own ref, per S8's convention).

---

## D.9 — `waiting-for:address-pr-feedback` → **ledger only**

**Trigger**: An issue enters `waiting-for:address-pr-feedback` (server-side detected reviewer feedback on the PR, addressed-by state pending).

**Dispatch**: **Ledger line only.** The server-side owns this state; the plugin has no local action to take.

**Ledger line**: `<issue-ref> · waiting-for:address-pr-feedback · (no-op) · server-side-owned`.

**Rationale**: `waiting-for:address-pr-feedback` is a **server-owned** transition — the auto command has no local information to add. The ledger line accounts for the event (per SC-002); the loop continues.

---

## D.10 — Unrecognized / ambiguous state → **escalation gate (Skip / Stop only)**

**Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape.

**Dispatch**:
1. **Present escalation gate** (see [gate-contract.md](./gate-contract.md) § G.4 — unrecognized subtype). Presentation block includes the observed state (verbatim from `cockpit status --json`). Single `AskUserQuestion` with options `Skip (session-local mute) (Recommended)` / `Stop (exit auto)`. **No Retry** (nothing to retry — we don't know what to do).
2. **Apply verdict**:
   - `Skip` → add `<issue-ref>` to session mute set; write ledger line; continue.
   - `Stop` → kill watch; print summary; exit.

**Ledger line**: `<issue-ref> · <observed-state> · unrecognized-state · <skip|stop>`.

**Invariant coupling**: Never guess (spec § Dispatch fallback row).

---

## Dispatch table — summary form (inlined in `auto.md`)

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
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |

---

## Contract invariants

- **DC.1**. Every event class from spec § Dispatch appears as a row in `auto.md`'s § Dispatch block, verbatim.
- **DC.2**. Every dispatch row's action shape is composed of: **CLI verb** + **optional subagent** + **optional gate**. No dispatch row invokes a `/cockpit:*` slash command (invariant §4).
- **DC.3**. Every dispatch row that reaches a terminal outcome writes exactly one ledger line (per data-model.md § 2.5 and #388 enforcement-style).
- **DC.4**. The merge dispatch (D.5) has no gate (spec § Dispatch: "validate/checks are mechanical").
- **DC.5**. The fixer dispatch (D.6) runs the fixer at most **once autonomously**; further runs require the escalation gate's Retry action (Q1=D refined + Q3=D).
- **DC.6**. Skip in every escalation gate is session-local mute only (Q3=D + invariant §3). No dispatch row calls `cockpit advance` with a fake-skip flag.
- **DC.7**. Requeue (D.7) calls `generacy cockpit resume <issue-ref>` — the new engine verb per Assumption A2. If the verb is not available, Requeue degrades to Skip with an explicit ledger note.
- **DC.8**. The unrecognized-state row (D.10) never offers Retry (spec § Dispatch: "never guess").
- **DC.9**. The `waiting-for:address-pr-feedback` row (D.9) writes a ledger line only — no CLI verb, no subagent, no gate.
- **DC.10**. Every subagent invocation uses `subagent_type: "general-purpose"` unconditionally (invariant §5 + #390 R3).
