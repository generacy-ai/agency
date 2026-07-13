# Implementation Plan: Migrate cockpit playbooks from CLI verbs to #917 MCP tools + `cockpit_await_events` long-poll loop

**Feature**: Migrate `auto.md` (and every other cockpit playbook that invokes the six migrated verbs) from Bash + `generacy cockpit <verb>` to the shipped #917 MCP tools, and replace `auto.md`'s Monitor/watch-NDJSON event plumbing with a `cockpit_await_events` long-poll loop.
**Branch**: `406-follow-up-generacy-ai`
**Date**: 2026-07-11
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the second half of the cockpit v1.5 auto-mode efficiency workstream. #403 cut per-event cost (D.9/D.9d ledger-only rows are free by contract, D.9d prefix-match retired D.10 misfires on `phase:*`, D.7/D.11 diagnosis moved to subagents, status-table policy restricted to four surfaces, invariant §8 locked the cost contract). #406 cuts event-delivery **turn count** — the ≥2× dispatch-round reduction target (SC-003) — and eliminates the two turn classes that couldn't be fixed by prose alone: CLI syntax-negotiation/re-parse turns (#398/#906 lineage) and per-event `Monitor`-driven dispatch rounds.

**Migration is playbook-prose-only in this repo — no runtime code moves.** Every occurrence of `generacy cockpit <verb>` in the six in-scope playbooks (see Change #6 below) becomes the matching `cockpit_*` MCP tool call. The tool server lives on the cluster side (shipped in generacy#917; runtime-registered per cluster-base#75, still landing); this branch ships the playbook contract that the tool server binds to.

The auto-mode event loop's Bash-`run_in_background` `cockpit watch` + Monitor tool primitive (step 2, step 4's stream reader, step 5's watch re-arm and liveness cross-check) is replaced end-to-end with a `cockpit_await_events` long-poll: one call → one batch (soft-cap `maxBatchSize=256`, `maxWaitMs=55000`, `coalesceWindowMs=3000` per #917 defaults) → one dispatch round → events processed in stream order within the round. **Cursor is in-memory only** for the current dispatch loop; a new session starts cursor-less and runs the startup sweep (Q2 clarification: live state is authoritative and subsumes any missed-event replay — no on-disk cursor, no ledger re-derivation). Session restart, `invalid-cursor` typed error (fail loud — caller bug), `resetFrom` reset signal, and cursor expiry all converge on the same recovery path: run the startup sweep, then re-arm cursor-less from connect-time position.

**Six in-scope playbooks** (Q4 clarification — every playbook that invokes any of the six migrated verbs, enumerated by grep):

| Playbook | Verb-migration | Event-loop swap |
|----------|----------------|-----------------|
| `auto.md` | all six verbs (status, context, queue, advance, resume, merge) | **yes** — Monitor + `cockpit watch` → `cockpit_await_events` long-poll |
| `clarify.md` | context, advance | no |
| `review.md` | context, advance | no |
| `merge.md` | merge | no |
| `queue.md` | queue | no |
| `status.md` | status | no |

**Explicitly not migrated**: `watch.md`. Its verb (`watch`) isn't among the six; the NDJSON stream remains the human/script surface per generacy#917's out-of-scope note. The `watch` verb continues as a Bash invocation. Zero edits to `watch.md`.

**Typed refs replace string refs.** The tool layer's schema rejects malformed refs with a typed error (Assumption A2) — no engine round-trip, no diagnosis turn. The PR-number-as-issue class (agency#398) becomes a schema error surfaced at the tool boundary, not a `cockpit status` regurgitation the playbook has to parse. Prose that used to re-wrap CLI errors ("if stderr matches /auth|unauthorized/", the three-class MISSING_BINARY/AUTH_FAILURE/OTHER block) is retired on migrated call sites — tool errors surface as typed errors with structured fields, not stderr lines to regex-match. **The three-class Error handling block remains** in each playbook to cover the remaining non-migrated CLI verbs (`gh issue comment`, `gh pr diff`, `gh api`, `git`) and the residual pre-flight for the `watch` verb in `watch.md`; the block's `MISSING_BINARY` clause is generalized from "the `generacy` CLI" wording to "a required CLI (`generacy` for `watch`, `gh`/`git` elsewhere)" so it stays applicable.

**Fail-loud on missing tools** (Q1 clarification, Q5 clarification): at the top of the startup sweep, the session verifies the `cockpit_*` tools are present before dispatching anything. On absence, it writes a ledger line in the agency#403 shape (`startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`), prints the guidance ("cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75"), and ends the run. **No `AskUserQuestion` prompt** (the operator can do nothing in-session about missing registration; the gate contract enumerates four question kinds, a fifth for this would be a prompt whose every option means "abort"). **No CLI fallback**, no plugin-version-bump gating (Q1=B: version-bump isn't enforceable — the plugin version and the cluster-base template version are uncoordinated artifacts; existing clusters can't gain registration via `generacy update`, only a rebuild picks up cluster-base#75, and the current fleet is dev-stage test clusters that rebuild frequently).

**Audit-suite migration.** The CLI-invocation drift audit (`398-1`: `--help`-snapshot comparison against playbook invocations) retires for the six migrated verbs. It is replaced with a **tool-contract audit** — every `cockpit_*` tool call in a migrated playbook names a tool and parameters that exist in the #917 schema exports. `refresh-help-snapshots.sh` is retained (still needed for the `watch` verb, which the audit for `watch.md` will exercise); the audit's verb filter shrinks to `watch` only. The § AskUserQuestion invocation contract audit (#402) is unaffected. The tool-contract audit is playbook-prose greps + a small reference "tool-call classifier" in the test file, per the #398/#403 static+behavioral pattern — no new library module.

**Cost-contract preservation.** #403's D.9/D.9d ledger-only rows stay cheap by contract. A batch containing only ledger-only events is one ledger append and nothing else — no per-event `cockpit_status` re-check (§ Invariants #8, retained verbatim). The batch's ledger-only events do not each independently re-check live state; the batch as a whole is the dispatch unit for cost-contract purposes.

**Explicitly unchanged.** The G.1–G.5 gate contracts (option sets, presentation blocks, `AskUserQuestion` invocation contract). The D.7/D.11 diagnosis subagent contract (#403). The D.9/D.9a/D.9b/D.9c/D.9d ledger-only rule (§ Invariants #8). The § Ledger `<issue-ref> · <transition-class> · <action> · <outcome>` format and the mandatory-per-dispatch rule. Invariants §1–§8 keep their numbers; a new §9 is added at the end (see Change 6). `watch.md` byte-identical on this branch. `lib/gate-vocabulary.ts`, `lib/clarification-batch-parser.ts`, `lib/reference-consumption.ts` byte-identical.

**Six edits per migrated playbook, one event-loop rewrite in `auto.md`, one audit swap in the test file, one new §9 in `auto.md`'s Invariants:**

1. **Verb-to-tool migration in the six playbooks** — every `generacy cockpit <verb>` invocation becomes the matching `cockpit_*` MCP tool call. Full mapping in [contracts/mcp-tool-migration.md](./contracts/mcp-tool-migration.md).
2. **`auto.md` step 2 rewrite** — retire the `generacy cockpit watch <epic-ref>` background spawn; the initial state is cursor-less (no process to spawn, no handle to capture).
3. **`auto.md` step 4 rewrite** — retire the Bash-run `cockpit watch` stream reader (unfiltered-line consumption, 30-second bounded read, N=4 empty-read counter, watch-process-alive check). Replace with a `cockpit_await_events` call per iteration: batch → dispatch in stream order → advance cursor → next call.
4. **`auto.md` step 5 rewrite** — retire the process-death re-arm branch and the liveness cross-check (compound predicate on N=4 empty reads + actionable live state). Replace with `invalid-cursor`/`resetFrom`/cursor-expiry recovery: run the startup sweep, re-arm cursor-less from connect-time position.
5. **`auto.md` startup sweep (step 3) — add tool-presence check.** Verify `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events` tools are present before dispatching anything. On absence: ledger line `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`, print guidance, exit non-zero. No `AskUserQuestion`.
6. **`auto.md` § Invariants — add §9.** MCP-tool-only invariant: after the migration, no `generacy cockpit <migrated-verb>` Bash invocation appears in `auto.md`. Numbered §9, immediately after §8, no renumbering.

**Test suite changes** (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`):

- **Retire 398-1's coverage of the six migrated verbs.** The known-verb list narrows to `watch` (the only remaining CLI-invoked verb). 398-2's regression fixture on `398-drift-auto.md` is retained (the D.5 merge drift is a historical instance the fixture still exercises; the audit shape hasn't changed).
- **New `describe("406 — cockpit MCP tool migration + await-events loop", …)` block** with seven new assertions (406-1 through 406-7, matching FR anchors in [data-model.md](./data-model.md) § Assertion index):
  - **406-1** (tool-contract audit): every `cockpit_*` tool call in migrated playbooks names a tool and parameter shape from the #917 schema exports. Fixture: `406-tool-schemas.json` (a captured snapshot of the seven `cockpit_*` tool definitions — see [contracts/mcp-tool-migration.md](./contracts/mcp-tool-migration.md) for the schema shape).
  - **406-2** (no residual CLI verb): grep `commands/{auto,clarify,review,merge,queue,status}.md` for `generacy cockpit <verb>` where `<verb>` ∈ the six migrated verbs; zero matches. `watch.md` retains `generacy cockpit watch`.
  - **406-3** (auto.md `cockpit_await_events` loop): step 4 prose contains `cockpit_await_events` as the sole event-consumption verb; the `run_in_background: true` `cockpit watch` spawn is absent from step 2; the Monitor tool primitive is absent from step 4.
  - **406-4** (cursor is in-memory): step 4/5 prose mandates the cursor is in-memory only; no on-disk cursor file (no `.cockpit/cursor.json`-shape mention); on `invalid-cursor`/`resetFrom`/cursor expiry, the recovery is the startup sweep + re-arm cursor-less (positive greppable substring).
  - **406-5** (startup sweep tool-presence check): step 3 prose mandates the tool-presence verify + ledger-line-on-absence contract; the ledger line format `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` appears verbatim; no `AskUserQuestion` is triggered on absence (the fail path is ledger+print+exit only).
  - **406-6** (invariant §9): § Invariants section contains exactly nine numbered items (§1–§9); §9's opening substring is `After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form —` (positive anchor; the load-bearing rule a future rewrite has to survive).
  - **406-7** (typed-ref error shape): a malformed ref passed to a `cockpit_*` tool produces a typed error (schema validation failure) — assertion is fixture-driven with `406-malformed-ref-input.json` and `406-malformed-ref-expected-error.json`; the reference tool-call classifier's error-mapping preserves the typed error's `code`/`message` fields verbatim (does not re-wrap them as CLI stderr).
- **Retire 398-1's coverage** (the `--help`-snapshot audit) for the six migrated verbs. The audit's verb list narrows to `["watch"]`; the snapshot file for `watch.md` is retained. Note in test comment: "post-#406 the drift audit only covers the `watch` verb; the other six moved to the 406-1 tool-contract audit."

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime; also grep-audited by the test file); TypeScript (Vitest) for the reference tool-call classifier + assertions. No runtime code changes to `lib/*.ts`.

**Primary Dependencies**: No new runtime dependencies. Existing runtime: Claude Code slash-command executor + MCP tool binding (registration owned by cluster-base#75, not this branch). The seven `cockpit_*` tools are:

| Tool | Displaces CLI verb | Params (per generacy#917 schema) |
|------|--------------------|-----------------------------------|
| `cockpit_status` | `generacy cockpit status --json <epic-ref>` | `{ epic: string \| null, json?: boolean }` |
| `cockpit_context` | `generacy cockpit context <issue>` | `{ issue: string }` |
| `cockpit_queue` | `generacy cockpit queue <epic-ref> <phase> --yes` | `{ epic: string, phase: string }` |
| `cockpit_advance` | `generacy cockpit advance --gate <name> <issue-ref>` | `{ issue: string, gate: string }` |
| `cockpit_resume` | `generacy cockpit resume <issue-ref>` | `{ issue: string }` |
| `cockpit_merge` | `generacy cockpit merge <issue>` | `{ issue: string }` |
| `cockpit_await_events` | (net-new — replaces Monitor + `cockpit watch`) | `{ epic: string, cursor?: string \| null, maxWaitMs?: number, coalesceWindowMs?: number, maxBatchSize?: number }` |

The tool schemas are defined by generacy#917 and exported as JSON schema; the audit (406-1) validates the playbook against a captured snapshot. On the test side: Vitest — already a dev-dep in `packages/claude-plugin-cockpit/package.json` (#394 introduced, extended by #396/#398/#400/#402/#403).

**Storage**: Filesystem — six playbook files edited (`packages/claude-plugin-cockpit/commands/{auto,clarify,review,merge,queue,status}.md`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, adding the `406 —` describe block, narrowing 398-1's verb list); three new fixtures under `packages/claude-plugin-cockpit/tests/fixtures/`:

- `406-tool-schemas.json` — snapshot of the seven `cockpit_*` tool definitions (name + parameter schema keys + required fields).
- `406-malformed-ref-input.json` — a malformed issue-ref payload for the typed-ref-error test.
- `406-malformed-ref-expected-error.json` — the expected typed-error shape (`{ code: "invalid-ref", message: "…", details: {…} }`).

No new library module. The tool-call classifier + typed-error parser live inline in the test file (matches the `dispatchClassifier` at `tests/playbook-verification.test.ts:187` and the `parseVerdict` at the 403 describe block). No changes to `watch.md`, `lib/*.ts`, or the `refresh-help-snapshots.sh` script.

**Testing**:

- **Static** (necessary but proven insufficient by the #384–#403 arc — static-only fails at behavioral drift): greps on migrated playbooks for the presence of `cockpit_<verb>` tool-name strings (positive signal); greps for the absence of `generacy cockpit <migrated-verb>` Bash forms (negative signal — the smoking-gun for un-migrated call sites); grep on `auto.md` for `cockpit_await_events` (positive signal — the event-consumption verb); grep on `auto.md` for the ledger-line format `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` (positive signal — the tool-presence contract); grep on `watch.md` for `generacy cockpit watch` (positive signal — `watch` verb preservation); grep on `auto.md` for the invariant §9 opening substring; grep asserting no on-disk cursor path (`.cockpit/cursor.json`, `state/cursor`, or similar) appears in `auto.md` (negative signal — cursor is in-memory only).
- **Behavioral**: seven new assertions in the `describe("406 —", …)` block (406-1 through 406-7 above). Fixture-driven where possible (`406-tool-schemas.json` for the tool-contract audit; `406-malformed-ref-*.json` for the typed-error handling).
- **True verifier**: an operator-run of `/cockpit:auto` on a comparable 12-issue epic after cluster-base#75 lands. Adherence targets: **on a 12-issue epic, ≤ ~50 `cockpit_await_events` calls that returned ≥1 event** (SC-003, ≥2× reduction versus the snappoll run-7 baseline of ~100 watch-derived events consumed as separate dispatch rounds); zero Bash `generacy cockpit <migrated-verb>` invocations in the transcript (SC-001); typed-ref errors surface at the tool boundary with actionable guidance and zero engine round-trips (SC-004); tool-presence check fires and ledger line + guidance appear correctly on a cluster without registration (SC-005 startup path). Empirical confirmation is the true verifier; the greps + tool-contract audit + fixture assertions are the machine-checkable backstop against silent regression.

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed and the cluster has cockpit MCP tools registered — post cluster-base#75). Vitest runs in Node.js (repository-standard).

**Project Type**: Single-package playbook edits + one suite extension. No cross-package changes. **Cross-repo dependency**: cluster-base#75 must land before this branch's `auto.md` can run end-to-end (a cluster without registration hard-fails at startup with the tool-presence guidance — that IS the contract, not a bug). This branch is safe to merge before cluster-base#75 in principle; it will hard-fail loudly with actionable guidance until the cluster is rebuilt. Per Q1 clarification (option B), no gating shim is added — the fleet is dev-stage test clusters that rebuild frequently.

**Performance Goals**: See spec § Success criteria (SC-001 zero Bash cockpit CLI calls in the transcript; SC-003 ≤ ~50 event-consuming dispatch rounds per 12-issue epic; SC-005 tool-contract audit shows zero drift on migrated playbooks). No per-tool latency targets — the tool server (generacy#917) owns those; this branch consumes them.

**Constraints**:

- **`watch.md` is untouched.** Its verb (`watch`) isn't among the six; the NDJSON stream remains the human/script surface per generacy#917's out-of-scope note. Any edit to `watch.md` on this branch is a scope violation.
- **`lib/*.ts` is untouched.** No runtime code change. The tool-call classifier + typed-error parser live inline in the test file — matches the reference-in-test-file pattern from #396 (`dispatchClassifier`) and #403 (`parseVerdict`). If future findings need a runtime-callable version, that's a follow-up.
- **The G.1–G.5 gate contracts are untouched.** Option sets, presentation blocks, and the § AskUserQuestion invocation contract (from #402) are preserved verbatim. The migration replaces the underlying CLI verb inside each gate's post-verdict step — the operator surface is byte-identical.
- **The D.7/D.11 diagnosis subagent contract (from #403) is untouched.** The subagent still returns `{root_cause, evidence, recommended_action, confidence}`; the `recommended_action` string set is unchanged. The migration only changes what the parent does with the `Requeue` / `Advance` verdicts (calls `cockpit_resume` / `cockpit_advance` MCP tools instead of Bash-CLI).
- **The § Invariants #7 unfiltered-stream rule (from #394) is subsumed, not violated.** `cockpit_await_events`'s return is a **batch of typed events**, not an NDJSON stream. The unfiltered-stream rule applied to a text-stream consumption boundary that no longer exists in `auto.md`. Its intent — no content-based filtering that could silently drop legitimate events — is preserved by consuming every event in the returned batch in stream order (no field- or shape-based filter over the batch elements). Invariant §7 stays in the invariants list; its prose is annotated to note the migrated event-consumption boundary. (The `watch` verb, still used by `watch.md`, continues to require unfiltered NDJSON consumption per §7's original scope.)
- **The § Invariants #8 cost contract (from #403) is preserved.** Ledger-only rows still perform exactly the ledger append and nothing else. A batch containing only ledger-only events is one ledger append per event (mandatory-per-dispatch rule; see § Ledger L.5) and zero other tool calls — no per-event `cockpit_status` re-check. The batch as a whole is the dispatch unit for cost-contract purposes; batch-level accounting does not violate §8.
- **The § Invariants #1–§6 rules survive** — never merge on red, cockpit-marked comments, add-only advance, no cross-slash-command invocation, analysis-in-subagents, autonomy-out-of-scope. The migration replaces the CLI mechanism under each; it does not change any of the rules themselves.
- **The startup-sweep summary is preserved.** The § Ledger L.4 status table policy (from #403) says the sweep ends with exactly one full status table. This still holds — the migration replaces `cockpit status --json` with `cockpit_status(epic, json=true)`; the resulting status table is presented identically. On tool-presence failure, the sweep does NOT reach the summary step (it exits after the ledger line + guidance print).
- **The three-class Error handling block (`MISSING_BINARY` / `AUTH_FAILURE` / `OTHER`) is retained** in every playbook where any Bash CLI invocation remains (which is every migrated playbook — `gh issue comment`, `gh pr diff`, `gh api`, `git`, and the `watch` verb in `watch.md`). Its `MISSING_BINARY` clause is generalized from "the `generacy` CLI" wording to name the specific CLI the pre-flight was checking. Tool-side errors go through the typed-error surface, not this block.
- **The cursor is in-memory only.** Explicitly forbidden: any file-system persistence of the cursor (Q2=D — no `.cockpit/cursor.json`, no `.generacy/cockpit/cursor`, no ledger re-derivation). Recovery paths converge on the startup sweep.
- **Scope boundary**: `commands/{auto,clarify,review,merge,queue,status}.md` (verb migration + error-block generalization); `commands/auto.md` (event-loop rewrite + tool-presence check + invariant §9); `tests/playbook-verification.test.ts` (extended with the `406 —` describe block, 398-1's verb list narrowed); three new fixture files under `tests/fixtures/`. `commands/watch.md`, `lib/*.ts`, `scripts/refresh-help-snapshots.sh`, historical spec directories, and the `398-drift-auto.md` / `402-drift-auto.md` fixtures are untouched.
- **New invariant §9, no renumbering.** §1–§8 keep their existing numbers; §9 is added at the end (matches #403's additive-numbering pattern for §8).

**Scale/Scope**: Six files edited (net added lines):

- `auto.md` (~120-180 net added/changed lines — step 2 shrink ~15 lines removed, step 3 tool-presence-check prose ~15 added, step 4 rewrite (~80 lines: retire ~40 lines of stream/Monitor/30-second-read prose; add ~40 lines of `cockpit_await_events` loop prose), step 5 rewrite (~30 lines net: retire ~40 lines of watch-process-death + liveness cross-check; add ~30 lines of cursor-recovery prose), all `generacy cockpit <verb>` sites in dispatch tables + ledger-vocabulary + examples updated (~40 lines edited in place, near-zero net), new §9 invariant ~4 lines).
- `clarify.md` (~5-10 net edited lines — step 3 `generacy cockpit context <issue>` → `cockpit_context(issue)`; step 7 `generacy cockpit advance --gate clarification <issue-ref>` → `cockpit_advance(issue, gate="clarification")`; error-block `MISSING_BINARY` clause generalized).
- `review.md` (~10-15 net edited lines — step 4 `generacy cockpit advance --gate <name>` → `cockpit_advance(issue, gate=<name>)`; error-block generalized; the code-review subagent prompt's `gh pr diff` reference is UNCHANGED — the subagent still fetches its own diff, not via the MCP tool).
- `merge.md` (~10-15 net edited lines — step 4 `generacy cockpit merge <issue>` → `cockpit_merge(issue)`; result-shape decision tree preserved (result field names come from the tool's return, not the CLI's stdout — schema-compatible with the CLI's JSON); error-block generalized).
- `queue.md` (~10-15 net edited lines — step 4 `generacy cockpit queue <epic-ref> <phase> --yes` → `cockpit_queue(epic, phase)` (the `--yes` flag is retired — the tool has no interactive confirm); error-block generalized).
- `status.md` (~10-15 net edited lines — step 3 `generacy cockpit status <epic-ref>` → `cockpit_status(epic)`; the "print the CLI's stdout verbatim" contract becomes "render the tool's return payload — the tool returns structured data, so the renderer converts to the same dashboard layout the CLI used"; error-block generalized).

One test file extended: `tests/playbook-verification.test.ts` (~200-250 net added lines — one new `describe` block with seven assertions + fixture reads + inline tool-call classifier + typed-error parser). 398-1's verb list narrowed (~5 lines changed). Three new fixture files under `tests/fixtures/` (each ~10-40 lines JSON). Zero files deleted, zero files renamed. No changes to `lib/*.ts` or `watch.md`.

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #403 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/406-follow-up-generacy-ai/
├── spec.md                                # Feature spec (read-only)
├── clarifications.md                      # Q1–Q5 with resolved answers (read-only)
├── plan.md                                # THIS FILE
├── research.md                            # Design decisions and rationale (Phase 0)
├── data-model.md                          # Types: ToolCall, ToolSchema, CursorState, TypedError; assertion index; pre/post playbook surface changes
├── quickstart.md                          # Verification runbook (static grep + Vitest suite + operator smoke-test one-liner)
├── contracts/
│   ├── mcp-tool-migration.md              # Contract: verb-to-tool mapping; parameter shapes; typed-ref-error surface
│   ├── cockpit-await-events-loop.md       # Contract: long-poll loop shape; cursor lifecycle (in-memory only); recovery paths
│   ├── fail-loud-tools-missing.md         # Contract: startup-sweep tool-presence check; ledger-line format; no-AskUserQuestion rule
│   └── tool-contract-audit.md             # Contract: 406-1 audit shape; #917 schema-export consumption; 398-1 verb list narrowing
├── checklists/                            # (empty — reserved for /checklist skill)
├── conversation-log.jsonl                 # (append-only spec/clarify audit trail)
└── tasks.md                               # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                            # MODIFIED — step 2 rewrite (retire cockpit watch background spawn), step 3 tool-presence check, step 4 rewrite (cockpit_await_events loop), step 5 rewrite (cursor-recovery), all six verbs migrated to cockpit_* tool calls across § Dispatch / § Gate contract / § Ledger / § Examples, § Invariants §9 added
│   ├── clarify.md                         # MODIFIED — step 3 cockpit context → cockpit_context, step 7 cockpit advance → cockpit_advance, error-block generalized
│   ├── merge.md                           # MODIFIED — step 4 cockpit merge → cockpit_merge, result-shape decision tree preserved, error-block generalized
│   ├── queue.md                           # MODIFIED — step 4 cockpit queue → cockpit_queue (--yes retired), error-block generalized
│   ├── review.md                          # MODIFIED — step 4 cockpit advance → cockpit_advance, error-block generalized
│   ├── status.md                          # MODIFIED — step 3 cockpit status → cockpit_status, verbatim-stdout contract adapted for structured return, error-block generalized
│   └── watch.md                           # UNCHANGED — watch verb explicitly not migrated (generacy#917 out-of-scope), byte-identical
├── lib/
│   ├── reference-consumption.ts           # UNCHANGED — created by #394
│   ├── gate-vocabulary.ts                 # UNCHANGED — created by #396
│   └── clarification-batch-parser.ts      # UNCHANGED — created by #400
├── scripts/
│   └── refresh-help-snapshots.sh          # UNCHANGED — still needed for the watch verb; the script's `grep -hoE 'generacy cockpit [a-z][a-z-]*'` line will find only `watch` post-migration, which is the intended outcome
└── tests/
    ├── playbook-verification.test.ts      # EXTENDED — new describe("406 — …") block with 406-1 through 406-7 + inline tool-call classifier + typed-error parser; 398-1's known-verb list narrowed to ["watch"]
    └── fixtures/
        ├── (all pre-#406 fixtures)         # UNCHANGED — 394-* / 396-* / 398-* / 400-* / 402-* / 403-* fixtures byte-identical
        ├── help-snapshots/                # UNCHANGED — snapshot for `watch` retained; six migrated verbs' snapshot files retained for the 398-2 regression fixture but no longer consulted by 398-1
        ├── 406-tool-schemas.json           # NEW — snapshot of the seven cockpit_* tool definitions (name + parameter schema keys + required fields; exported from generacy#917's schema)
        ├── 406-malformed-ref-input.json    # NEW — a malformed issue-ref payload (e.g., PR number as issue, or missing owner/repo prefix) for the typed-ref-error test
        └── 406-malformed-ref-expected-error.json  # NEW — the expected typed-error shape ({ code: "invalid-ref", message: "…", details: {…} })
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
└── watch.md      # `watch` verb explicitly not migrated — untouched

packages/claude-plugin-cockpit/lib/
├── reference-consumption.ts
├── gate-vocabulary.ts
└── clarification-batch-parser.ts

packages/claude-plugin-cockpit/scripts/
└── refresh-help-snapshots.sh   # still needed for `watch` snapshot refresh
```

Historical artifacts (deliberately untouched):

```text
specs/384-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/396-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/398-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/400-operator-requested-ux/              # Status: Complete; byte-identical
specs/402-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/403-improvement-spec-from-cockpit/      # Status: Complete; byte-identical
```

**Structure Decision**: Single-package playbook edits + one suite extension. The "structure" is the internal layout of `auto.md` after the event-loop rewrite (step 2/step 4/step 5 collapse into a single tight loop; the tool-presence check moves into step 3; invariant §9 is added) plus the internal layout of the five other migrated playbooks (verb-site edits in place, error-block generalization) — see [data-model.md](./data-model.md) for the pre/post structural changes at each surface and the tool-call + typed-error type shapes — plus the four contract files — see [contracts/](./contracts/) for the verb-to-tool mapping, the `cockpit_await_events` loop shape, the tool-presence-check contract, and the tool-contract audit shape.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (six playbook prose edits, one event-loop rewrite in `auto.md`, seven new test assertions, three fixture files, and the 398-1 verb list narrowed) and matches the fix scope named in the spec (verb migration + `cockpit_await_events` loop + fail-loud on missing tools + tool-contract audit + one new invariant). The design explicitly rejects:

- **Dual-path playbook shipping a temporary CLI fallback** (Q1=C rejected). The dual-path playbook is the drift factory this suite exists to prevent — every added branch is a code path that must be audited, and a "temporary" branch that ships is a branch that ships. The spec already records this as a permanent no.

- **Plugin-version-bump gating so only clusters carrying registration adopt the migration** (Q1=A rejected). The plugin version and the cluster-base template version are uncoordinated artifacts — nothing ties "cluster adopted the migrated playbook" to "cluster's entrypoint registers the server" (an existing cluster can't gain registration via `generacy update`, since entrypoint scripts are baked in at scaffold time; only a rebuild picks up cluster-base#75). So the "transition mechanism" A promises can't actually gate anything, and A degrades to Q1=B plus ceremony. B ships the simple contract without the coordination pretense.

- **In-playbook branching (`if cockpit_status tool is available then MCP path else CLI path`)** (Q1=C rejected, restated). Same rejection ground as C: dual-path is the drift factory. The spec's Change #5 clarification records this decision explicitly.

- **On-disk cursor** in `.cockpit/cursor.json` or the epic run-state file (Q2=A/B rejected). Adds a persistence surface whose payoff is avoiding a sweep the playbook mandates at session start anyway, plus a new stale-state hazard (a file cursor outliving the server's retention guarantees is precisely how you manufacture `resetFrom` churn). The startup sweep + live-state re-check is the same "catch what we missed" mechanism the loop already runs on every re-arm.

- **In-memory cursor with ledger re-derivation on restart** (Q2=C rejected). The worst of both — it rebuilds event position from a human-audit artifact (`ledger` file) that was never designed as a wire-protocol checkpoint. Ledger lines are advisory; live state is authoritative; the sweep reads live state; therefore no ledger re-derivation.

- **Silent fallback to CLI on cockpit-tools-missing** (Q5 rejected, dual-path variant). Same rejection as Q1=C — dual-path is a drift factory. Silent fallback further hides the failure mode from the operator, which is worse than dual-path (dual-path at least surfaces intent).

- **`AskUserQuestion` prompt on cockpit-tools-missing** (Q5=B rejected). The operator can do nothing in-session about missing registration — a prompt whose every option means "abort" is not a decision. And the § AskUserQuestion invocation contract (#402) enumerates the four gate kinds (clarification, verdict, phase-queue, escalation); this would be a fifth without a matching gate contract entry. A `Print + exit` surface is the correct response class for "environment doesn't support the operation."

- **Typed error raised from the startup-sweep code path, without a ledger entry** (Q5=A rejected). Loses the audit-trail half. The § Ledger `<issue-ref> · <transition-class> · <action> · <outcome>` format is not just for successful dispatches — the mandatory-per-dispatch rule (from #388) extends to session-terminal failures. A run that aborted at the startup sweep should account for why in the audit trail, matching the cost-contract discipline #403 established for successful dispatches.

- **Limit the migration to `auto.md` only** (Q4=A rejected). Leaves the manual playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`) on the CLI. One plugin carrying two invocation idioms indefinitely, plus two audit suites (the `--help`-snapshot drift audit for the stragglers alongside the new tool-contract audit for `auto.md`). This is the standing-dual-path smell in its audit dimension. Migrating all six-verb users retires the CLI drift audit for cockpit verbs wholesale.

- **Hand-list the migrated playbooks in the spec** (Q4=C rejected, hand-list variant). A hand-list is a static artifact that a playbook added next week silently escapes. Grep-at-plan-time (the spec's Change #6 phrasing) matches the current state; the list is documented here for planning's benefit but the audit (406-2) is grep-driven so it stays correct across additions.

- **Migrate `watch.md` too** (out-of-scope per Q4). The `watch` verb isn't among the six migrated verbs; the NDJSON stream remains the human/script surface per generacy#917's out-of-scope note. `watch.md`'s runtime path is a distinct slash command (a "print streamed events, print next-command suggestions" surface for humans, not the auto loop's event source). Migrating it would rewrite it into a `cockpit_await_events`-shaped consumer, which changes its user-visible contract for zero efficiency win.

- **Baseline captured as a new smoke test on this branch** (Q3=C rejected). The recorded measurement is durable; the transcript on the snappoll orchestrator container is not (the container is destroyed when the operator rebuilds the test cluster). Copy the numbers into SC-003's text (Q3=B); link the source in prose.

- **Add a runtime-callable tool-call validator to `lib/`** (implementation direction rejected). The audit is a build-time contract check against a fixture schema snapshot, not a runtime validator. Following the pattern from #396 (`dispatchClassifier` inline in test file) and #403 (`parseVerdict` inline in test file), the tool-call classifier is < 60 lines and lives in the `406 —` describe block. If a future runtime finding needs a validator (e.g., a tool-schema-drift-detected banner in the auto loop), that's a follow-up.

- **Retire the entire 398 test block instead of narrowing the verb list** (rejected). 398-2's regression fixture on `398-drift-auto.md` still exercises a valuable historical instance (the D.5 merge drift on a PR-vs-issue token). Retiring the whole block loses that check. Narrowing 398-1's verb list to `["watch"]` while keeping 398-2 preserves the coverage that still applies.

- **Fold the tool-contract audit into 398-1's audit** (rejected). 398-1's audit shape (playbook `--help`-snapshot comparison) is CLI-syntax-specific — it parses `<positional-kind>` tokens from `--help` text. The MCP tool schemas expose parameter shapes as JSON schema, not `<positional-kind>` tokens. Fitting them into the same audit is over-abstraction. Two audits with two different mechanisms, one per protocol, is the natural structure.

- **Renumber existing invariants when adding §9** (rejected). §1–§8 keep their numbers; §9 is added at the end (matches #403's additive-numbering for §8 and #394's for §7). Renumbering breaks existing assertion string matches (e.g., §7 is anchored in the 394 tests as `unfiltered stream consumption`) and rewrites the audit surface for no gain.

- **Delete invariant §7 (unfiltered stream) since `auto.md` no longer consumes a text stream** (rejected). §7 still applies to `watch.md`'s NDJSON stream consumption. The rule stays; its prose is annotated to note the `auto.md` event-consumption boundary now runs through `cockpit_await_events`'s typed batch return, which preserves §7's intent (no content-based filter) by construction — the batch's events are already parsed by the tool server, not raw JSON lines the playbook has to filter.

- **Rebrand §8's cost contract in light of batch dispatches** (rejected). §8's rule is unchanged — ledger-only rows perform exactly the ledger append. The batch is the dispatch unit; each ledger-only event in the batch produces exactly one ledger append per the mandatory-per-dispatch rule (§ Ledger). The batch mechanism doesn't create new ledger-only dispatch semantics; it just delivers events in groups.

- **Add per-batch dispatch metrics (batch size, per-batch tool-call count) to the ledger** (rejected). The ledger's line-per-dispatch semantics are load-bearing for grep recipes and the mandatory-per-dispatch rule. Adding per-batch summary lines mixes two units (per-event and per-batch) at the same surface. If batch-level accounting is needed later (e.g., the true-verifier transcript grep for SC-003 assertion), it belongs in the run summary (§ Ledger L.6) not in the per-dispatch ledger. Deferred to follow-up.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q5 decisions with rationale (resolved in `clarifications.md`; `research.md` restates them as design decisions with alternatives-rejected + implementation patterns from the #388/#390/#394/#396/#398/#400/#402/#403 arc).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (ToolCall / ToolSchema / CursorState / TypedError type shapes + validation rules + pre/post surface changes at each playbook edit site + assertion index), [contracts/](./contracts/) (four contract files: MCP tool migration, `cockpit_await_events` loop, fail-loud tools missing, tool-contract audit), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + operator smoke-test one-liner).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here. First task is the per-playbook verb migration audit (`grep -n 'generacy cockpit \(status\|context\|queue\|advance\|resume\|merge\)' commands/*.md` on each of the six playbooks to confirm the grep-driven scope from Change #6). Deliverable: a pre-migration site-count table in the PR body (columns: playbook, verb, line-count-before), matched against a post-migration count-of-zero for the six verbs on the six playbooks.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Fail loud with guidance, no version-bump gating** when the `cockpit_*` MCP tools are absent. Ship the migration; a cluster without registration hard-fails at startup with a ledger line naming the fix (`cluster-base#75`). No CLI fallback, no in-playbook branching, no plugin-version pin. Rationale: plugin version and cluster-base template version are uncoordinated artifacts; existing clusters can't gain registration via `generacy update` (entrypoint scripts are baked into the scaffold at creation; only a rebuild picks up cluster-base#75). The current fleet is dev-stage test clusters that rebuild frequently, so hard-fail is appropriate. Rejected: version-bump gating (Q1=A — not enforceable), in-playbook branching (Q1=C — drift factory), something else (Q1=D — no viable option surfaced). | Q1=B |
| D2 | **Cursor is in-memory only** for the current dispatch loop. A new session starts cursor-less and runs the startup sweep — live state is authoritative and subsumes any missed-event replay. No on-disk cursor, no ledger re-derivation on restart. Session restart, `invalid-cursor` typed error, `resetFrom` reset signal, and cursor expiry all converge on the same recovery path: run the startup sweep, then re-arm cursor-less from connect-time position. Rejected: epic run-state file cursor (Q2=A — new persistence surface for a sweep the playbook already runs), dedicated cursor file (Q2=B — same, plus stale-state hazard when file cursor outlives server retention), in-memory + ledger re-derivation (Q2=C — worst of both, rebuilds event position from a human-audit artifact never designed as a wire-protocol checkpoint). | Q2=D |
| D3 | **The SC-003 baseline is the recorded measurement in generacy-ai/tetrad-development#92 `issuecomment-4948309408` (2026-07-11)**, with the numbers restated in the spec so the criterion is self-contained. Baseline: ~100 watch-derived events each consumed as a separate dispatch round, 233 API turns total, ~508k final-context tokens, 12-issue epic. Target: on a comparable 12-issue epic, ≤ ~50 `cockpit_await_events` calls that returned ≥1 event (≥2× reduction). Rejected: archived transcript path (Q3=A — the raw transcript lives on the snappoll orchestrator container, which is destroyed when the operator rebuilds the test cluster; the measurement is the durable artifact), new smoke-test capture at validate (Q3=C — the recorded measurement is already the durable artifact, so recapturing is over-processing). | Q3=B |
| D4 | **Six in-scope playbooks: `auto.md`, `clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`.** Enumerated at plan-time by grep for `generacy cockpit <verb>` across the six migrated verbs. `watch.md` is explicitly NOT migrated (its verb isn't among the six; the NDJSON stream remains the human/script surface per generacy#917's out-of-scope note). Only `auto.md` swaps its Monitor/watch event plumbing for `cockpit_await_events`; the other five are verb-migration only. Rejected: `auto.md` only (Q4=A — leaves five playbooks on CLI indefinitely, one plugin carrying two invocation idioms + two audit suites; standing-dual-path smell), hand-list beyond `auto.md` (Q4=C — hand-list is a static artifact a future playbook silently escapes; grep is drift-safe). | Q4=B |
| D5 | **Fail-loud surface is structured ledger entry + printed guidance + non-zero exit; no `AskUserQuestion` prompt.** At the top of the startup sweep, verify the `cockpit_*` tools are present. On absence, write `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` to the ledger (in the agency#403 shape), print the guidance ("cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75"), and end the run. The ledger half gives FR-007's audit a concrete hook (assert the playbook text mandates the ledger line). Rejected: typed error only (Q5=A — loses audit-trail half), `AskUserQuestion` prompt (Q5=B — operator can do nothing in-session; the § AskUserQuestion invocation contract enumerates four gate kinds, this would be a fifth without a matching gate contract entry). | Q5=C |

## Verification Layering

Static (necessary but not sufficient — the #384–#403 experience proved static-only fails at behavioral defects):

- `commands/{auto,clarify,review,merge,queue,status}.md` contain zero `generacy cockpit <verb>` invocations where `<verb>` ∈ `{status, context, queue, advance, resume, merge}` (negative anchor — the migration completeness signal; this is 406-2).
- `commands/auto.md` contains `cockpit_await_events` in its main-loop prose (positive anchor — the event-consumption verb).
- `commands/auto.md` contains the ledger line `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` verbatim (positive anchor — the fail-loud contract).
- `commands/auto.md` does NOT contain `run_in_background: true` in step 2 (negative anchor — the retired watch-process spawn).
- `commands/auto.md` does NOT contain any of `.cockpit/cursor`, `state/cursor`, `cursor.json`, or filesystem-path references containing the token `cursor` (negative anchor — cursor-in-memory contract).
- `commands/auto.md` § Invariants section contains a §9 numbered item whose opening substring is `After the migration, \`auto.md\` invokes no \`generacy cockpit <migrated-verb>\` Bash form —` (positive anchor — the load-bearing rule).
- `commands/watch.md` contains `generacy cockpit watch` (positive anchor — `watch` verb preservation, FR-006 boundary).
- `commands/watch.md` shows zero changes on this branch (negative anchor — the out-of-scope boundary).
- Historical spec directories show zero changes on this branch.
- Existing `lib/*.ts` files show zero changes on this branch (negative anchor — no new library module).
- `scripts/refresh-help-snapshots.sh` shows zero changes on this branch.

Behavioral (evidence, not proof — seven assertions in `tests/playbook-verification.test.ts` under `describe("406 —", …)`):

- **406-1 (tool-contract audit)**: every `cockpit_*` tool call in migrated playbooks names a tool and parameter shape from the #917 schema exports. Fixture: `406-tool-schemas.json`. Load-bearing FR-007 (SC-005) anchor.
- **406-2 (no residual CLI verb)**: grep the six migrated playbooks for `generacy cockpit <verb>` where `<verb>` ∈ the six migrated verbs; zero matches. `commands/watch.md` retains `generacy cockpit watch`. Load-bearing FR-001 (SC-001) anchor.
- **406-3 (`cockpit_await_events` loop)**: `commands/auto.md` step 4 prose contains `cockpit_await_events` as the sole event-consumption verb; step 2 prose does NOT contain `run_in_background: true` (the retired watch spawn); step 4 prose does NOT contain a `Monitor` tool reference. Load-bearing FR-002 anchor.
- **406-4 (in-memory cursor)**: step 4/5 prose mandates the cursor is in-memory only; positive substring on the invariant sentence; negative substring on any on-disk cursor path form. Load-bearing FR-003 anchor.
- **406-5 (startup sweep tool-presence check)**: step 3 prose contains the tool-presence verify + the ledger-line-on-absence contract; the exact ledger-line format string appears; no `AskUserQuestion` invocation is triggered on the fail path. Load-bearing FR-006 anchor.
- **406-6 (invariant §9)**: § Invariants section contains exactly nine numbered items (§1–§9); §9's opening substring is present verbatim. Load-bearing FR-005 anchor.
- **406-7 (typed-ref error shape)**: a malformed ref passed to a `cockpit_*` tool produces a typed error (schema validation failure); the parser preserves the typed error's `code`/`message`/`details` fields verbatim (does not re-wrap them as CLI stderr). Fixture-driven with `406-malformed-ref-input.json` / `406-malformed-ref-expected-error.json`. Load-bearing FR-004 (SC-004 "Ref-layer errors") anchor.

True verifier:

- A re-run of the cockpit v1.5 auto-mode smoke test on a comparable 12-issue epic (matching the snappoll 2026-07-10 baseline as closely as feasible), executed after cluster-base#75 lands. Adherence targets: **zero Bash `generacy cockpit <migrated-verb>` invocations in the session transcript** (SC-001); **≤ ~50 `cockpit_await_events` calls that returned ≥1 event** (SC-003, ≥2× reduction versus the ~100 watch-derived event baseline); **typed-ref errors surface at the tool boundary** with actionable guidance and zero engine round-trips on a synthesized malformed-ref test (SC-004); **tool-presence check fires and ledger line + guidance appear correctly** on a cluster without registration (SC-005 startup path). Empirical confirmation across a variety of runs is the true verifier; the greps + tool-contract audit + fixture assertions are the machine-checkable backstop against silent regression.
