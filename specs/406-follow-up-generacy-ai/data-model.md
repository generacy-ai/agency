# Data model: cockpit MCP tool migration + `cockpit_await_events` loop

**Feature**: #406
**Date**: 2026-07-11
**Status**: Complete

## Purpose

Enumerate the type shapes, validation rules, and pre/post structural changes at each playbook surface. Type shapes are the reference forms used by the inline tool-call classifier + typed-error parser in `tests/playbook-verification.test.ts`. Validation rules are the load-bearing assertions the audit exercises. Pre/post surface changes make the migration deltas grep-checkable.

## Types

### `ToolCall` (parser output)

Represents one `cockpit_*` tool call as it appears in playbook prose.

```typescript
type ToolCall = {
  file: string;                 // playbook path (e.g., "commands/auto.md")
  line: number;                 // 1-indexed line number
  tool: CockpitToolName;        // one of the seven cockpit_* tool names
  declaredParams: ReadonlyArray<string>;   // parameter names declared at the call site
};

type CockpitToolName =
  | "cockpit_status"
  | "cockpit_context"
  | "cockpit_queue"
  | "cockpit_advance"
  | "cockpit_resume"
  | "cockpit_merge"
  | "cockpit_await_events";
```

**Parse rule**: a `cockpit_*` tool call is a substring matching `/cockpit_(status|context|queue|advance|resume|merge|await_events)\s*\(([^)]*)\)/g`. `declaredParams` extracts parameter names by splitting the argument list on `,` and taking the identifier before `=` on each side. Parameter-name-only (no value) forms are also valid — the test uses this because the playbook prose sometimes describes tool calls without concrete values.

### `ToolSchema` (fixture snapshot)

Represents one `cockpit_*` tool's schema, captured as a JSON snapshot in `406-tool-schemas.json`.

```typescript
type ToolSchema = {
  name: CockpitToolName;
  requiredParams: ReadonlyArray<string>;
  optionalParams: ReadonlyArray<string>;
};
```

