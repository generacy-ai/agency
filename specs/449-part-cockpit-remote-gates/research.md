# Research: `/cockpit:auto` — Cockpit Remote Gates (UI-mode dispatch)

Rationale, alternatives considered, and prior art referenced during planning. Every load-bearing choice traces to either a clarification answer (Q1–Q5 in `clarifications.md`), the wire contract in [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md), or an existing pattern in `packages/claude-plugin-cockpit/commands/auto.md`.

## R1 — Where does the `--gates` flag slot in?

**Decision**: New orthogonal flag at the top of step-1 parse block (auto.md ~line 21), parallel in structure to `--tracking` / `--new`, not a positional. Values: `ui | local | auto`. Default: `auto`.

**Why**: The existing parse block already treats `--tracking` and `--new` as orthogonal flags with a positional stream separately. `--gates` describes the presenter for gate prompts, orthogonal to which tracking scope the run drives. Slotting it into the same parse pass keeps the parse code path linear and the usage string readable.

**Alternatives considered**:
- **Environment variable** (`COCKPIT_AUTO_GATES=ui`) — rejected. Ambient state hides the mode choice from the ledger header and from `--help`; operators would need to grep `env` to understand a running session.
- **Per-gate opt-in via config file** — rejected. Adds a new file surface and a new precedence rule (config vs flag vs auto-detect) for a value that is a session-lifetime property.

**Usage-string extension** (extends the string at auto.md line 41):

```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
       [--gates=ui|local|auto]  (default: auto)
```

## R2 — `--gates=auto` presence detection

**Decision**: Two-part check at pre-flight, decided ONCE for the run (does not flip mid-run):
1. Is `cockpit_gate_open` bound in the session's MCP tool binding? (same shape as the seven-cockpit-tools check at auto.md line 136)
2. Is the cluster cloud-activated? (queryable via a startup handshake surface — exact shape pinned in `contracts/gates-flag-parse.md`, cross-referenced to `cockpit-remote-gates-plan.md § Skill-side presence check`)

If both YES → mode = `ui`. If either NO → mode = `local` (byte-identical to explicit `--gates=local`).

**Why**: These are static session properties. A mid-run flip (e.g., temporary MCP tool re-registration hiccup) would produce a partial-UI / partial-local run whose ledger is ambiguous. Decide once, stick to it. Matches how the current playbook decides other one-shot pre-flight values (workspace-repo inference at F4.1, tool-presence checks at line 136).

**Alternatives considered**:
- **Per-gate re-check** — rejected. Adds a per-gate call surface and creates ambiguous ledgers.
- **Presence check on the gate-open call itself, fall back to local when it fails** — rejected as the primary detection mechanism. This IS the US4 / FR-011 fallback for call-time errors, but relying on it for `auto` would mean every `auto` run pays the cost of a first-gate probe. Pre-flight resolution is free.

## R3 — Hard-fail semantics for `--gates=ui` when `cockpit_gate_open` is absent (Q3=A)

**Decision**: Print the verbatim error and exit non-zero **before** creating any ledger directory:

```
--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto
```

**Why (per Q3=A rationale)**: The seven-cockpit-tools presence check at auto.md line 136 is the established precedent: when the environment cannot satisfy a required capability, the playbook responds with `Print + exit`, not a prompt. A prompt whose every option means "abort" is not a decision. Silent whole-run downgrade would reintroduce exactly the session-blocking that `--gates=ui` was chosen to escape. Per-gate fallback would pay repeated overhead for a static session property.

**Why NOT extend US4's fallback**: US4 covers `cockpit_gate_open` **error** at call time (transient — network flake, cluster hiccup); absence is a static property observed at pre-flight before any call is issued. Extending US4 to cover both erases a real semantic distinction and makes the fallback branch harder to reason about.

**Ledger consequences**: no ledger directory is created (matches the Monitor-presence check at auto.md line 141). The startup line "Auto run starting…" is NOT emitted. The operator sees only the error string.

**Contract**: `contracts/gates-flag-parse.md § Pre-flight absence`.

## R4 — Gate mapping table shape: 10 rows vs 7 vs 11 (Q1=C)

**Decision**: 10 rows — G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7. **G.4(e) excluded from the UI mapping**; stays local-only.

