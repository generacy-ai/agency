# Quickstart: Improvement spec from the cockpit v1.5 auto-mode smoke test

**Purpose**: Verification runbook for the #403 changes. Three layers — static (grep on the modified files), behavioral (the Vitest suite extension), and true-verifier (a re-run of the cockpit v1.5 auto-mode smoke test on a comparable 12-issue epic).

---

## Prerequisites

- `pnpm install` has been run at the repo root (repo-standard).
- Node.js + Vitest are available (already dev-deps in `packages/claude-plugin-cockpit/package.json` since #394).
- `ripgrep` (`rg`) is available on `$PATH` (repo-standard).

## Layer 1 — Static checks

Run from the repo root. These greps are the low-cost first line of defense; behavioral assertions in Layer 2 are the load-bearing check.

### Positive anchors (must be present)

```bash
# D.9 family subheadings state the no-re-check/no-prose contract.
rg -c 'no status table, no prose recap' packages/claude-plugin-cockpit/commands/auto.md
# Expected: 5  (one occurrence in each of D.9, D.9a, D.9b, D.9c, D.9d)

# New D.9d subheading exists.
rg -n '^### D\.9d — `phase:\*`' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match line.

# D.9d outcome vocabulary entry.
rg -c 'engine-owned phase transition' packages/claude-plugin-cockpit/commands/auto.md
# Expected: ≥ 2  (D.9d subheading ledger-line format + vocabulary table row).

# D.7 and D.11 sole-verb contract.
rg -c 'generacy cockpit context <issue>' packages/claude-plugin-cockpit/commands/auto.md
# Expected: ≥ 2  (D.7 step 1 + D.11 step 1).

# Diagnosis subagent return-schema directive.
rg -c 'root_cause: string, evidence: string, recommended_action: string, confidence: "low"\|"medium"\|"high"' packages/claude-plugin-cockpit/commands/auto.md
# Expected: ≥ 2  (D.7 step 2 + D.11 step 1.5, or one canonical block + one cross-reference).

# Invariants §8 cost-contract line opening substring.
rg -F 'A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match.

# § Ledger L.4 status table policy subsection.
rg -n '^### L\.4 — Status table policy' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match line.

# Status table anchor is present at least once.
rg -c '\| Issue \| Phase \| State \|' packages/claude-plugin-cockpit/commands/auto.md
# Expected: ≥ 1  (at least one of the four permitted surfaces renders a table).
```

### Negative anchors (must be absent)

```bash
# D.7 / D.11 step-1 evidence-fetch prose does not contain the ad-hoc gh chain.
rg -n 'gh issue view.*--comments' packages/claude-plugin-cockpit/commands/auto.md
# Expected: no matches.  (If any survive from prior playbook prose outside D.7/D.11, remove them or narrow the check to the D.7/D.11 subheading blocks.)

# clarify.md is unchanged on this branch.
git diff --name-only origin/develop -- packages/claude-plugin-cockpit/commands/clarify.md
# Expected: empty output.

# Historical spec directories are unchanged on this branch.
git diff --name-only origin/develop -- 'specs/384-*' 'specs/388-*' 'specs/390-*' 'specs/394-*' 'specs/396-*' 'specs/398-*' 'specs/400-*'
# Expected: empty output.

# lib/*.ts files unchanged on this branch.
git diff --name-only origin/develop -- 'packages/claude-plugin-cockpit/lib/*.ts'
# Expected: empty output.
```

### Cross-file preservation checks (FR-010)

```bash
# The #400 five-element gate display is unchanged in G.1 / G.2 / G.3.
git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md | rg -n '\*\*Recommendation:\*\*|\*\*Why:\*\*' | rg -v '^-'
# Expected: only additions, no deletions of the five-element headers.

# The never-content-filter invariant (§7) is unchanged.
git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md | rg -n '^-.*Stream consumption is unfiltered'
# Expected: no matches (line not removed).

# The mandatory ledger line rule (§ Ledger) is unchanged.
git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md | rg -n '^-.*A dispatch without a ledger line is a protocol violation'
# Expected: no matches.
```

## Layer 2 — Behavioral checks (Vitest suite)

Run the extended playbook-verification suite:

```bash
cd packages/claude-plugin-cockpit
pnpm vitest run tests/playbook-verification.test.ts
```

Expected output includes the new `describe("403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract", () => …)` block with seven passing assertions:

- **403-1**: D.9 family subheadings state the no-re-check/no-prose contract verbatim.
- **403-2**: New D.9d subheading with `phase:*` prefix-match, ledger-line-only dispatch, `engine-owned phase transition` outcome.
- **403-3**: Reference dispatch classifier prefix-matches `phase:*` to D.9d, not D.10 (fixtures: `403-phase-transition-live-state.json`, `403-phase-someday-live-state.json`).
- **403-4**: D.7 and D.11 sole-verb contract + diagnosis subagent return-schema anchor.
- **403-5**: `parseVerdict` reference type shape + option-set constraint (fixtures: `403-d7-verdict-requeue.json`, `403-d11-verdict-resolved.json`, `403-verdict-invalid-action.json`).
- **403-6**: § Invariants §8 cost-contract line present.
- **403-7**: Full epic status table appears only at four permitted surfaces (section-scan of `commands/auto.md`).

Existing assertions (394-* / 396-* / 398-* / 400-*) must remain green. If any pre-existing assertion regresses, investigate before landing.

## Layer 3 — True verifier (operator smoke test)

The mechanical checks catch prose drift and schema drift; the true verifier is a re-run of the cockpit v1.5 auto-mode smoke test on a comparable 12-issue epic. This exercises the fix under real conditions.

### Setup

Pick a corpus with at least one 12-issue epic. Ideally, re-run the exact snappoll 2026-07-10 shape so the transcript comparison is apples-to-apples. If the original corpus isn't available, any comparable epic works — the SC-005 target is a ~50% reduction relative to whatever baseline the run is being compared to.

### Run

```bash
/cockpit:auto <owner>/<repo>#<epic-issue-number>
```

Let the session run to `epic-complete` (or to a Stop from an escalation gate if the run intentionally ends there).

### Post-run audits

For each metric, the audit is a grep or count on the parent transcript (available as the session's `.jsonl` output or the accumulated transcript print stream).

- **SC-001 — Tool calls per transient/ledger-only event dispatch**:
  - Grep the transcript for D.9 / D.9a / D.9b / D.9c / D.9d ledger lines.
  - For each ledger line, verify that the parent's immediately preceding tool call was a bash-append to the `.ledger` file and nothing else.
  - Target: ≤ 1 tool call per ledger-only event.

- **SC-002 — Prose blocks per transient/ledger-only event dispatch**:
  - For each D.9 / D.9a / D.9b / D.9c / D.9d ledger line, verify the assistant response containing the ledger line consists of the ledger line only (prefixed with `[ledger] `).
  - Target: 0 additional prose blocks.

- **SC-003 — Epic status tables between phase boundaries**:
  - Grep the transcript for the anchor `| Issue | Phase | State |`.
  - Verify every occurrence is inside a permitted surface (phase-complete gate, epic-complete summary, escalation gate, startup-sweep summary).
  - Target: 0 occurrences outside the four permitted surfaces.

- **SC-004 — In-parent multi-command failure diagnostics**:
  - For each D.7 / D.11 gate presentation in the transcript, verify a `Verdict`-shaped JSON blob appears immediately before the presentation (the diagnosis subagent's return).
  - Verify no ad-hoc `gh issue view --comments` or `gh api` calls appear in the parent transcript between a D.7/D.11 event and its gate presentation.
  - Target: 0 in-parent multi-command diagnostics; every D.7/D.11 gate cites a subagent verdict.

- **SC-005 — Context growth**:
  - Read the session's final cache-read size from the transcript's usage / cache metadata.
  - Target: ≤ ~250k tokens (~50% of the 508k baseline).
  - Note: this metric is a probabilistic outcome (context growth depends on epic shape, issue count, and escalation frequency). If the epic differs meaningfully from the snappoll baseline (e.g., 6 issues instead of 12), scale the target proportionally.

- **SC-006 — Playbook-verification suite passes**:
  - Re-run Layer 2 assertions against the branch's `commands/auto.md`.
  - Target: green.

- **SC-007 — D.10 escalation gates fired by `phase:*` transitions**:
  - Grep the transcript for D.10 presentation blocks (`Unrecognized state on`).
  - For each occurrence, verify the observed state is NOT a `phase:*` token.
  - Target: 0 D.10 gates fired by `phase:*` transitions.

### Interpretation

If any SC target is missed:

- **SC-001 / SC-002 / SC-003 miss**: prose regression in `auto.md`. Re-check the D.9-family subheading prose, the new L.4 subsection, and the § Invariants §8 line. The Layer 2 suite should have caught this — if it didn't, the assertion is not tight enough and needs an addendum.
- **SC-004 miss**: the D.7/D.11 subagent-dispatch prose isn't landing behaviorally. Re-check the D.7 step 1–2 and D.11 step 1–1.5 prose blocks. Consider: is the subagent-invocation shape clear? Is the return-schema directive verbatim?
- **SC-005 miss**: context is still growing beyond the target. Attribution: use the transcript census (from #92) to identify what's growing. If it's still per-event dispatch, the fix isn't holding under runtime; if it's a different class (e.g., subagent prompt+return volume), that's a follow-up finding.
- **SC-007 miss**: `phase:*` is still routing to D.10. Re-check the D.9d subheading exists and its Trigger sentence is unambiguous. Consider: is the prefix-match rule clear to the model reading the prose at runtime, or does it need a more explicit "prefix-match" annotation?

## Troubleshooting

### "The 403-5 verdict validator rejects a valid-looking verdict."

Whitespace-strict option-string matching is intentional. The subagent's `recommended_action` must be exactly one of the enumerated strings, character-for-character. Common failure modes:

- Trailing whitespace in the subagent's return (e.g., `"Requeue (cockpit resume) "` — trailing space).
- Punctuation drift (e.g., `"I've resolved it—advance the gate"` without spaces around the em-dash, or `"Ive resolved it — advance the gate"` without the apostrophe).
- Capitalization (`"requeue (cockpit resume)"`).

The subagent prompt lists the exact strings verbatim; if the LLM is producing paraphrases, tighten the prompt directive or add an example to the prompt. But do NOT relax the validator — the "exact string" constraint is what keeps the parent at zero re-analysis (FR-003 / FR-004).

### "The 403-7 section-scan reports a false positive on the escalation gate presentation."

The escalation gate presentation blocks are permitted surfaces (surface 3 in the L.4 policy). If the section-scan flags `G.4b` or `G.4d`, the section-name matcher isn't recognizing them as G.4 subtypes. Check the assertion's permitted-section list — it should include `G.4` (all subtypes covered by the single G.4 heading), not enumerate `G.4a` / `G.4b` / `G.4c` / `G.4d` separately.

### "SC-005 target isn't hit but SC-001/002/003 are green."

Context growth is a probabilistic outcome and depends on epic shape. Check:

- Is the epic comparable to snappoll 2026-07-10? Same issue count, similar escalation frequency, similar phase count?
- Are the D.7/D.11 subagent hops still adding significant context? A single diagnosis subagent hop is ~5-10k tokens of subagent prompt + subagent return (matching the #390 review analyzer size). If the run had many D.7/D.11 gates, this is where the residual growth is.
- Is retained assistant thinking still dominating? The spec's Problem section notes "Thinking volume is proportional to dispatch rounds" — the fix reduces dispatch rounds, which should reduce thinking proportionally. If it isn't, the follow-up finding is a direct thinking-reduction workstream (spec § Out of Scope).

### "The audit table in the PR body found a misclassification."

Per FR-008, re-route the misclassified row to the correct actionable class in the same PR. Do not land the contract change until the audit's findings are actioned. The Q2 clarification's rationale: "a misclassification found is re-routed to the correct actionable class in the same PR (audit deliverable is a table in the PR body that review can check)."

## Summary — files to inspect on this branch

- `packages/claude-plugin-cockpit/commands/auto.md` (modified — the load-bearing surface).
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (extended with the `403 —` describe block).
- `packages/claude-plugin-cockpit/tests/fixtures/403-*.json` (new fixtures).
- `specs/403-improvement-spec-from-cockpit/tasks.md` (Phase 2 output — generated by `/tasks` from this plan; not yet present).

Files that must remain unchanged:

- `packages/claude-plugin-cockpit/commands/clarify.md` (FR-009).
- `packages/claude-plugin-cockpit/commands/merge.md`, `queue.md`, `review.md`, `status.md`, `watch.md`.
- `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`, `reference-consumption.ts`, `clarification-batch-parser.ts`.
- Historical spec directories: `specs/384-*/`, `specs/388-*/`, `specs/390-*/`, `specs/394-*/`, `specs/396-*/`, `specs/398-*/`, `specs/400-*/`.
