# Implementation Plan: D.12 foreign-run / out-of-scope gate-answer no-op guard

**Feature**: Make D.12 step 1 distinguish "no record, mine" (ack `superseded (no record)`) from "not mine" (foreign-run or out-of-scope delivery → logged no-op, no ack), pinned by the playbook-verification suite
**Branch**: `519-symptom-when-gate-answer`
**Status**: Complete
**Issue**: [generacy-ai/agency#519](https://github.com/generacy-ai/agency/issues/519)

## Summary

The doorbell's answers-file source is repo-scoped and replays history, so a
`/cockpit:auto` run routinely receives `gate-answer` events belonging to other
runs and other epics. `auto.md` D.12 step 1 currently instructs: no
`openGates` record → `cockpit_gate_ack(superseded, "no matching open record …")`.
Followed literally, run A supersedes run B's **live** gate and terminates
historical records (observed in production, `Painworth/doc-intel` 2026-09-02).

This change edits **one playbook** (`packages/claude-plugin-cockpit/commands/auto.md`)
and **one test file** (`tests/playbook-verification.test.ts`), plus a changeset:

1. **D.12 step 1 branch split** (FR-001/FR-003/FR-006): the guard lives ONLY
   inside the no-record branch (per clarification Q1 — a matching `openGates`
   record, current-run or adopted, always processes through steps 2–6). Inside
   the no-record branch: runId-mismatch → foreign-run no-op; in-scope-set miss →
   out-of-scope no-op; otherwise the existing `superseded (no record)` ack,
   byte-preserved. No-ops issue **no** `cockpit_gate_ack` and **no** downstream
   dispatch.
2. **`gateKey` parsing rules** (FR-002, per Q2): issue ref = prefix before the
   first `:`; runId segment detection is **shape-based, never positional**
   (trailing colon-free segment matched against the `<tracking-ref-slug>-<timestamp>`
   runId shape) because `generation` may contain colons. No runId segment →
   skip the runId comparison, apply only the in-scope check. RunId-mismatch is
   evaluated **before** out-of-scope.
3. **Ledger no-op rows** (FR-004, per Q3/Q4/Q5): exactly one four-column row
   per delivery (strict Invariant #8, no dedup across replays), shape
   `<gateKey-issue-ref> · — · gate-answer · <outcome> · source: ui-gate`, with
   two pinned outcome vocabularies:
   - `foreign-run delivery — not acked (owner run: <runId>)`
   - `out-of-scope delivery — not acked (issue: <issue-ref>)`
4. **Payload-shape doc update** (FR-005): D.12's `gateKey` field is documented
   as the composite `<owner>/<repo>#<issue>:<gateType>:<generation>[:<runId>]`,
   noting the trailing segment is absent for gates opened under
   `runIdEnabled === false` and that detection is shape-based.
5. **Pin tests** (FR-007): a new `519` describe block pins the two-way branch,
   both verbatim vocabularies, the evaluation order, the no-ack negative, the
   no-dedup rule, and the payload-shape doc — following the existing
   `extractSubheadingBlock(autoMd, "D.12 — \`gate-answer\`")` pattern.

No MCP tool implementation changes (spec § Assumptions); the source-side
doorbell scoping fix is out of scope (lands separately in this epic).

## Technical Context

- **Language**: Markdown playbook (`auto.md`) + TypeScript pin tests (Vitest)
- **Test command**: `pnpm test` in `packages/claude-plugin-cockpit` (`vitest run`)
- **Monorepo**: pnpm workspaces + changesets (baseBranch `develop`)
- **No runtime code** — deliverable is playbook prose, test assertions, changeset

### Key structural facts (verified against current `auto.md`)

- D.12 step 1 (auto.md:1098) is the sole no-record ack site; it uses the
  run-wide loop-state `runId` (pinned by test 471-16, which asserts positively
  the phrase "this call ALSO passes the run's pre-flight-derived `runId`
  verbatim" and negatively bans `openGates[...].runId` in the region matched by
  `/Look up record[^]*?superseded \(no record\) · source: ui-gate/`). The
  branch split MUST keep the retained ack text intact so 469-23 / 471-16 keep
  passing; the inserted no-op prose must not mention `openGates[event.gateId].runId`.
- D.12 Payload shape (auto.md:1087) currently documents `gateKey` as 3 segments;
  the composite-key-with-runId form already exists at auto.md:242 (V1 no-`:`
  invariant) — FR-005 aligns the D.12 doc with it.
- Run's `runId` is pre-flight-derived once (auto.md:232–246, compute-once V2);
  in-scope set derivation exists at auto.md § Adoption pass item 3
  (`[<epic-ref>] ++ epic.inScopeChildren` / `[<tracking-ref>] ++ taskListRefs`).
- Ledger vocabulary table (auto.md:1734–1778) and § Ledger Rule 2 UI-specific
  outcome list (auto.md:1800) enumerate D.12 outcomes — both need the two new
  no-op vocabularies; the D.12 **Ledger line** paragraph (auto.md:1129) needs
  them too.
- Invariant #8 ("a dispatch without a ledger line is a protocol violation",
  auto.md:1695–1699) already classifies any processed typed event as a
  dispatch — the no-op row satisfies it; no invariant text change needed.
- CLAUDE.md pin contract: breaking pins must be re-pinned to the new contract
  in the same PR, never weakened. The step-1 edit is designed to NOT break
  existing pins (469-23, 471-16, 449-13) — verified by running the suite.

## Design: new D.12 step 1 text (contract)

Step 1 becomes a lookup followed by a three-way no-record branch:

```
1. Look up record: record = openGates[event.gateId].
   If PRESENT (current-run or adopted) → proceed to steps 2–6 unchanged; the
   foreign-run / out-of-scope guard below NEVER pre-empts a record match.
   If ABSENT, classify the delivery before acking:
   a. Parse the gateKey: the issue ref is the prefix before the FIRST `:`;
      the runId segment, when present, is the TRAILING colon-free segment
      matching the runId shape (<tracking-ref-slug>-<timestamp>). Detection is
      shape-based, NOT positional — generation may itself contain colons.
   b. Foreign-run check (evaluated FIRST): gateKey carries a runId segment AND
      segment ≠ this run's pre-flight-derived runId → logged no-op. No
      cockpit_gate_ack (no outcome of any kind), no downstream dispatch.
      Ledger row (one per delivery, replays NOT deduped):
      <gateKey-issue-ref> · — · gate-answer · foreign-run delivery — not acked (owner run: <runId>) · source: ui-gate
   c. Out-of-scope check: gateKey issue ref ∉ this run's in-scope set →
      logged no-op, same no-ack / no-dispatch rule. Ledger row:
      <gateKey-issue-ref> · — · gate-answer · out-of-scope delivery — not acked (issue: <issue-ref>) · source: ui-gate
   d. Otherwise (same-run or no-runId-segment, in-scope): existing ack,
      byte-preserved — cockpit_gate_ack(gateId, outcome: "superseded",
      detail: "no matching open record — likely startup-race or duplicate
      delivery") with the existing runId-threading prose and the existing
      ledger row `… · superseded (no record) · source: ui-gate`.
```

See `contracts/d12-noop-guard.md` for the full branch table and pinned strings.

## Project Structure (files touched)

```
packages/claude-plugin-cockpit/commands/auto.md                    # D.12 step 1 split (FR-001/002/003/006), payload shape (FR-005),
                                                                   # ledger vocab table + Rule 2 + D.12 Ledger line (FR-004)
packages/claude-plugin-cockpit/tests/playbook-verification.test.ts # new 519-* pins (FR-007)
.changeset/<name>.md                                               # patch bump @generacy-ai/claude-plugin-cockpit
```

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo. Governing contract is
the CLAUDE.md playbook-pin rule (re-pin, never weaken) — honored: this change
adds pins and preserves all existing D.12 pins.

## Risks / edge cases carried into tasks

- Existing pin 471-16's region regex ends at the FIRST
  `superseded (no record) · source: ui-gate` occurrence; the retained ack
  branch (d) must remain inside the step-1 block and the no-op branches must
  not introduce that literal earlier with `openGates[...].runId` prose nearby.
- Test 449-13 requires the `### D.12 — \`gate-answer\`` heading unchanged and
  V3/V4 coverage — the step-2–6 text is untouched.
- The no-op ledger `<issue-ref>` slot is the gateKey-parsed issue ref (the
  record does not exist), distinct from every other D.12 row which reads
  `openGates[gateId].issueRef` — the Payload-shape note at auto.md:1094 gains a
  sentence for the no-op case.
