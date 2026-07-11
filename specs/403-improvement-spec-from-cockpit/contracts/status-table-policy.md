# Contract: Status table emission restricted to phase boundaries

**Applies to**: `packages/claude-plugin-cockpit/commands/auto.md` new § Ledger L.4 "Status table policy" subsection; `tests/playbook-verification.test.ts` assertion 403-7.

## Contract statement

**The full epic status table is emitted only at four surfaces**:

1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
3. **Escalation-gate presentations** (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) — the operator needs orientation before an escalation decision.
4. **Startup-sweep summary** (step 3) — session-start orientation is a real operator need; every resumed run starts with "where are things?". The sweep ends with exactly one full status table, then enters the main loop.

**Between phase boundaries, the ledger line is the sole record of a dispatch.** No status table is emitted after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the four surfaces above.

## Status table anchor

The 403-7 assertion needs a stable anchor to distinguish "this section has a full epic status table" from "this section has some other table". The anchor is the header row of the full epic status table:

```text
| Issue | Phase | State |
```

This is the substring the assertion greps for; any occurrence outside the four permitted surfaces is a failure.

Rationale for anchor choice:

- **Unique to the full epic status table**. Other tables in `auto.md` use different column tuples:
  - Dispatch table: `| # | Event | Action shape |`.
  - Findings table (G.2): `| # | File:line | Finding | Blocking? |`.
  - Ledger vocabulary table: `| Dispatch row | \`<action>\` | \`<outcome>\` (examples) |`.
  - Escalation gate options table (G.4): `| Subtype | Options |`.
- **Stable across reformatting**. A rewrite that reorders the columns fails the assertion — but this is a semantic change worth catching. A rewrite that renames a column also fails; also a semantic change worth catching.
- **Grep-friendly**. Single-line substring, no multiline regex needed.

## Prose shape

New § Ledger L.4 subsection (inserted after the vocabulary table, before L.5 idempotency rule):

```markdown
### L.4 — Status table policy

The full epic status table (anchor: header row `| Issue | Phase | State |`) is emitted **only** at the following surfaces:

1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
3. **Escalation-gate presentations** (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) — the operator needs orientation before an escalation decision.
4. **Startup-sweep summary** (step 3) — session-start orientation is a real operator need; every resumed run starts with "where are things?". The sweep ends with exactly one full status table, then enters the main loop.

Between phase boundaries, the ledger line is the sole record of a dispatch. No status table is emitted after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the four surfaces above.
```

## Preserved (unchanged from the current playbook)

- **The mandatory ledger line per dispatch** (§ Ledger L.5). Every dispatch — including those in the four permitted status-table surfaces — writes exactly one ledger line to both the transcript and the `.ledger` file.
- **The idempotency rule** (§ Ledger L.5). Startup sweep + live-state re-check guarantee that `cockpit watch` re-spawn produces no duplicate action.
- **The startup sweep behavior** (step 3). The sweep still dispatches every D.1–D.9 issue one-by-one as synthetic events. The only change is that the sweep now ends with a status table, which is added to the permitted-surfaces list.
- **The run summary at exit** (§ Ledger L.6). The run-summary paragraph is unchanged; it's included in the permitted surfaces list because it precedes the status table on epic-complete exit.

## Rationale for each permitted surface

- **Surface 1 (D.8 / G.5 phase-complete)**: The operator is about to confirm queueing the next phase; a status table shows the current phase's completion state and any lingering issues. Prevents "I confirmed queue P2 but I didn't realize P1 had a stuck issue".
- **Surface 2 (step 6 / L.6 epic-complete)**: The operator is receiving the final run summary; a status table shows the terminal state of every issue (including any that were session-muted). The last thing the operator sees.
- **Surface 3 (G.4 escalation gates)**: The operator is about to make an escalation decision (Retry / Skip / Stop, Requeue / Skip / Stop, I've-resolved-it / Skip / Stop, etc.); a status table shows the epic-wide context so the decision is informed. Prevents "I skipped this issue but I didn't realize it was the last issue in P3 and skipping means the epic hangs".
- **Surface 4 (step 3 startup sweep)**: The operator is re-entering the auto session; a status table shows "where are things?" so they can decide whether to intervene before the loop starts. Explicitly permitted per Q5=B.

## Rejected

- **Startup sweep ends without a table** (Q5=A rejected). Sends the operator to file archaeology at the moment they most need a picture.
- **Startup sweep emits a one-line summary** (Q5=C rejected). Spends a turn to convey almost nothing; operator would follow up with `cockpit status`, defeating the compression.
- **Startup sweep table conditional on zero actionable dispatches** (Q5=D rejected). Adds a conditional presentation rule where the current shape is unconditional.
- **Status table on every dispatch** (current behavior; rejected). This is the ~30 tables per run cost the fix removes.

## Test coverage

- **403-7**: Section-scan of `commands/auto.md`. For each `##` and `###` section, grep for the anchor substring `| Issue | Phase | State |`. Assert the anchor appears only in sections whose heading matches one of the four permitted surfaces:
  - `### D.8 — \`phase-complete\` → phase-queue confirmation gate` (surface 1).
  - `### L.6 — Run summary at exit` and any surrounding step-6 prose (surface 2).
  - `### G.4 — Escalation gate (three subtypes)` (surface 3 — covers G.4a, G.4b, G.4c, G.4d).
  - The startup-sweep summary section (step 3 prose, or a dedicated subsection if the plan chooses to name it explicitly).

  Any occurrence outside these is a failure with the section name in the error message.

Additional grep check (in `quickstart.md § Static checks`): the anchor substring MUST appear at least once in `commands/auto.md` — its complete absence would indicate the plan's presentation of the table was omitted entirely, a different regression.

## True verifier

Transcript grep on a comparable 12-issue epic run: count status-table anchor occurrences in the parent transcript; assert the count matches (number of `phase-complete` dispatches) + (1 for epic-complete exit) + (number of escalation-gate presentations) + (1 for the startup-sweep summary). Adherence target: 0 status tables emitted between phase boundaries other than escalation gates and the startup-sweep summary. SC-003.
