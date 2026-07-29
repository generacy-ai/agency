# Clarifications: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Issue**: [generacy-ai/agency#471](https://github.com/generacy-ai/agency/issues/471)
**Branch**: `471-problem-once-phase-c`

---

## Batch 1 — 2026-07-29

### Q1: Scope of adoption (resolves FR-009 `[NEEDS CLARIFICATION]`)

**Context**: FR-009 is the only requirement in the spec explicitly marked `[NEEDS CLARIFICATION]`. `cockpit_gate_list({ issueRef, gateType: <omitted> })` returns every non-terminal gate for a ref. Some rows will match a natural gate the current run's sweep would draft (same `(issueRef, gateType, generation)`); others may not — e.g. a prior-run gate at generation `G1` when the current run's derivation yields `G2` (a PR SHA changed, a phase advanced, a clarification answer-set was revised), or a `gateType` the current run does not intend to open at all under the extended trigger set for this in-scope issue.

The trade-off is that broad adoption keeps every prior-run inbox entry answerable — no orphans possible — but populates `openGates` with entries the current run has no natural handler for (a `dispatchClass` derived from `(gateType, generation)` still resolves, but the current run may never re-visit that decision). Scoped adoption keeps `openGates` scoped to what the current run understands and would have drafted, but leaves any non-matching prior-run gate orphaned — the exact symptom this spec exists to eliminate, just narrower.

**Question**: For a non-terminal row returned by `cockpit_gate_list` whose `(gateType, generation)` does NOT match a natural gate the current run's sweep would draft for that in-scope issue, what does the sweep do?

