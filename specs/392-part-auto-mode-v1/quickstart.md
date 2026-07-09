# Quickstart: `/cockpit:auto <epic-ref>` (A-S9)

**Feature**: 392-part-auto-mode-v1

This runbook shows how to (i) install and invoke the new `/cockpit:auto` command, (ii) verify the change locally with static and behavioral checks, and (iii) troubleshoot the most likely regression patterns.

---

## What changed

A new seventh cockpit slash command was added:

- `packages/claude-plugin-cockpit/commands/auto.md` — the new `/cockpit:auto <epic-ref>` playbook.
- `packages/claude-plugin-cockpit/README.md` — one row added to the § Available Commands table.

**No sibling playbook edits.** The six S6 assist commands (`clarify`, `merge`, `queue`, `review`, `status`, `watch`) are byte-identical on this branch.

**Command shape**:

```bash
/cockpit:auto <epic-ref>
```

The command drives the named epic to `epic-complete` by:
1. Spawning `generacy cockpit watch <epic-ref>` in the background.
2. For each state transition, re-checking live state (`cockpit status --json`) and dispatching to one of nine transition handlers (see [contracts/dispatch-table.md](./contracts/dispatch-table.md)).
3. Prompting the operator via one of five gate types (see [contracts/gate-contract.md](./contracts/gate-contract.md)) — clarification batches, review verdicts, manual-validation confirms, phase-queue confirmations, red/error escalations.
4. Writing a mandatory ledger line per dispatched event to both the transcript and `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`.
5. Exiting cleanly on `epic-complete` with a run summary.

