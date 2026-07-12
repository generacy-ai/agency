# Contract: MCP tool migration

**Feature**: #406
**Owning surface**: `commands/{auto,clarify,review,merge,queue,status}.md`
**Owned by**: This branch (`406-follow-up-generacy-ai`)
**Anchored FRs**: FR-001, FR-004, FR-007
**Anchored SCs**: SC-001, SC-004, SC-005

## Summary

Every occurrence of `generacy cockpit <verb>` in the six in-scope playbooks becomes the matching `cockpit_*` MCP tool call. This contract pins the verb-to-tool mapping, the parameter shape for each tool, and the typed-error surface the migrated call sites consume.

## Verb-to-tool mapping

| CLI verb | MCP tool | Required params | Optional params | Contract preservation |
|----------|----------|-----------------|-----------------|-----------------------|
| `generacy cockpit status --json <epic>` | `cockpit_status` | (none) | `epic`, `json` | Same return payload shape as `--json` CLI stdout. |
| `generacy cockpit context <issue>` | `cockpit_context` | `issue` | (none) | Same return payload shape as CLI stdout. |
| `generacy cockpit queue <epic> <phase> --yes` | `cockpit_queue` | `epic`, `phase` | (none) | The `--yes` flag retires — no interactive confirm at the tool boundary. |
| `generacy cockpit advance --gate <name> <issue>` | `cockpit_advance` | `issue`, `gate` | (none) | Same exit-code / advance semantics. |
| `generacy cockpit resume <issue>` | `cockpit_resume` | `issue` | (none) | Same exit-code / restore semantics. |
| `generacy cockpit merge <issue>` | `cockpit_merge` | `issue` | (none) | Same `{result, reason, pr, checks, details}` return shape. |

Plus one net-new tool (no CLI equivalent):

| MCP tool | Required params | Optional params | Purpose |
|----------|-----------------|-----------------|---------|
| `cockpit_await_events` | `epic` | `cursor`, `maxWaitMs`, `coalesceWindowMs`, `maxBatchSize` | Long-poll for batched transition events. Replaces Bash `cockpit watch` + Monitor primitive in `auto.md`. Defaults per generacy#917: `maxWaitMs=55000`, `coalesceWindowMs=3000`, `maxBatchSize=256` (soft-cap). |

## Call-site rewrite examples

### Example 1: `commands/clarify.md` step 3

**Before**:

```markdown
3. **Fetch context** — Invoke `generacy cockpit context <issue>` via the Bash tool. This is the renamed successor to `clarify-context`; the old verb no longer exists. Handle:
   - Exit `0` → parse stdout as the JSON payload …
   - CLI reports "no open clarifications" → …
   - Any other non-zero exit → apply the **Error handling** block below.
```

**After**:

```markdown
3. **Fetch context** — Call the `cockpit_context` MCP tool with `issue=<issue-ref>`. Handle:
   - Success → consume the tool's return payload (open-question list, spec/plan bodies, touched files, and the raw `clarificationComment.body`).
   - Typed error `code: "no-open-clarifications"` → print `no open clarification questions for <issue-ref>` and exit zero without posting or advancing.
   - Any other typed error → apply the **Error handling** block below with class `OTHER`, quoting the tool's `code`/`message`/`details` inside a triple-backtick fenced code block.
```

### Example 2: `commands/queue.md` step 4

**Before**:

```markdown
4. **CLI pre-flight + invocation** (reached only when step 3 returned `Confirm`) — Pre-flight `command -v generacy >/dev/null 2>&1`. … Otherwise, from the repository root, run `generacy cockpit queue <epic-ref> <phase> --yes` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables.
```

**After**:

```markdown
4. **Tool invocation** (reached only when step 3 returned `Confirm`) — Call `cockpit_queue(epic=<epic-ref>, phase=<phase>)` via the MCP tool binding. Consume the typed return. (No `--yes` flag — the tool has no interactive confirm; the `AskUserQuestion` in step 2 is the sole gate.)
```

### Example 3: `commands/auto.md` D.1 step 1

**Before**:

```markdown
1. **Fetch context**: `generacy cockpit context <issue>` (the same CLI verb `/cockpit:clarify` uses — the renamed successor to `clarify-context`). The payload's `clarificationComment.body` field carries …
```

**After**:

```markdown
1. **Fetch context**: `cockpit_context(issue=<issue-ref>)` (the same MCP tool `/cockpit:clarify` uses). The return payload's `clarificationComment.body` field carries …
```