**Full schema snapshot** (`406-tool-schemas.json`, matching generacy#917's tool exports):

```json
[
  { "name": "cockpit_status", "requiredParams": [], "optionalParams": ["epic", "json"] },
  { "name": "cockpit_context", "requiredParams": ["issue"], "optionalParams": [] },
  { "name": "cockpit_queue", "requiredParams": ["epic", "phase"], "optionalParams": [] },
  { "name": "cockpit_advance", "requiredParams": ["issue", "gate"], "optionalParams": [] },
  { "name": "cockpit_resume", "requiredParams": ["issue"], "optionalParams": [] },
  { "name": "cockpit_merge", "requiredParams": ["issue"], "optionalParams": [] },
  { "name": "cockpit_await_events", "requiredParams": ["epic"], "optionalParams": ["cursor", "maxWaitMs", "coalesceWindowMs", "maxBatchSize"] }
]
```

### `CursorState` (in-memory only; type shape for the classifier)

Represents the `cockpit_await_events` cursor lifecycle within one session.

```typescript
type CursorState =
  | { kind: "cursorless" }               // new session or post-recovery; startup sweep must run first
  | { kind: "armed"; value: string }     // received from a successful cockpit_await_events return
  | { kind: "invalid"; reason: "invalid-cursor" | "resetFrom" | "expired" };  // recovery pending
```

**Transition rules**:

- Session start → `{ kind: "cursorless" }`.
- After startup sweep → still `{ kind: "cursorless" }` (the sweep does not produce a cursor; the first `cockpit_await_events` call arms it).
- After successful `cockpit_await_events` return → `{ kind: "armed"; value: batch.nextCursor }`.
- On `invalid-cursor` typed error → `{ kind: "invalid"; reason: "invalid-cursor" }` → recover (sweep + re-arm cursor-less).
- On `resetFrom` reset signal in batch → `{ kind: "invalid"; reason: "resetFrom" }` → recover (sweep + re-arm cursor-less).
- On cursor expiry (batch returns typed error) → `{ kind: "invalid"; reason: "expired" }` → recover (sweep + re-arm cursor-less).

**Forbidden transitions** (asserted by 406-4):

- Any transition that persists the cursor to disk.
- Any transition that derives a cursor from the ledger file.

### `TypedError` (parser output; fixture-driven)

Represents a typed error surfaced from the tool boundary (e.g., malformed ref, invalid cursor, tool absent).

```typescript
type TypedError = {
  code: string;                 // e.g., "invalid-ref", "invalid-cursor", "tool-not-registered"
  message: string;              // human-readable single-line message
  details: Record<string, unknown>;  // structured fields (e.g., { ref: "generacy-ai/agency#403" })
};
```

**Reference `parseTypedError(input) → TypedError | ValidationError` in test file**:

```typescript
function parseTypedError(input: string): TypedError | { errorKind: "parse" | "shape"; raw: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return { errorKind: "parse", raw: input }; }
  if (typeof parsed !== "object" || parsed === null) return { errorKind: "shape", raw: input };
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.code !== "string" || typeof obj.message !== "string" || typeof obj.details !== "object" || obj.details === null) {
    return { errorKind: "shape", raw: input };
  }
  return { code: obj.code, message: obj.message, details: obj.details as Record<string, unknown> };
}
```

Lives inline in the `406 —` describe block (matches the `parseVerdict` inline reference from #403).

### `ToolPresenceCheckResult` (parser output for 406-5)

Represents the outcome of the startup-sweep tool-presence check.

```typescript
type ToolPresenceCheckResult =
  | { kind: "all-present" }
  | { kind: "missing"; missingTools: ReadonlyArray<CockpitToolName>; ledgerLine: string; guidance: string };
```

**Load-bearing constants** (asserted verbatim in 406-5):

```typescript
const LEDGER_LINE_ON_MISSING = "startup · cockpit-mcp-tools-missing · abort · see cluster-base#75";
const GUIDANCE_ON_MISSING =
  "cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75";
```

## Validation rules

### VR-1: Tool-contract audit (406-1)

Every `ToolCall` extracted from the six migrated playbooks satisfies:

1. `call.tool ∈ CockpitToolName`.
2. For every `param ∈ call.declaredParams`, `param ∈ schema[call.tool].requiredParams ∪ schema[call.tool].optionalParams`.
3. Every `req ∈ schema[call.tool].requiredParams` appears in `call.declaredParams` (for prose that names required params by name — the playbook often names positional required params inline).

**Failure surface**: a mismatch (unknown tool, unknown param, missing required param) is reported with `file:line`, tool name, declared params, expected params.

### VR-2: No residual CLI verb (406-2)

Grep the six migrated playbooks for `/generacy cockpit (status|context|queue|advance|resume|merge)\b/`; result set is empty. `commands/watch.md` retains `generacy cockpit watch` (positive-inverse assertion).

### VR-3: `cockpit_await_events` loop shape (406-3)

`commands/auto.md`:

- Step 4 prose contains the substring `cockpit_await_events` at least once.
- Step 2 prose does NOT contain `run_in_background: true` (the retired watch-process spawn form).
- Step 4 prose does NOT contain any `Monitor` tool primitive reference.
- Step 4 prose contains the loop shape (batch → dispatch in stream order → advance cursor); the reference classifier extracts the loop shape and asserts each element is present.

### VR-4: In-memory cursor (406-4)

`commands/auto.md`:

- Step 4/5 prose contains the sentence "the cursor is in-memory only" (or a close equivalent — the assertion uses `/cursor.*in.?memory only/i`).
- Step 4/5 prose does NOT contain any filesystem-path reference containing the token `cursor` (negative anchor — matches `/.cockpit\/cursor|state\/cursor|cursor\.json/`).
- Step 4/5 prose contains the recovery-convergence sentence (invalid-cursor / resetFrom / cursor expiry all converge on the startup sweep + re-arm cursor-less).

### VR-5: Startup sweep tool-presence check (406-5)

`commands/auto.md` step 3 prose:

- Contains a "tool-presence check" sentence naming the seven `cockpit_*` tools.
- Contains the `LEDGER_LINE_ON_MISSING` constant verbatim.
- Contains the `GUIDANCE_ON_MISSING` constant verbatim.
- Does NOT contain `AskUserQuestion` in the fail path — the fail path is ledger + print + exit only.

### VR-6: Invariant §9 (406-6)

`commands/auto.md` § Invariants:

- Contains exactly nine numbered items (§1–§9).
- §9's opening substring is: `After the migration, \`auto.md\` invokes no \`generacy cockpit <migrated-verb>\` Bash form —`.
- §1–§8's opening substrings are byte-identical to their pre-#406 state (defense-in-depth against accidental renumbering).

### VR-7: Typed-ref error shape (406-7)

Fixture-driven:

- Input: `406-malformed-ref-input.json` (a malformed ref payload, e.g., a PR number where an issue-ref was expected).
- Expected output: `406-malformed-ref-expected-error.json` (a typed error with `code: "invalid-ref"`, `message` populated, `details` containing the malformed ref).
- The `parseTypedError` reference preserves the typed error's `code`/`message`/`details` fields verbatim (no re-wrapping as CLI stderr).

## Pre/post playbook surface changes

### `commands/auto.md`

| Surface | Pre-#406 | Post-#406 |
|---------|----------|-----------|
| Step 2 (spawn cockpit watch) | Bash `run_in_background: true` `generacy cockpit watch <epic-ref>`; capture process handle. | **Retired.** No background process; the initial state is cursor-less. Step number retained for stability but body shrinks to "no watcher to spawn — the event source is `cockpit_await_events`, called per iteration in step 4." |
| Step 3 (startup sweep) | Call `generacy cockpit status --json <epic-ref>`; treat every issue in D.1–D.9 as a synthetic event; dispatch each. | **Add tool-presence check at the top.** Verify the seven `cockpit_*` tools are present; on absence, ledger line + guidance + non-zero exit. Then call `cockpit_status(epic, json=true)`; dispatch synthetic events as before. |
| Step 4 (main loop) | Read background watch process output via Monitor primitive; 30-second bounded read; N=4 empty-read counter; dispatch every non-empty line. | **Rewrite.** Call `cockpit_await_events(epic, cursor, maxWaitMs=55000, coalesceWindowMs=3000, maxBatchSize=256)` per iteration; consume the returned batch in stream order; advance the in-memory cursor; loop. Ledger-only events per event; re-check live state for actionable events. |
| Step 5 (watch re-arm + liveness cross-check) | Re-spawn `cockpit watch` if the background process dies; compound liveness cross-check on N=4 empty reads + actionable live state. | **Rewrite.** No process to re-arm. `invalid-cursor` typed error / `resetFrom` reset signal / cursor expiry all trigger: startup sweep + re-arm cursor-less from connect-time position. The compound liveness cross-check retires — the long-poll's `maxWaitMs=55000` bounds the "no events" case at the tool boundary, and the tool server owns the "silent stall" detection. |
| § Dispatch (D.1 fetch context) | `generacy cockpit context <issue>` | `cockpit_context(issue)` |
| § Dispatch (D.2 D.3 D.4 advance) | `generacy cockpit advance --gate <name> <issue-ref>` | `cockpit_advance(issue, gate=<name>)` |
| § Dispatch (D.5 merge) | `generacy cockpit merge <issue>`; parse stdout JSON `{result, reason, pr, checks, details}`. | `cockpit_merge(issue)`; consume the tool's return (same field shape — the tool preserves the CLI's JSON contract). |
| § Dispatch (D.6 status re-check) | `generacy cockpit status --json <epic-ref>` at step 4a. | `cockpit_status(epic, json=true)` at step 4a. |
| § Dispatch (D.7 fetch context) | `generacy cockpit context <issue>` | `cockpit_context(issue)` |
| § Dispatch (D.7 requeue) | `generacy cockpit resume <issue-ref>` | `cockpit_resume(issue)` |
| § Dispatch (D.8 queue) | `generacy cockpit queue <epic-ref> P<next> --yes` | `cockpit_queue(epic, phase=P<next>)` (the `--yes` flag retires — the tool has no interactive confirm) |
| § Dispatch (D.11 fetch context + advance) | `generacy cockpit context <issue>`; `generacy cockpit advance --gate merge-conflicts <issue-ref>` | `cockpit_context(issue)`; `cockpit_advance(issue, gate="merge-conflicts")` |
| § Ledger vocabulary | `<action>` strings mention CLI verbs (e.g., `cockpit resume`, `cockpit advance`). | Vocabulary strings unchanged (they refer to logical actions, not the invocation mechanism). |
| § Invariants | §1–§8 | §1–§8 unchanged; **new §9**: `After the migration, \`auto.md\` invokes no \`generacy cockpit <migrated-verb>\` Bash form — every dispatch of the six migrated verbs (\`status\`, \`context\`, \`queue\`, \`advance\`, \`resume\`, \`merge\`) goes through its \`cockpit_*\` MCP tool. Playbook edits that reintroduce the Bash form are drift regressions.` |
| § Examples | Every CLI verb in the four end-to-end examples. | Every migrated verb site rewritten in place; example prose unchanged in structure. |

### `commands/clarify.md`

| Surface | Pre-#406 | Post-#406 |
|---------|----------|-----------|
| Step 3 (fetch context) | `Invoke \`generacy cockpit context <issue>\` via the Bash tool.` | `Invoke the \`cockpit_context\` MCP tool with \`issue=<issue-ref>\`.` |
| Step 3 error branches | "CLI reports 'no open clarifications'"; "any other non-zero exit". | "Tool returns `code: 'no-open-clarifications'`"; "Tool returns any other typed error". |
| Step 7 (advance gate) | `run \`generacy cockpit advance --gate clarification <issue-ref>\` via the Bash tool` | `call \`cockpit_advance(issue=<issue-ref>, gate="clarification")\` via the MCP tool binding` |
| Error handling block | `MISSING_BINARY`: "The generacy CLI is required…". | `MISSING_BINARY`: "A required CLI (`gh` for issue comment posting) is required…". (Only `gh` remains as a Bash CLI in `clarify.md`.) |

### `commands/review.md`

| Surface | Pre-#406 | Post-#406 |
|---------|----------|-----------|
| Step 4 (advance on approval) | `Run \`generacy cockpit advance --gate <name>\` via the Bash tool.` | `Call \`cockpit_advance(issue, gate=<name>)\` via the MCP tool binding.` |
| Step 4 (post PR review body) | `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` — UNCHANGED (this is a `gh` verb, not a cockpit verb). | UNCHANGED. |
| Sub-branch A subagent prompt | Instructs subagent to `Fetch the diff yourself via \`gh pr diff <owner>/<repo>#<n>\``. | UNCHANGED. The subagent still fetches its own diff via `gh pr diff` (not via `cockpit_context`); the migration boundary is what the parent calls, not what the subagent calls. |
| Terminal Outcome Check | `no \`generacy cockpit status\` calls, no \`gh pr view\` calls, no state probes` | UNCHANGED. Still applies — the migrated `cockpit_advance` tool call replaces the CLI in the affirmative path; the Terminal Outcome Check's negative-anchor list is about *what the review flow does not do*, unchanged by the migration. |
| Error handling block | `MISSING_BINARY`: "The generacy CLI is required…". | `MISSING_BINARY`: "A required CLI (`gh` for PR review posting) is required…". |

### `commands/merge.md`

| Surface | Pre-#406 | Post-#406 |
|---------|----------|-----------|
| Step 4 (invoke CLI) | `Run \`generacy cockpit merge <issue>\` via the Bash tool. Parse stdout as JSON with fields \`{ result, reason, pr, checks, details }\`.` | `Call \`cockpit_merge(issue=<issue-ref>)\` via the MCP tool binding. The tool's return has the same shape: \`{ result, reason, pr, checks, details }\`.` |
| Step 5 (decision tree) | Route on `result` + `reason` from parsed CLI stdout. | Route on `result` + `reason` from the tool return (identical shape). |
| Step 7 (fixer subagent) | Fixer subagent MUST NOT call `generacy cockpit merge`. | Fixer subagent MUST NOT call `cockpit_merge`. |
| Step 8 (re-evaluate) | Loop back to step 4 (re-invoke CLI). | Loop back to step 4 (re-invoke tool). |
| Error handling block | `MISSING_BINARY`: "The generacy CLI is required…". | `MISSING_BINARY`: "A required CLI (`gh` for PR resolution, `git` for local fixer operations) is required…". |

### `commands/queue.md`

| Surface | Pre-#406 | Post-#406 |
|---------|----------|-----------|
| Step 4 (invoke CLI) | `run \`generacy cockpit queue <epic-ref> <phase> --yes\` via the Bash tool` | `call \`cockpit_queue(epic=<epic-ref>, phase=<phase>)\` via the MCP tool binding` (the `--yes` flag is retired — no interactive confirm at the tool boundary) |
| Step 5 (success rendering) | Render captured CLI stdout inside a fenced code block. | Render the tool's return (structured payload — a summary block matching the CLI's stdout shape, or an equivalent renderer for the typed return). |
| Error handling block | `MISSING_BINARY`: "The generacy CLI is required…". | Retained; only `generacy` was a Bash CLI in this playbook, and it's fully migrated. The block is retained defensively — a future non-cockpit CLI invocation (e.g., `gh`) can reuse it without change. |

