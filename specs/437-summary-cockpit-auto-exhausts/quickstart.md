# Quickstart: `/cockpit:auto` enriched-line dispatch (agency#437)

**Feature**: agency#437
**Branch**: `437-summary-cockpit-auto-exhausts`
**Date**: 2026-07-17
**Status**: Complete

Everything below runs from the repo root at `/workspaces/agency`.

## What this fix does

Teaches `/cockpit:auto` to parse the NDJSON doorbell line the engine now emits (post-generacy#985) and dispatch off the line's `to` / `labels` / baked `checks` verdict directly for label-driven classes (D.1–D.4, D.7, D.9, D.9a–D.9d) and the merge gate (D.5/D.6 on decisive `checks`). Drops the per-event `cockpit_status(epic, json=true)` re-check for these classes — the dominant GitHub GraphQL rate-limit consumer at ≈28 GraphQL calls per event, ≈95 per typical 3-event wake. Retains the re-check for D.8, D.10, D.11 (human/consequential gates) where a stale-line dispatch could open a gate against superseded state.

Includes a graceful-degradation gate so older-engine clusters (pre-generacy#985, no enriched line) fall back to pre-#437 behaviour without runtime error — no lockstep-landing hazard.

## Prerequisites

- pnpm workspace setup (already handled by the repo).
- `generacy` binary on PATH with the `cockpit doorbell` subcommand available (post-#985 for enriched-line dispatch; pre-#985 falls back to today's re-query behaviour without error).
- The seven `cockpit_*` MCP tools registered in the cluster's Claude Code binding (unchanged from pre-#437 — see cluster-base#75 for registration).
- Node ≥ 20 (repo baseline).

## Install

Same as the monorepo baseline — no new dependencies:

```bash
pnpm install
pnpm build
```

## What to look for in `auto.md` after the edit

```bash
# Step 4a should carry the new "resolve authoritative state" wording (positive pin surface)
grep -c "resolve authoritative state" packages/claude-plugin-cockpit/commands/auto.md
# expect: ≥ 1

# The pre-#437 advisory-vs-authoritative wording should be gone (negative pin surface)
grep -c "The batch event is advisory; the live return is authoritative" packages/claude-plugin-cockpit/commands/auto.md
# expect: 0

# Invariant §7 should reference the § Enriched-line dispatch contract (positive pin surface)
grep -c "Enriched-line dispatch contract" packages/claude-plugin-cockpit/commands/auto.md
# expect: ≥ 1

# The pre-#437 "never parsed for content" phrase should be gone from § Invariants §7 (negative pin surface)
grep -c "never parsed for content" packages/claude-plugin-cockpit/commands/auto.md
# expect: 0

# The § Ledger vocabulary should carry the `source: enriched-line` marker string (positive pin surface)
grep -c "source: enriched-line" packages/claude-plugin-cockpit/commands/auto.md
# expect: ≥ 1

# D.5/D.6 should name both `absent` and `pending` as fallback triggers (positive pin surface, Q4=B)
grep -cE "absent (OR|or) [\`]?pending[\`]?|[\`]?pending[\`]? (OR|or) absent" packages/claude-plugin-cockpit/commands/auto.md
# expect: ≥ 1

# D.5/D.6 should NOT contain a defer-on-pending phrasing (negative pin, Q4=A rejection)
grep -c "defer this wake" packages/claude-plugin-cockpit/commands/auto.md
# expect: 0
```

## Verification

### SC-001 — GraphQL rate-limit reduction (before/after cost model)

Run against a mid-size auto epic on a cluster with generacy#985 deployed. Instrument by counting `cockpit_status(epic=...)` invocations in the run's ledger `.generacy/cockpit/auto-runs/<ref-slug>-<ts>.ledger`.

**Pre-#437 cost model** (baseline):

```
Wake types (typical steady-state auto run):
  - 3 label-driven events per wake (D.1–D.4, D.7): 3 × cockpit_status(epic) = 3 × ~28 GraphQL = ~84 calls per wake
  - 1 phase-complete per phase (D.8):              1 × cockpit_status(epic) = ~28 GraphQL
  - Ledger-only events (D.9, D.9a–D.9d):           0 GraphQL calls (pre-#437 already skipped re-check)
```

**Post-#437 cost model** (enriched line path):

```
  - 3 label-driven events per wake (D.1–D.4, D.7): 0 GraphQL calls (dispatched from enriched line)
  - 1 phase-complete per phase (D.8):              1 × cockpit_status(epic) = ~28 GraphQL (RETAINED)
  - Ledger-only events (D.9, D.9a–D.9d):           0 GraphQL calls (unchanged)
```

**Verification recipe** (against a live cluster with post-#985 engine):

```bash
# 1. Run /cockpit:auto for ~10 minutes on a mid-size epic with active label transitions
claude /cockpit:auto <owner>/<repo>#<epic-n>

# 2. In the ledger file, count enriched-line dispatch rows
grep -c "source: enriched-line" .generacy/cockpit/auto-runs/<ref-slug>-<ts>.ledger
# expect: > 0 on a post-#985 engine, ≈ every label-driven dispatch

# 3. Count fallback re-query rows
grep -cv "source: enriched-line" .generacy/cockpit/auto-runs/<ref-slug>-<ts>.ledger | head -c 100
# expect: retain-the-re-check classes (D.8, D.10, D.11) + heartbeat lines + header line
```

### FR-005 — Graceful degradation on pre-#985 clusters

Run against a cluster with the OLD generacy (no enriched line generation). Every doorbell line should fail the C2 detection gate and the fallback re-query path should fire. The run should complete without runtime error at pre-#437 GraphQL cost.

```bash
# Expected ledger content: no `source: enriched-line` marker anywhere
grep -c "source: enriched-line" .generacy/cockpit/auto-runs/<ref-slug>-<ts>.ledger
# expect: 0 on a pre-#985 engine

# The run itself should complete normally — no error prints, no aborted dispatches
```

### Test pins — via Vitest

```bash
# Run the playbook-verification suite (includes the new 437 assertions + any re-pinned existing ones)
pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification

# Expected:
#   437-1 through 437-6 pass
#   All pre-existing pins pass (including 406-3 for the loop shape and 433 for the pre-flight probe)
```

### Manual regression check on the pins

**Confirm pin catches a partial revert of §7** (the negative-pin protection):

```bash
git checkout -b scratch/verify-437-pin
sed -i 's|Enriched lines (JSON-parseable objects carrying `to` and `labels`) ARE parsed|never parsed for content|' \
  packages/claude-plugin-cockpit/commands/auto.md
pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification
# Expected: 437-3 (§7 rewrite negative pin) fails — because `never parsed for content` reappeared.
git checkout -- packages/claude-plugin-cockpit/commands/auto.md
git checkout -
```

**Confirm pin catches a defer-on-pending regression** (Q4=A rejection safeguard):

```bash
git checkout -b scratch/verify-437-checks-pending-pin
# Add a defer-on-pending phrasing to D.5's dispatch narration
# (this is a scratch/manual insertion — for verification only)
pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification
# Expected: 437-5 (D.5/D.6 fallback rule negative pin) fails
git checkout -- packages/claude-plugin-cockpit/commands/auto.md
git checkout -
```

## Available commands

This feature does not introduce new commands. The behaviour it changes is inside:

- `/cockpit:auto <epic-ref>` — the enriched-line dispatch path fires here.

Unchanged commands (all still work identically):

- `/cockpit:watch` — the manual assist skill named in `auto.md`'s pre-flight failure messages. Its own dispatch does not use the enriched line (it is a manual-assist skill, not an auto driver).
- `/cockpit:status`, `/cockpit:advance`, `/cockpit:queue`, `/cockpit:merge`, `/cockpit:resume`, `/cockpit:context`, `/cockpit:clarify`, `/cockpit:review` — all unchanged; these are the assist skills whose *actions* the auto loop routes to.

## Troubleshooting

**"auto is running but the ledger has no `source: enriched-line` marker rows"**
Two possibilities: (a) the cluster's `generacy` binary is pre-#985 and emits bare doorbell lines (expected — graceful degradation; run at pre-#437 cost); (b) every event landing during the run happens to be D.8/D.10/D.11 (rare — those retain the re-check and emit no marker). Confirm the engine version:

```bash
generacy --version
generacy cockpit doorbell --help
```

If the version is post-#985 and no marker rows appear despite active label events, file a follow-up against generacy — the engine is not baking `to`/`labels`.

**"the auto loop is dispatching, but every dispatch also shows a `cockpit_status(epic=...)` call in the transcript"**
The enriched-line path skips the re-check by design; if you observe a re-check on every event, the enriched-vs-bare gate is falling back. Possible causes: (a) the line is bare (see above); (b) the class is D.8/D.10/D.11 (retain-the-re-check by design); (c) the D.5/D.6 branch got `checks: pending` or absent and fell back per Q4=B (expected, ≈once per issue).

**"GraphQL rate limit still exhausted after landing #437"**
Check the ratio of `source: enriched-line` markers to fallback rows in the ledger. If enriched-line rows dominate but rate limit still exhausts, the load is somewhere else — likely `cockpit_context` (D.7 evidence fetch, D.11 conflict fetch), `openAdHocIssues` per-ad-hoc-ref status calls in D.8, or a runaway D.6 fixer subagent. Grep the ledger for `escalation-gate` / `openAdHocIssues` / `fixer` outcomes to isolate.

**"`playbook-verification.test.ts::437-3` fails after my edit"**
The § Invariants §7 rewrite is required to include the `Enriched-line dispatch contract` cross-reference AND drop the `never parsed for content` phrase. If a manual edit restored the pre-#437 wording (or partially reverted the rewrite), the negative-pin trips. See the pin surface list in the "What to look for" section above.

**"`playbook-verification.test.ts::437-5` fails after my edit"**
Q4=B requires D.5/D.6 to fall back on BOTH `absent` AND `pending`. If only one is named (or a defer-on-pending phrasing slipped in), the pin trips. The canonical wording lives in `data-model.md § E7.3` and `contracts/enriched-line-dispatch.md § C4`.

## Related

- **generacy-ai/generacy#985** — companion PR (engine side) that makes the doorbell line content-ful. Owns the JSON schema, local `to`-classification, and the baked `checks` verdict. Lands in lockstep with this PR.
- **agency#431** — pre-#437 doorbell real-time work (pre-flight probe, sensor arm-up under `Monitor`, wake-driven main loop). Context for the loop shape this PR touches.
- **agency#433** — sibling drift-audit pin PR; established the positive + negative pin convention this PR follows.
- **generacy-ai/generacy#970 / #978 / #980** — doorbell foundation (context for what generacy#985 extends).
- **CLAUDE.md § Cockpit playbook pins** — the invariant that if this PR breaks a pin, the correct response is to re-pin to the new contract in this same PR, not weaken the assertion. This PR follows that rule for the step-4a and D.1–D.7 dispatch pins.

---

*Generated by speckit*