**Why (per Q1=C rationale)**:
- The five G.4 subtypes carry divergent option sets (a: Retry / Skip / Stop; b: Requeue / Skip / Stop; c: Skip / Stop; d: I've-resolved-it / Skip / Stop; e: Continue-degraded / Stop). A consolidated single-G.4 row (option B) cannot express per-subtype `optionId` + downstream-action mappings without inventing subtype-conditional strings — which then need their own subtype disambiguator in the wire payload, defeating the purpose.
- G.4(e) operates on `<epic-ref>` not `<issue-ref>`. The wire contract's gate record is per-issue (fields: `issueRef`, `issueTitle`, `issueUrl`, `branch`). An in-memory cursor-mechanism fault has no issue to key against. Attempting to open a per-issue gate record for a per-epic diagnostic would require a schema deviation, and the plan doc's wire contract is authoritative.

**Alternatives rejected**:
- **Option A (11 rows including G.4e)** — rejected. G.4(e) has no `<issue-ref>` to populate; the record would need epic-scoped fields the wire contract doesn't carry.
- **Option B (7 consolidated rows)** — rejected. Sub-bullets in one row can name subtypes textually but cannot participate in the mapping-table pin assertions cleanly; the test would need per-subtype substring assertions inside one row, breaking the table's grepability.

**Contract**: `contracts/ui-gate-mapping.md`.

## R5 — Startup-sweep extension in UI mode (Q2=B)

**Decision**: In UI mode, the startup sweep re-opens remote gates for **all persistent gate-trigger states**:
- Every `waiting-for:*` label (matches FR-013 baseline)
- PLUS: `agent:error`, `failed:*`, `completed:validate` with red checks, `phase-complete`, `blocked:stuck-merge-conflicts`

Idempotency is guaranteed by `gateId` (per plan-doc rules: `gateId = hash(issueRef, dispatchClass, generation)` — the same input yields the same id, so a re-sweep after restart matches an existing open record instead of creating a duplicate).

G.4(e) is excluded (in-memory cursor streak, does not survive a restart by definition).

**Why (per Q2=B rationale)**: The existing startup sweep at auto.md line 143 already dispatches every issue whose live transition class is D.1–D.9 (plus D.11), not just `waiting-for:*`. These non-`waiting-for` triggers are persistent labels — the engine sets them and they sit until dispatched. They do not self-re-fire. Restricting the UI sweep to `waiting-for:*` would silently drop them across a restart / takeover — a real operator hazard the local sweep does not have.

**Why NOT option C (only labels the operator can act on across sessions)**: option C wrongly categorizes `phase-complete` as transient (it persists until the phase is queued — the D.8 dispatch is what removes it) and `completed:validate`+red as in-memory (the label is a persistent GitHub label; only the fixer-attempt state is in-memory). Only G.4(e) is genuinely in-memory-only.

**Contract**: `contracts/ui-startup-sweep.md`.

## R6 — G.7 Add-more-work follow-up prose (Q4=A)

**Decision**: The `Add more work` option's follow-up prose is carried on the SAME answer as the option selection — the wire `Answer.freeText` field carries the operator's `also process <ref>` / `file an issue for <topic>` prose alongside `optionId: "add-more-work"`. D.12 routes freeText through the existing § Add-issue intent recognizer (auto.md § G.7 add-issue path) exactly as the local prose-reply turn does today.

**Why (per Q4=A rationale)**: The plan-doc's wire Answer schema comments the freeText field as "edit directives, add-work prose, etc." — the field is explicitly designed to carry follow-up prose alongside an option selection. The inbox gate detail (per plan-doc UI shape) presents option buttons AND an always-present free-text field in one submission form. The operator selects `Add more work` and types the prose in a single answer.

**Why NOT re-open a second gate for the follow-up prose**: re-opening a fresh gate/generation for the second turn is exactly what the single-answer wire is designed to avoid. It would double the operator's roundtrip cost for no correctness gain, and would require the D.12 handler to remember "this issue's G.7 is now in follow-up-prose mode" — extra state that the collapsed-answer approach doesn't need.

**Why NOT disable Add-more-work under UI mode**: option C (disable) violates the presenter-agnostic parity goal. UI mode should change WHO the operator answers through, not WHAT they can do. Add-more-work is a valid decision; the inbox should support it.

**Contract**: `contracts/ui-gate-mapping.md § G.7`.

## R7 — Ledger vocabulary in UI mode (Q5=B)

**Decision**: Gate-open is **print-only** (the "one pointer line" per FR-005 is the operator-visible affordance, not a ledger append). D.12 writes **exactly one ledger line per resolved gate**, in the existing four-column format:

```
<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate
```

Where `<original-action>` matches the pre-change vocabulary (e.g., `clarification-batch`, `merge`, `phase-queue-gate`, `escalation-gate`) and `<outcome>` covers the resolved-answer outcomes (`applied` cases reuse the local vocabulary — `advanced`, `queued P<n> (<N> issues)`, etc.; `superseded` and `failed: <detail>` are new outcome strings for D.12-specific cases).

**Why (per Q5=B rationale)**: This reuses the playbook's already-established provenance convention — the E6 `· source: enriched-line` suffix appended in the outcome slot of the unchanged four-column format (auto.md line 1303–1314). Grep recipes on stable `<action>` / `<outcome>` strings (e.g., `grep 'clarification-batch · advanced' <ledger>`) keep working. Options that invent new `gate-open` / `gate-answer` action verbs break every existing post-mortem recipe.

**Why gate-open is print-only** (against Invariant #8): FR-005 mandates "exactly one pointer line" for the operator to find the gate in the inbox. That line is a UI affordance — it points the operator at the surface, it does not record a dispatch decision. The DISPATCH is the D.12 gate-answer event: it consumes the operator's decision and drives a downstream action. Under Invariant #8's cost contract, that IS the mandatory ledger row. Local mode's "one ledger line per gate dispatch at resolution" == UI mode's "one D.12 ledger line at resolution." Symmetry preserved.

**Alternatives rejected**:
- **Option A (both events write ledger rows + a per-gate downstream-action row)** — rejected. Doubles ledger volume; grep recipes break because the `gate-open` action verb is new.
- **Option C (both events write rows AND per-gate action verbatim on applied only)** — rejected. Mixes vocabulary regimes; still doubles ledger volume for the applied path.

**Contract**: `contracts/ledger-ui-mode.md`.

## R8 — Fallback semantics on `cockpit_gate_open` call-time error (US4 / FR-011)

**Decision**: On a `cockpit_gate_open` call returning an error (typed error object, network failure, timeout), fall back to local `AskUserQuestion` **for that gate only** — the gate is presented in-session and resolved locally. The loop continues; subsequent gates re-attempt UI mode. Repeated failures within a run are noted once in the ledger (a single `<issue-ref> · <transition-class> · <action> · error: gate-open-fallback (<detail>) · source: ui-gate-fallback` row on first failure); subsequent failures are silent (avoid ledger spam).

**Why**: "Fail toward the operator, never stall" (spec § Scope, fallback bullet). A gate that can't be opened remotely still needs an answer; the local presenter is the safe fallback. Noting once (not per-gate) balances observability with ledger cost.

**Distinct from Q3=A pre-flight absence**: absence at pre-flight is a static property → hard-fail. Error at call time is transient → per-gate fallback. Different semantics, different contract.

**Contract**: `contracts/ui-mode-fallback.md`.

## R9 — Supersession semantics for D.12 (spec § Scope)

**Decision**: On a D.12 `gate-answer` event, before applying the answer, re-check live labels/state via the enriched doorbell line (or `cockpit_status` fallback per E6). If the trigger state has moved past the gate's transition class (e.g., the issue's `waiting-for:clarification` label has been removed by an out-of-band operator), ack the gate with `superseded` and skip the downstream action. Otherwise apply the answer and ack `applied` (or `failed: <detail>` on downstream error).

**Why**: The gate's underlying state can change out-of-band between gate-open and gate-answer — an operator posting the clarification answer directly on the issue, or a competing skill invocation resolving the state. Applying a stale answer would produce incorrect downstream actions (duplicate posts, wrong-phase queue). The supersession check is the same live-state re-check the local flow performs at auto.md step 4a; D.12 reuses it.

**Contract**: `contracts/dispatch-d12-gate-answer.md § Supersession`.

## R10 — Playbook-verification pin discipline

**Decision**: Every existing pin that tests step-1 parse, the dispatch table, the gate section, the ledger vocabulary, or the startup sweep is re-pinned to the NEW contract in the same PR. Not weakened, not deleted. New pins added for:
- `--gates` flag present in the usage string
- D.12 row present in the dispatch table
- 10-row mapping table exact heading/row count
- `· source: ui-gate` suffix rule literal-match
- Pre-flight absence hard-fail error string literal-match
- Q2=B extended sweep trigger set present

**Why**: Per repo CLAUDE.md § "Cockpit playbook pins" — heading renames, loop-shape edits, and new/removed steps break the pins on purpose (drift audit, not smoke test). Re-pinning to the new contract preserves the drift-audit value while allowing the intentional contract change.

**Contract**: not a separate contracts file; pin coverage is exhaustively enumerated in `tasks.md` (generated by `/speckit:tasks`).
