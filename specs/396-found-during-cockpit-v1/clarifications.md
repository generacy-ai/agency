# Clarifications: #396

## Batch 1 — 2026-07-10

### Q1: FR-011 audit vocabulary source
**Context**: FR-011's drift audit enumerates every `waiting-for:*` token in "the engine's gate vocabulary" and asserts each appears as a Trigger in a § Dispatch row. The spec (Assumptions) points at "the label-protocol doc (canonical location in tetrad-development, referenced elsewhere in the plugin)" but does not name a file path. Two concrete candidates exist in tetrad-development today, with materially different content:
- `docs/label-protocol.md` — a markdown table listing 8 `waiting-for:*` tokens (author-curated). Does not contain `waiting-for:merge-conflicts`.
- `.github/labels.yml` — the YAML source consumed by `scripts/sync-labels.sh` for `gh label` sync. Lists 11 `waiting-for:*` tokens (`spec-review`, `clarification`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`, `manual-validation`, `pr-feedback`, `address-pr-feedback`, `children-complete`, `dependencies`). Also does not contain `waiting-for:merge-conflicts`.

The audit fixture needs a concrete source path or vocabulary list to compile against. The choice materially changes which tokens the audit will demand dispatch rows for (see Q2 for the pre-existing-drift consequence).

**Question**: What is the source-of-truth the FR-011 audit reads from?
**Options**:
- A: `/workspaces/tetrad-development/.github/labels.yml` — canonical sync source; parse the `- name: "waiting-for:*"` entries.
- B: `/workspaces/tetrad-development/docs/label-protocol.md` — the human-facing doc; grep the markdown for `waiting-for:*` tokens in code spans.
- C: A plugin-local curated list (e.g., `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`) enumerated by hand — this fix seeds it with just the tokens actually dispatched by `auto.md` today; drift against `labels.yml` becomes a follow-up concern.
- D: Grep `auto.md` itself for `waiting-for:*` tokens — the audit becomes a self-consistency check ("every token I dispatch on has a row"), which by construction is always true and adds no drift signal against the engine.

**Answer**: C, seeded with the full engine vocabulary — not just auto.md's tokens. The audit runs in this repo's CI, which cannot read tetrad-development files (A/B are cross-repo reads), and D is self-consistency vacuity by its own admission. So: a plugin-local `gate-vocabulary` list seeded with all 11 `labels.yml` tokens **plus `waiting-for:merge-conflicts`**, with a header naming the upstream sources and the sync obligation. The runtime rule (any `waiting-for:*` without a row → D.10) remains the real safety net; the audit is completeness hygiene against the declared vocabulary.

### Q2: Pre-existing dispatch-table gaps
**Context**: If Q1 picks either A (`labels.yml`, 11 tokens) or B (`label-protocol.md`, 8 tokens), the audit will flag several tokens absent from `auto.md`'s § Dispatch table **today**, before `waiting-for:merge-conflicts` is even added:
- `waiting-for:pr-feedback` — no dispatch row (only `address-pr-feedback` has D.9)
- `waiting-for:children-complete` — no dispatch row (in labels.yml only)
- `waiting-for:dependencies` — no dispatch row (in labels.yml only)

The FR-011 audit would fail on these on day one. The spec's Out-of-Scope section says "Retrofitting an escalation gate for any `waiting-for:*` label other than `waiting-for:merge-conflicts`" is out of scope — but a failing audit blocks the fix from shipping. Some resolution mechanism is required.

**Question**: How should the audit treat these pre-existing gaps?
**Options**:
- A: Expand scope — add explicit rows to § Dispatch for all missing tokens (`waiting-for:pr-feedback` → ledger-only shape like D.9; `waiting-for:children-complete`, `waiting-for:dependencies` → judgment call per token). Audit passes at day one.
- B: Add an explicit allowlist inside the audit fixture naming the pre-existing gaps as "known drift, out of scope for #396"; audit fails-open on those tokens only; the allowlist is a visible TODO surface for a follow-up finding.
- C: Add ledger-only D.9-shape rows for the three pre-existing tokens (minimal-invasive, no new gates, no operator surface) plus D.11 for merge-conflicts — audit passes without allowlist.
- D: Narrow FR-011 — the audit only asserts `waiting-for:merge-conflicts` appears (a single-token check, not a corpus check). Full drift audit is deferred to a follow-up finding.

**Answer**: C, with B as the per-token fallback — add ledger-only D.9-shape rows for the three pre-existing tokens, each with a one-line rationale (`pr-feedback`: legacy alias of the engine-owned feedback loop; `children-complete`: epic-container state — the running loop *is* its resolution; `dependencies`: engine-owned cross-issue wait). Cheap, audit-green day one, semantics documented, and the tightened D.10 still escalates if a "ledger-only" call turns out wrong live. If any token's semantics can't be pinned at implement time, allowlist that one with a filed follow-up rather than guessing.

### Q3: `cockpit advance --gate merge-conflicts` failure path
**Context**: D.11's `Apply verdict` step says `I've resolved it — advance the gate` runs `generacy cockpit advance --gate merge-conflicts <issue-ref>`. The spec is silent on what happens if that CLI call returns non-zero (e.g., branch still has conflicts, engine rejects the advance, network/auth failure). D.7 has a comparable case with a precedent — `cockpit resume` failures degrade to Skip with an explicit ledger note — but the D.11 dispatch does not name a fallback. Implementation cannot pick a behavior without a call.

**Question**: If `cockpit advance --gate merge-conflicts <issue-ref>` returns non-zero after the operator selects `I've resolved it — advance the gate`, what happens?
**Options**:
- A: Re-present the D.11 gate with the error prepended to the presentation block (like D.6's re-present-on-fixer-unfixed). The operator can retry, skip, or stop.
- B: Route to D.10 as an unrecognized state (the failed-advance transition class has no other dispatch row). Ledger the D.11 outcome as `advance failed → escalation` and hand off.
- C: Ledger the failure with outcome `advance failed: <description>` and continue the loop. The label persists → next re-check hits D.11 again → operator sees the gate again. Idempotency (L.5) covers duplicate-action safety.
- D: Fail loud — ledger the failure and Stop the auto session (matches how "hard-error subagent" returns route to Error handling class OTHER in D.2/G.2). Operator must relaunch after fixing the underlying issue.

**Answer**: A — re-present the D.11 gate with the CLI error prepended verbatim to the presentation block (the most likely cause is "branch still has conflicts," which the operator needs to see *now*, mid-decision, not on the next poll). Matches D.6's re-present-on-fixer-unfixed precedent; Skip/Stop remain on the re-presented gate, so C's eventual-retry is subsumed with better context and D's full-stop is available without being mandatory.

### Q4: `waiting-for:merge-conflicts` in engine label vocabulary
**Context**: The observed T-S5 evidence in the spec Summary states "All three P2 issues reached `waiting-for:merge-conflicts`" — so the engine emits this label today. However, the label is not registered in `/workspaces/tetrad-development/.github/labels.yml` (the sync source) and not documented in `/workspaces/tetrad-development/docs/label-protocol.md`. If Q1's audit source is A or B, adding the D.11 row alone will not make the audit pass — the token also needs to appear in the source doc.

The spec's Out-of-Scope explicitly excludes engine-side changes ("Any engine-side change to how `waiting-for:merge-conflicts` is entered, held, or exited"). Adding a label to `labels.yml` is a docs/config change, not a behavior change — so its status is ambiguous.

**Question**: Should this PR also register `waiting-for:merge-conflicts` in tetrad-development's label vocabulary?
**Options**:
- A: Yes — add the label to `.github/labels.yml` and `docs/label-protocol.md` in tetrad-development as a companion commit (or a linked cross-repo PR). Audit passes cleanly once Q1 = A or B.
- B: No — the audit source must be Q1-C (plugin-local vocabulary) or Q1-D (self-consistency check); tetrad-development label registration is deferred to the companion generacy finding.
- C: Partial — add the label to `labels.yml` only (the machine-readable source), skip `label-protocol.md` (documentation catches up later).
- D: No — coordinate through the companion generacy finding; this fix ships with an allowlist entry (per Q2-B) noting "engine emits, doc pending; unblock via generacy#…".

**Answer**: D-modified — no allowlist needed, because the operator is registering the label directly. `waiting-for:merge-conflicts` (and `completed:merge-conflicts`) are being added to tetrad-development's `.github/labels.yml` and `docs/label-protocol.md` as an operator-side doc/config edit — same-day, alongside these answers. The audit reads the plugin-local list per Q1-C regardless, so there is no cross-repo CI coupling either way.

### Q5: G.4 (d) subtype placement in the presentation block
**Context**: FR-003 says the § G.4 escalation-gate presentation block gains a fourth sub-block `(d) Merge-conflicts` modelled on `(c) Unrecognized state`. The current block lists (a) validate-red/merge-red, (b) agent:error/failed:*, (c) unrecognized state in that order (lines 401–429 of `auto.md`). The spec's D.11 numbering choice — D.11 numerically follows D.10 but sits *visually* between D.9 and D.10 in the human-facing dispatch table — creates two plausible placement rules for G.4 (d).

**Question**: Where does the `(d) Merge-conflicts` sub-block appear in the presentation block, and does the same rule apply to the § Gate contract table row?
**Options**:
- A: Append after (c) — placement follows numeric label order (a, b, c, d). The § Gate contract table gains a `G.4 (d)` row appended after `G.4 (c)`.
- B: Between (b) and (c) — placement mirrors D.11's *visual* position in the human-facing dispatch table (named-non-catch-all rows grouped, catch-all last). Contract table follows the same insertion order.
- C: Placement follows dispatch-row correspondence — (c) stays with D.10 (catch-all), (d) inserts between (b) and (c) matching D.11's grouping with the other named rows.
- D: Doesn't matter — pick either A or B; the visual order carries no semantic weight (the trigger comes from the dispatch row, not the block position).

**Answer**: C for the concrete placement, D for the rationale — the order carries no semantic weight, so pin a deterministic rule and apply it to both the presentation block and the contract table: named rows grouped together, catch-all last. `(d) Merge-conflicts` inserts between (b) and (c); `(c) Unrecognized` stays terminal, mirroring D.10's position.