### `commands/status.md`

| Surface | Pre-#406 | Post-#406 |
|---------|----------|-----------|
| Step 3 (CLI invocation) | `run \`generacy cockpit status <epic-ref>\` via the Bash tool, capturing stdout, stderr, and the exit code` | `call \`cockpit_status(epic=<epic-ref>)\` via the MCP tool binding` |
| Step 4 (output rendering) | "print captured stdout inside a triple-backtick fenced code block. Render stdout verbatim". | "render the tool's return payload as the same dashboard layout the CLI used; the tool's return is structured, so the renderer converts to the display shape". |
| Error handling block | `MISSING_BINARY`: "The generacy CLI is required…". | Retained; same defensive shape as `queue.md`'s block. |

### `commands/watch.md`

**UNCHANGED.** Byte-identical on this branch. `generacy cockpit watch <epic-ref>` remains a Bash invocation. The 398-1 audit still exercises this verb.

## Assertion index

The seven 406-x assertions in `describe("406 — cockpit MCP tool migration + await-events loop", …)` bind directly to the FR/SC anchors:

| Assertion | Validates | Spec anchor |
|-----------|-----------|-------------|
| **406-1** | VR-1 (tool-contract audit) | FR-007, SC-005 |
| **406-2** | VR-2 (no residual CLI verb) | FR-001, SC-001, SC-005 |
| **406-3** | VR-3 (`cockpit_await_events` loop) | FR-002, SC-003 |
| **406-4** | VR-4 (in-memory cursor) | FR-003 |
| **406-5** | VR-5 (startup sweep tool-presence check) | FR-006, SC-005 |
| **406-6** | VR-6 (invariant §9) | FR-005 |
| **406-7** | VR-7 (typed-ref error shape) | FR-004, SC-004 |