### Example 4: `commands/merge.md` step 4

**Before**:

```markdown
4. **Invoke CLI** — Run `generacy cockpit merge <issue>` via the Bash tool. Parse stdout as JSON with fields `{ result, reason, pr, checks, details }` where `result` ∈ `{ merged, red, blocked }`. On JSON parse failure, apply the **Error handling** block below.
```

**After**:

```markdown
4. **Invoke tool** — Call `cockpit_merge(issue=<issue-ref>)` via the MCP tool binding. Consume the tool's return, a typed value with fields `{ result, reason, pr, checks, details }` where `result` ∈ `{ merged, red, blocked }`. On typed-error return, apply the **Error handling** block below with class `OTHER`.
```

## Typed error surface

**Wire shape** (per generacy#917's contract):

```json
{
  "code": "<string, stable enum>",
  "message": "<string, single-line human-readable>",
  "details": { "<field>": "<value>", ... }
}
```

**Stable error codes** (referenced by 406-7 fixture assertions):

| Code | When | `details` fields |
|------|------|------------------|
| `invalid-ref` | Malformed ref passed as `issue` or `epic` param. | `input`, `expectedShape`, `suggestedFix` |
| `invalid-cursor` | Stale/corrupted cursor passed to `cockpit_await_events`. | `cursor`, `sessionAgeMs` (approximate) |
| `no-open-clarifications` | `cockpit_context` on an issue with a resolved clarification gate. | `issue`, `gateState` |
| `not-actionable` | `cockpit_advance` / `cockpit_resume` on an issue not in the expected state. | `issue`, `currentState`, `expectedState` |
| `tool-not-registered` | Any `cockpit_*` call when the tool server isn't registered (surfaces only if the startup-sweep tool-presence check is bypassed, which is a contract violation). | `tool` |

**No CLI stderr regex.** Post-migration, migrated call sites route typed errors through the tool's `code`/`message`/`details` surface, not through the `MISSING_BINARY` / `AUTH_FAILURE` / `OTHER` regex-based Error handling block. The Error handling block is retained for non-cockpit Bash CLI invocations (`gh`, `git`) that remain in the migrated playbooks.

**Refusal at the tool boundary**: A malformed ref is rejected before any engine call. The tool returns `code: "invalid-ref"` with actionable `details` (input received, expected shape, suggested fix); the playbook's response is to surface the typed error to the operator (via the § Error handling class-`OTHER` fenced code block) or, in `auto.md`, to record a ledger line and continue. This eliminates the CLI-era diagnosis-round-burn class (agency#398's PR-number-as-issue scenario becomes a one-turn rejection).

## Playbook-level integration rules

- **R1**: A migrated site never invokes the Bash tool with `generacy cockpit <migrated-verb>`. Enforced by 406-2.
- **R2**: A migrated site never re-parses tool errors via the `MISSING_BINARY` / `AUTH_FAILURE` regex classifier. The typed-error surface's `code` IS the classification; the classifier lives at the tool boundary. Migrated call-site prose reflects this.
- **R3**: A migrated site preserves the same downstream decision tree as the pre-migration site (e.g., `merge.md` step 5's `result` × `reason` routing). Return-shape compatibility is a contract of generacy#917 for the six migrated verbs (each tool's return matches the CLI's `--json` output shape for the same verb).
- **R4**: A migrated site preserves the same gate contracts (G.1–G.5 from `auto.md`, plus the `Confirm`/`Cancel` gate in `queue.md`). The migration is invocation-mechanism-only; the operator surface is byte-identical.

## Audit shape (406-1)

The tool-contract audit exercises three rules per migrated playbook:

1. **Tool name coverage**: every `cockpit_*` call names a tool in the schema snapshot (`406-tool-schemas.json`).
2. **Param name coverage**: every declared parameter is a required or optional parameter of the named tool.
3. **Required param presence**: every required parameter is declared at the call site (when the call site names params by identifier).

Mismatches are reported with `file:line`, tool name, declared parameters, expected parameter set. See `data-model.md` § VR-1 and `tests/playbook-verification.test.ts` `describe("406 —", …)` block for the implementation.

## What's out of scope for this contract

- The tool server's implementation (owned by generacy#917).
- The runtime registration mechanism (owned by cluster-base#75).
- The `watch` verb and its NDJSON stream (out-of-scope per Q4 clarification and generacy#917's out-of-scope note).
- The `gh` and `git` Bash CLI invocations that remain in the migrated playbooks (still routed through the § Error handling block).