**Options**:
- A: **Adopt anyway (broad)** — adopt every non-terminal row for every in-scope issue into `openGates`. The `dispatchClass` is derived from `(gateType, generation)` using the same mapping-table rule the current-run sweep uses. Rows for out-of-scope issues (not part of this run's tracking-ref sweep set) are still skipped. Rationale: no orphans possible; a stale prior-run gate remains answerable and its answer routes.
- B: **Scoped adopt (narrow)** — adopt only rows whose `(gateType, generation)` matches a natural gate the current run's sweep would draft for that in-scope issue. Non-matching rows are left as-is on the cloud (not adopted, not acked, not superseded) — orphaned but not compounded. Rationale: `openGates` stays scoped to what the current run understands; the operator sees a prior-run inbox entry with no current-run tracking, matching the pre-adoption failure mode for the non-matching subset only.
- C: **Adopt-and-ack-supersede on generation mismatch** — adopt rows whose `(gateType, generation)` matches; for rows whose `gateType` matches but `generation` differs, ack the prior-run gate `superseded` (targeting the prior-run's `runId` per FR-003) and draft fresh at the current generation. Rationale: this is what today's D.n Step-0 `generation-drift branch` does for the four dispatch rows that map 1:1 onto `gateType`; extending the same rule to adopted gates keeps the sweep and the live path symmetric. Note: `gateType: 'escalation'` disables the drift branch (per `auto.md` line 317; four dispatch rows share the one enum value); this option MUST preserve that carve-out.
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q2: Adoption call granularity — per tracking ref vs per in-scope issue

**Context**: FR-001 says the sweep calls `cockpit_gate_list({ issueRef: <tracking-ref>, gateType: <omitted> })` "exactly once per tracking ref". Read literally, that is ONE call with `issueRef = <the run's tracking-ref>` (an epic in epic mode, an ad-hoc tracking issue in tracking mode).

But `cockpit_gate_list` filters by `issueRef` — it returns gates keyed to THAT issue only. In epic mode, the sweep's UI-mode extended trigger set (`auto.md` § "UI-mode extended trigger set") opens gates per in-scope child issue (`issueRef = childRef` for D.1 clarification, D.2 clarification-review, D.3 plan-review, D.4 tasks-review, D.7 implementation-review, D.11 manual-validation). Those child gates are invisible to a single `cockpit_gate_list({ issueRef: <epic-ref> })` call. Only gates opened against the epic itself (D.6 clarification on the epic body, D.7 phase-complete on the epic) would be returned.

If FR-001 means "once with the epic ref", child-issue gates from prior runs stay orphaned — the repair does not cover the common case. If FR-001 means "once per in-scope issue" (N calls for N children), the FR text and count target need to say so.

**Question**: For an epic-mode run against an epic with N in-scope children, how many `cockpit_gate_list` calls fire on the adoption path, and against which `issueRef`?

**Options**:
- A: **Per in-scope issue** — one `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })` per in-scope issue (epic itself + every in-scope child). N+1 calls for an epic with N children. Rewrite FR-001 as "exactly once per in-scope issue" and update SC-004 / SC-005 log-grep assertions accordingly. Rationale: this is the only shape that sees child-issue gates, which are where clarification / review gates actually live.
- B: **Per tracking ref (epic only)** — exactly one call as FR-001 literally reads. Child-issue gates remain orphaned; the spec's scope narrows to epic-body gates (D.6 clarification, D.7 phase-complete). Rationale: cheaper; matches FR-001 literal text; explicitly out-of-scope-s the child-gate case (which would need a follow-up).
- C: **Per tracking ref, with a cross-issue list surface** — add a new/extended `cockpit_gate_list` mode that returns every non-terminal gate under a tracking-ref's transitive scope (epic + all children) in one call. Requires an upstream generacy change; likely out of scope for this phase per the spec's "Out of Scope" clause forbidding MCP schema changes.
- D: Something else — please specify (e.g. per-issue call is only issued when the sweep would draft a gate for that issue).

**Answer**: *Pending*

---

### Q3: Adopted `answered` gate — dispatch mechanism

**Context**: FR-010 says an adopted gate with `status: 'answered'` "MUST be dispatched through the same answered-gate handling the current run uses for its own answered entries (the § 'Answered-gate parked-forever escape hatch' block in `auto.md`)".

But that block (`auto.md` § "Answered-gate parked-forever escape hatch (UI mode only)") does not consume the operator's answer — it acks the gate `superseded` with detail `'answered-not-consumed — presumed stuck at cloud delivered/applied'`, deletes from `openGates`, and RE-DERIVES a fresh event from the current labels via `cockpit_status(issue=<issueRef>, json=true)`. It only fires after the counter hits `>= 3` sweeps. The re-derivation reads current labels, not the answer document; if the operator's answer to G1 already caused a label transition (e.g. `waiting-for:clarification` → `completed:clarification`), the re-derivation dispatches on that transition. If the labels DID NOT move (e.g. the operator answered but the D.12 delivery was never applied because R1's session died before it landed), the escape hatch supersedes the answer — the exact loss FR-010's own preamble ("preserves an answer the operator may have already given") says adoption avoids.

The auto.md § "reuse-answered" branches at D.n Step 0 also handle this shape: they record a partial `answered` entry, increment `answeredGateSweepCounter[gateId]` to `1`, and note "downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path". That relies on D.12 redelivery firing again for the adopted gate — which is unclear when the answer was given during a prior session that has now ended.

**Question**: When the sweep adopts a gate with `status: 'answered'`, how does the operator's already-given answer reach the current run's D.12 dispatch?

**Options**:
- A: **Escape hatch is sufficient** — adoption records the entry with `answeredGateSweepCounter[gateId] = 1` (matching the reuse-answered branch); D.12 redelivery is expected to fire and consume the answer; if it does not (label-based re-derivation catches the operator's post-answer label transition on the second or third sweep, OR the escape hatch supersedes on the third sweep). Accept that a genuinely-orphaned answer with no label transition is lost — same failure mode as today's reuse-answered path. Add an FR pinning the counter's initial value at `1` for adopted `answered` entries.
- B: **Adopt-time answer fetch** — the sweep calls a new/existing MCP surface to fetch the answer document at adopt time (e.g. `cockpit_gate_status` extended to return `answer` on `status: 'answered'`, or a dedicated `cockpit_gate_answer_fetch`) and synthesizes a D.12 event with `deliveryId` derived from the adoption event so redelivery dedup still works. Requires an upstream change; likely out of scope this phase (per spec's "no MCP schema changes" clause).
- C: **Force D.12 redelivery at adopt time** — the sweep issues a cloud call that triggers redelivery of the answer for the adopted `gateId` targeting the current run. Requires new cloud behaviour (per-adoption redelivery trigger); out of scope this phase.
- D: **Ack-superseded on adoption for `answered` (retreat from FR-010)** — treat adopted `answered` entries identically to no-adoption: ack `superseded` on the spot with detail `'adopted-answered — answer not carried across runs'`, delete, and rely on the current run's D.n Step-0 to draft fresh from current labels. Loses the answer but keeps `openGates` shape unambiguous. Adoption applies to `status: 'open'` only.
- E: Something else — please specify.

**Answer**: *Pending*

---

### Q4: Generation drift on adopted `open` gate

**Context**: `generation` for the four dispatch rows that map 1:1 onto a `gateType` (`clarification`, `artifact-review`, `implementation-review`, `manual-validation`) is derived per-gateType from live content the current run reads (a new PR head SHA increments `artifact-review` / `implementation-review` generation; an incremented escalation occurrence counter does the same for `escalation`; etc. — per `auto.md` § "Generation discriminator (UI mode)"). Between R1 (opened G1 at `generation: g1`) and R2 (the adoption sweep), that content may have moved: a new PR SHA landed, a phase advanced, a clarification answer-set was revised.

If R2's derivation yields `generation: g2` for the same `(issueRef, gateType)`, R2's sweep will draft a NATURAL gate at `g2` — which is a DIFFERENT natural decision than G1's `g1` gate (R1 was asking about content that no longer exists). This is exactly today's live-path § "generation-drift branch": ack G1 `superseded` + draft fresh at `g2`. But R2's ack of G1 must target R1's `runId` (per FR-003), and the ack path drops `runId` before the wire (`cockpit_gate_ack` targets an existing `gateId` per `auto.md` line 334), so the ack works regardless.

The spec is silent on whether the adoption path applies the drift branch. FR-002 says adopt when `(issueRef, gateType, generation)` matches; FR-009 asks the broader "adopt-anyway-or-skip" question but does not directly speak to drift. If drift is handled by adopting-then-superseding-then-drafting, the operator sees exactly one gate (the fresh `g2` one); if not handled, the operator sees G1 (stale, orphaned) and G2 (fresh) — the exact duplicate-inbox symptom this spec eliminates.

**Question**: When a prior-run gate matches on `(issueRef, gateType)` but the current run's derived `generation` differs, what does the adoption sweep do?

**Options**:
- A: **Ack-supersede-then-draft (mirror the live-path drift branch)** — for gateTypes that support the drift branch (`clarification`, `artifact-review`, `implementation-review`, `manual-validation`), the sweep acks the prior-run gate `superseded` (targeting the prior-run's `runId` per FR-003) with the same detail message the live-path uses, then drafts fresh at the current-run generation. For `gateType: 'escalation'`, the drift branch is DISABLED (per `auto.md` line 317; four dispatch rows share the one enum value); the prior-run escalation gate is left non-terminal and NOT adopted. Add an FR pinning the adoption-path drift behaviour and the escalation carve-out.
- B: **Adopt at prior generation** — the sweep adopts the prior-run gate as-is at its `g1` generation and does NOT draft a fresh `g2` gate. Rationale: the operator was already answering the `g1` decision; forcing them to re-answer at `g2` throws away in-flight work. Downside: R2's dispatch path may not recognize the `g1` decision as relevant to current state, and the answer to `g1` may not apply cleanly.
- C: **Skip the adoption (leave prior gate orphaned) and draft fresh** — the sweep sees the prior-run gate but does not adopt it (generation mismatch); drafts a fresh `g2` gate. Duplicate inbox symptom is reintroduced for the drift case only; the operator sees both G1 and G2. Rationale: keeps adoption path simple; the drift case is rare enough to tolerate.
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q5: `cockpit_gate_list` failure on the adoption path

**Context**: FR-001 mandates a `cockpit_gate_list` call per adoption pass; SC-004 asserts zero of those calls carry `runId`; SC-005 asserts zero fire under `--gates=local`. Neither the FR list nor the Success Criteria address what the sweep does when the call itself returns `status: 'error'` (network error, cloud unavailable, `invalid-args`, timeout).

Today's pre-flight capability probe (`auto.md` § "Pre-flight probe (UI mode)") has a four-branch classification with well-defined ledger rows and operator-facing failure lines; when the probe fails, the run either exits or downgrades to `local` per the probe's error class. The adoption pass runs AFTER the probe passes, so the write-side tools are known-good — but a transient cloud failure between the probe and the adoption pass is possible (the probe is at pre-flight; the adoption pass is at step-3 startup sweep; wall-clock separation is small but non-zero).

If the adoption pass hard-fails on `cockpit_gate_list` error, a transient cloud blip aborts the whole run. If it soft-fails (proceeds with empty adoption), the run drafts duplicates for every prior-run gate — the exact symptom this spec exists to fix. Silence lets the implementer decide; a hidden default of "throw uncaught" would abort the run without a ledger row.

**Question**: When `cockpit_gate_list` on the adoption path returns `status: 'error'`, what does the sweep do?

**Options**:
- A: **Hard-fail the run (Print + exit)** — treat this identically to the pre-flight probe's four-branch failure classes; print a verbatim error line naming the adoption-path call site; exit non-zero; write a ledger row for the failure. Rationale: the whole point of adoption is to eliminate duplicates; running without adoption after a `cockpit_gate_list` error silently reintroduces duplicates that the run's outcome then depends on nobody noticing. Add an FR pinning the failure line and ledger row.
- B: **Soft-fail (skip adoption, continue)** — write a ledger row noting adoption was skipped due to `cockpit_gate_list` error; proceed to the synthetic-event pass and the D.n Step-0 pre-draft checks. Duplicates ARE produced for any prior-run non-terminal gate. Rationale: keeps runs alive through transient cloud blips; the duplicate-inbox symptom is bounded to the specific run whose adoption pass failed.
- C: **Bounded retry, then hard-fail** — retry the `cockpit_gate_list` call with backoff (e.g. 3 attempts, 1s / 2s / 4s); on final failure, hard-fail per (A). Rationale: absorbs transient blips without silently downgrading. Requires pinning the retry policy in an FR.
- D: Something else — please specify (e.g. bounded retry then soft-fail; per-issue soft-fail so one child's failure doesn't abort the whole run).

**Answer**: *Pending*

---