## Fixtures

Three new fixtures under `packages/claude-plugin-cockpit/tests/fixtures/`:

### `406-tool-schemas.json`

Snapshot of the seven `cockpit_*` tool definitions (see full snapshot above in § Types → `ToolSchema`).

### `406-malformed-ref-input.json`

```json
{
  "tool": "cockpit_context",
  "declaredParams": { "issue": "generacy-ai/agency!403" },
  "note": "Bang instead of hash — the ref-layer parser should reject before the engine sees it."
}
```

### `406-malformed-ref-expected-error.json`

```json
{
  "code": "invalid-ref",
  "message": "Ref 'generacy-ai/agency!403' does not match the expected shape 'owner/repo#N'.",
  "details": {
    "input": "generacy-ai/agency!403",
    "expectedShape": "owner/repo#N",
    "suggestedFix": "Replace '!' with '#'."
  }
}
```

## Type-shape invariants (for the classifier + parser)

**Invariant M-1**: `ToolCall.declaredParams` is a set of strings, not a list — order is not asserted (playbook prose sometimes reorders parameter names).

**Invariant M-2**: `ToolSchema.requiredParams` and `ToolSchema.optionalParams` are disjoint by construction (a param is either required or optional, not both).

**Invariant M-3**: `TypedError.code` is stable across playbook rewrites (the code strings are contract-owned by generacy#917); the 406-7 assertion pins the specific codes used for `invalid-ref`, `invalid-cursor`, and `tool-not-registered`.

**Invariant M-4**: `CursorState` transitions never emit a persistence side effect — the classifier's state machine has no I/O in its transition function. This is asserted by 406-4's negative-anchor grep.