**Invariants** (spec § Invariants):
- Never merge on red.
- Cockpit comments marked (`<!-- generacy-cockpit:… -->`).
- Add-only advance (Skip is session-local mute, never label writes).
- No cross-slash-command invocation from `auto.md` (uses CLI verbs + subagents).
- Analysis in subagents whose contracts end with the subagent (#390 pattern).
- Autonomy policy (per-gate auto-approve, "full auto") explicitly out of scope.

---

## Installation

The command ships in the `claude-plugin-cockpit` package on the same npm + marketplace rails as the six existing cockpit commands. To pick up the new command:

**Cluster (zero-step, once G-S8 + A-S9 have both shipped)**:
```bash
# Cluster setup runs `generacy setup build`, which copies commands/ into ~/.claude/commands/cockpit/
# The /cockpit:auto command resolves in a fresh Claude Code session with no manual steps.
```

**Standalone**:
```bash
cd /workspaces/agency
pnpm install
pnpm build
# Install the plugin per README § Installation.
# Restart your Claude Code session (or re-source the plugin config) so the updated playbook is loaded.
```

**Runtime dependencies** (same as the six S6 commands):
- `generacy` CLI (`npm install -g @generacy-ai/generacy` or the cluster-provided binary). Must include the new `cockpit resume <issue-ref>` verb (per Assumption A2 — added to G-S8's scope).
- `gh` CLI, authenticated via `gh auth login`.

**Hard prerequisite (per Assumption A2)**: G-S8 must ship `generacy cockpit resume <issue-ref>`. If the verb is unavailable at auto's ship time, the `Requeue` escalation action degrades to `Skip` with an explicit ledger note; the command remains functional but cannot auto-recover from `agent:error` / `failed:*` states without operator label surgery.

---

## Usage

**Basic invocation** (drives an epic to `epic-complete`):

```bash
/cockpit:auto <owner>/<repo>#<n>
```

Example:
```bash
/cockpit:auto christrudelpw/epic#42
```

**What you'll see** (interactive):

- **Startup** — a one-line pre-flight confirmation, then a startup-sweep summary (any actionable state already live on the epic).
- **Per event** — a one-line ledger entry (transcript print, prefixed with `[ledger] `), and optionally:
  - A **clarification batch gate** — drafts numbered with provenance, then `ceil(N/4)` per-question prompts (approve / skip / edit via "Other" free-text).
  - A **review verdict gate** — findings-summary table + `approve` / `request-changes` / `abort` prompt.
  - A **manual-validation gate** — scenarios + acceptance-checks lists + `manually validated` / `not yet` prompt.
  - A **phase-queue gate** — next-phase issue list + `Queue P<next>` / `Cancel` prompt.
  - An **escalation gate** — evidence + one of `Retry / Skip / Stop`, `Requeue / Skip / Stop`, or `Skip / Stop` (per subtype).
- **Exit** — on `epic-complete`, a run summary paragraph with counts per gate class and the ledger file's absolute path.

**Ledger file** — persists at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` in the operator's cwd (must be a writable git repo). One line per dispatched event, in the format:

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

Example ledger contents (excerpt):

```text
christrudelpw/epic#42 · waiting-for:clarification · clarification-batch · posted 4/6, skipped 2
christrudelpw/epic#42 · waiting-for:implementation-review · review-analysis+advance · approved
christrudelpw/epic#42 · completed:validate · merge · merged (PR #43)
christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (5 issues)
```

**Interrupt / resume** — the command can be `Ctrl-C`d at any time. The ledger file preserves the run's history; re-running `/cockpit:auto <epic-ref>` picks up from the current live state via the startup sweep (each still-actionable transition class is dispatched fresh).

---

## Verification — static checks

Run these greps against the target files after implementation (from repo root):

```bash
AUTO=packages/claude-plugin-cockpit/commands/auto.md
README=packages/claude-plugin-cockpit/README.md

# File presence
test -f "$AUTO" && echo "OK: auto.md present" || echo "FAIL: auto.md missing"

# Dispatch table — all nine event classes present (verbatim)
for event in \
  "waiting-for:clarification" \
  "waiting-for:.*-review" \
  "waiting-for:implementation-review" \
  "waiting-for:manual-validation" \
  "completed:validate" \
  "agent:error" \
  "failed:" \
  "phase-complete" \
  "waiting-for:address-pr-feedback"; do
  grep -c "$event" "$AUTO" > /dev/null && echo "OK: $event" || echo "FAIL: $event missing"
done

# Invariants block — all six invariants
for phrase in \
  "Never merge on red" \
  "cockpit comments marked\|generacy-cockpit:" \
  "add-only advance" \
  "no cross-slash-command invocation" \
  "analysis in subagents" \
  "autonomy .*out of scope"; do
  grep -c -i "$phrase" "$AUTO" > /dev/null && echo "OK: invariant '$phrase'" || echo "FAIL: invariant '$phrase' missing"
done

# Ledger line format
grep -c "issue · transition · action · outcome\|<issue-ref> · <transition" "$AUTO"
# Expected: >= 1

# Mandatory-per-dispatch rule (#388 enforcement style)
grep -c "dispatch without a ledger line is a protocol violation" "$AUTO"
# Expected: >= 1

# Ledger persistence path
grep -c "\.generacy/cockpit/auto-runs/" "$AUTO"
# Expected: >= 1

# Subagent invocation directives — all four hops
for hop in \
  "clarification drafter\|clarification-drafter\|drafts.*subagent" \
  "review-verdict\|review analyzer\|review analysis subagent" \
  "manual-validation summarizer\|manual-validation subagent" \
  "bounded fixer\|fixer subagent"; do
  grep -c -i "$hop" "$AUTO" > /dev/null && echo "OK: subagent '$hop'" || echo "FAIL: subagent '$hop' missing"
done

# subagent_type: "general-purpose" fixed per #390
grep -c 'subagent_type: "general-purpose"' "$AUTO"
# Expected: >= 4 (once per subagent hop, or once with reference to all four)

# Fixer structured verdict schema
grep -c "fixed:.*bool\|{fixed, summary, reason\|fixed.*summary.*reason" "$AUTO"
# Expected: >= 1

# Fused clarification batch gate rule (ceil(N/4), no explicit Edit option)
grep -c "ceil(N/4)\|N/4" "$AUTO"
# Expected: >= 1
grep -c "Approve draft.*Recommended\|Skip this question" "$AUTO"
# Expected: >= 1 each

# Retained MUST NOT print raw JSON clause (from #388 / #390)
grep -c "MUST NOT print raw JSON" "$AUTO"
# Expected: >= 1

# README table row for /cockpit:auto
grep -c '/cockpit:auto' "$README"
# Expected: >= 1 (the new row)

# README overview paragraph unchanged (#390 amendment)
grep -c "no cross-slash-command invocation" "$README"
# Expected: exactly 1 (unchanged)

# Sibling playbooks — byte-identical
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/merge.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/review.md \
  packages/claude-plugin-cockpit/commands/status.md \
  packages/claude-plugin-cockpit/commands/watch.md
# Expected: empty (no changes).
```

---

## Verification — behavioral check (one end-to-end run)

Per SC-002 and spec § Acceptance, run one end-to-end auto invocation on a synthetic 2-phase epic:

1. **Prepare a test epic** — a small epic with 2 phases, each with 1-2 child issues. Ideally the issues cover:
   - At least one child with open clarification questions (to exercise G.1).
   - At least one child that will produce implementation-review findings (to exercise G.2).
   - At least one child with `waiting-for:manual-validation` (to exercise G.3).
   - At least one PR that will pass validation on merge (to exercise D.5 without the fixer path).

2. **Invoke** `/cockpit:auto <test-epic-ref>` in a fresh Claude Code session.

3. **Confirm**:
   - The startup-sweep summary lists any actionable state already live.
   - Each gate class fires exactly as [contracts/gate-contract.md](./contracts/gate-contract.md) specifies (single response with presentation + `AskUserQuestion` — no two-turn splits).
   - Each dispatched event produces exactly one ledger line (transcript print + append to `.generacy/cockpit/auto-runs/*.ledger`).
   - The exit summary matches [contracts/ledger-line.md](./contracts/ledger-line.md) § L.6 shape and includes the ledger file's absolute path.
   - The ledger file, grepped for the epic-ref, shows every dispatched event as a line.

**Failure mode**: If the parent's response for any gate contains fewer than the expected `AskUserQuestion` count in one response (e.g., the clarification batch gate for N=5 issues one call in one turn and the second call in a follow-up turn), the fusion rule was violated. Re-check the static greps for `ceil(N/4)` and revisit the playbook prose.

**Note on epistemics**: One passing end-to-end run is evidence, not proof. Adherence is probabilistic — the design removes the class of drift by construction (thin parent loop, analysis in subagents, fused gates, mandatory ledger), but confirmation is empirical. Continued live `/cockpit:auto` usage on the smoke-test corpus is the true verifier (same layering as #384 / #388 / #390).

---

## Available commands (post-#392)

| Command | Description |
|---------|-------------|
| `/cockpit:watch` | Stream `generacy cockpit watch <epic-ref>` and suggest the next `/cockpit:*` verb per transition |
| `/cockpit:status` | Render `generacy cockpit status <epic-ref>` output for an epic and its children |
| `/cockpit:queue` | Confirm-gated wrapper over `generacy cockpit queue <phase>` |
| `/cockpit:clarify` | Draft grounded answers for an epic's open clarifications, approve per-question, post, and advance the gate |
| `/cockpit:review` | Review a speckit gate (artifact or implementation) and advance on approval |
| `/cockpit:merge` | Merge a PR via `generacy cockpit merge`; on red, spawn a bounded fixer subagent and re-evaluate |
| `/cockpit:auto` | **NEW** — Drive an epic to `epic-complete` — watch transitions, dispatch through CLI verbs + subagents, gate on judgment surfaces. Never merges on red; every gate prompts (no auto-approve). |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `MISSING_BINARY: generacy CLI not on $PATH` | Runtime dependency missing | Follow README § Installation to install `@generacy-ai/generacy`; in cluster sessions, add `/shared-packages/node_modules/.bin` to `$PATH` per the error message. |
| `cockpit resume: command not found` on Requeue | G-S8 didn't ship the new verb (per Assumption A2) | Requeue should degrade to Skip with an explicit ledger note. If the degradation didn't happen, the playbook needs to be updated to handle the missing-verb case. Escalate to generacy#885. |
| Ledger file not created | `mkdir -p .generacy/cockpit/auto-runs` failed (permissions, non-git cwd) | Verify the operator's cwd is a writable git repo; check permissions on `.generacy/`. Pre-flight should catch this before the loop starts. |
| `AskUserQuestion` prompt fires with an unexpected option set | Playbook prose diverged from [contracts/gate-contract.md](./contracts/gate-contract.md) | Re-check the gate-contract greps in "Verification — static checks" above. Each gate's option set is contract-specified verbatim. |
| Two `AskUserQuestion` calls in separate turns for one dispatched event | Fusion rule violation (#388 turn-split re-introduced) | Confirm `ceil(N/4)` prose in the clarification batch section; confirm single-`AskUserQuestion` prose in the other gate sections; confirm the presentation and prompt are in the same assistant response. |
| Free-form review analysis prose in the parent's turn | Subagent boundary violation (#390 AP-8 or the extension to auto) | Confirm SB.0.6 — no subagent prompt invokes a slash command. Confirm each subagent uses `subagent_type: "general-purpose"` and returns strict JSON per its return schema. |
| Raw JSON printed in the parent's turn | Retained `MUST NOT print raw JSON` clause was removed or misplaced | Re-add the clause inline immediately before the findings-summary table rendering in D.2 / D.3. |
| Skip action wrote a label (advanced the gate with a fake `--skip` flag) | Invariant §3 (add-only advance) violation | The escalation-gate Skip must be session-local mute only. Fix: remove any `cockpit advance --skip` (or equivalent) call from the playbook; Skip should only add to the in-memory mute set and write a ledger line. |
| Fixer subagent runs multiple times without operator approval | Q1=D refined + Q3=D violation ("runs once" autonomously) | Confirm the retry mechanic requires the escalation gate's Retry action. Each retry is a new dispatched event with its own ledger line. |
| Fixer makes changes outside the failing check's outcome | Q1=D refined violation (outcome-scoping) | Confirm the fixer prompt states "no refactors, no feature work, no scope expansion" verbatim. If drift happens anyway, the outcome scope needs strengthening in the prompt. |
| Manual-validation gate fires with inline artifact reads (spec.md content, PR body, issue body in the parent's turn) | Q4=B violation (subagent hop skipped) | Confirm SB.3 is invoked in D.4; the parent should only render the structured `{scenarios, acceptance_checks}` return. |
| Loop context bloats across a two-phase run (context-window pressure) | Decay countermeasures failing — inline reads leaking into the parent | Re-check every dispatched analysis path is in a subagent (SB.1–SB.4). The parent's job is dispatch + gate + ledger, not analysis. |
| Watch process dies and doesn't re-arm | Step 5 (watch re-arm) not implemented or broken | Confirm the playbook's step 5 detects `cockpit watch` exit and re-spawns via `Bash` `run_in_background: true`. The startup sweep + live-state re-check pair make the re-arm idempotent. |
| Sibling playbook (`clarify.md`, `merge.md`, etc.) shows a diff on this branch | Scope leak — invariant §5 spirit + FI-2 violation | Restore the sibling from `origin/develop`: `git checkout origin/develop -- packages/claude-plugin-cockpit/commands/<file>.md`. |
| README overview paragraph shows a diff on this branch | Scope leak — RI-2 violation | Restore the overview paragraph; only the § Available Commands table should have changed (one new row). |
| Ledger file has zero lines despite dispatched events | Mandatory-per-dispatch rule violation (LC.1) | Every dispatch in the playbook must call the ledger-write step. Grep the playbook for the ledger write; every dispatch branch should have one. |
| Muted issues persist across auto runs | Session-local mute violated — mute was persisted somewhere | Confirm the mute set is in-memory only; no file writes, no label writes. Muted issues resurfacing on the next auto run is the correct behavior. |

---

## Related documents

- [spec.md](./spec.md) — the specification.
- [clarifications.md](./clarifications.md) — Q1–Q5 with resolved answers.
- [plan.md](./plan.md) — this feature's implementation plan.
- [research.md](./research.md) — design decisions and rationale.
- [data-model.md](./data-model.md) — playbook structural model, runtime data shapes, README addition.
- [contracts/dispatch-table.md](./contracts/dispatch-table.md) — nine-row event → action mapping.
- [contracts/gate-contract.md](./contracts/gate-contract.md) — four gate types + response shapes.
- [contracts/ledger-line.md](./contracts/ledger-line.md) — one-line format + dual-write persistence rule.
- [contracts/subagent-boundaries.md](./contracts/subagent-boundaries.md) — four analysis subagent boundaries + return schemas.

Prior features in the gate-adherence family (each closes a class of failure this command inherits):
- [specs/384-found-during-cockpit-v1/](../384-found-during-cockpit-v1/) — Terminal Outcome Check (positional guarantee).
- [specs/388-found-during-cockpit-v1/](../388-found-during-cockpit-v1/) — Fused analysis + `AskUserQuestion` (structural guarantee inside the parent turn).
- [specs/390-found-during-cockpit-v1/](../390-found-during-cockpit-v1/) — Subagent-boundary code review (structural guarantee across turn boundary).

Parallel engine work:
- generacy#885 — tracking the `cockpit resume <issue-ref>` addition to G-S8 (Assumption A2).
