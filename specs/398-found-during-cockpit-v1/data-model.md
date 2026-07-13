# Data Model: #398 — D.5 token fix + `merge.md` frontmatter fix + help-snapshot fixtures + audit parser

Playbook structural model (pre/post layout), snapshot-fixture format, regression-fixture format, and audit-parser input/output. This is the design-time reference the implementer follows; each numbered contract invariant (C.1 – C.13) is a machine-checkable claim reflected in either the static grep list ([quickstart.md](./quickstart.md)) or the behavioral assertions in `tests/playbook-verification.test.ts`.

## 1. `auto.md` D.5 — pre/post layout (2-line token substitution)

### 1.1 Pre-state (current `auto.md`, line 171)

```markdown
### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green. Verbatim event string: `completed:validate`.

**Dispatch**:
1. **Confirm state via `cockpit status --json`** — verify `checks_state == "green"` and no infrastructure/runner failures. A `completed:validate` streamed event whose live state shows red falls through to D.6.
2. **Merge**: `generacy cockpit merge <pr-ref>` (squash, branch delete per the CLI's default).
3. **No gate.** The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt.
```

### 1.2 Post-state (proposed)

```markdown
### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green. Verbatim event string: `completed:validate`.

**Dispatch**:
1. **Confirm state via `cockpit status --json`** — verify `checks_state == "green"` and no infrastructure/runner failures. A `completed:validate` streamed event whose live state shows red falls through to D.6.
2. **Merge**: `generacy cockpit merge <issue>` (squash, branch delete per the CLI's default; the CLI resolves the issue's linked PR internally — passing a PR ref directly is a distinct failure mode observed in agency#398).
3. **No gate.** The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt.
```

**Contract invariants**:
- **C.1**: `auto.md` D.5 dispatch step 2 contains the exact string `generacy cockpit merge <issue>` (positive greppable anchor).
- **C.2**: `auto.md` does NOT contain the string `<pr-ref>` anywhere (negative anchor — smoking-gun regression check).

### 1.3 Related edit — § Dispatch table row (line 66)

The § Dispatch table row for D.5 already reads `| D.5 | \`completed:validate\` + green | \`cockpit merge\` (no gate — human verdict was implementation-review) |` and does NOT name an argument token. No table edit is needed there. Confirming this is intentional (the table's Action-shape column is deliberately terse — argument tokens live in the prose block).

### 1.4 Related edit — § Ledger table row (line 604)

The § Ledger table row for D.5 reads `| D.5 merge (green) | \`merge\` | \`merged (PR #<n>)\`, ... |` and does NOT reference `<pr-ref>` or `<issue>`. No edit needed.

## 2. `merge.md` frontmatter + prose — pre/post layout

### 2.1 Pre-state (current `merge.md`, lines 1-10)

```yaml
---
description: Merge a PR via generacy cockpit merge; on red checks, spawn a bounded fixer subagent and re-evaluate. Never merges on red.
arguments:
  - name: ref
    description: "PR reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR."
    required: false
  - name: --max-fix-attempts
    description: "Max fixer passes on red (default 1)"
    required: false
---
```

### 2.2 Post-state (proposed)

```yaml
---
description: Merge a PR via generacy cockpit merge; on red checks, spawn a bounded fixer subagent and re-evaluate. Never merges on red.
arguments:
  - name: issue
    description: "Issue reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR's linked issue. Passing a PR reference directly is a distinct failure mode — the CLI resolves the linked PR from the issue internally."
    required: false
  - name: --max-fix-attempts
    description: "Max fixer passes on red (default 1)"
    required: false
---
```

### 2.3 Related prose edits — step 1 parsing (current line 24-28)

**Pre-state**:
```markdown
1. **Parse arguments** — Extract:
   - `<pr-ref>` (positional, optional) — if omitted, resolve from the current branch's open PR via `gh pr view --json url,number,headRefName -q .` (from the repository root).
   - `--max-fix-attempts=N` (integer, default `1`; must be `>= 0`). Setting `0` short-circuits the fixer entirely; setting `>= 1` allows up to N fixer passes.

   On usage error, print `Usage: /cockpit:merge [<pr-ref>] [--max-fix-attempts=N]` and exit non-zero.
```

**Post-state**:
```markdown
1. **Parse arguments** — Extract:
   - `<issue>` (positional, optional) — an issue reference (owner/repo#N, #N, or bare integer). If omitted, resolve the current branch's open PR via `gh pr view --json url,number,headRefName -q .` and pass its linked issue to the CLI. Passing a PR reference directly is prohibited — the CLI resolves the linked PR from the issue internally (see agency#398).
   - `--max-fix-attempts=N` (integer, default `1`; must be `>= 0`). Setting `0` short-circuits the fixer entirely; setting `>= 1` allows up to N fixer passes.

   On usage error, print `Usage: /cockpit:merge [<issue>] [--max-fix-attempts=N]` and exit non-zero.
```

### 2.4 Related prose edits — step 4 CLI invocation (current line 34)

**Pre-state**:
```markdown
4. **Invoke CLI** — Run `generacy cockpit merge <resolved-pr-ref>` via the Bash tool. Parse stdout as JSON with fields `{ result, reason, pr, checks, details }` where `result` ∈ `{ merged, red, blocked }`. On JSON parse failure, apply the **Error handling** block below.
```

**Post-state**:
```markdown
4. **Invoke CLI** — Run `generacy cockpit merge <resolved-issue>` via the Bash tool. Parse stdout as JSON with fields `{ result, reason, pr, checks, details }` where `result` ∈ `{ merged, red, blocked }`. On JSON parse failure, apply the **Error handling** block below.
```

### 2.5 Related prose edits — Examples (current lines 85-87)

**Pre-state**:
```markdown
`/cockpit:merge` — resolves the current branch's open PR and attempts merge; on red-checks with one attempt remaining, spawns a fixer, re-checks, and merges if green.

`/cockpit:merge generacy-ai/agency#789 --max-fix-attempts=2` — merges PR #789 with up to two fixer passes.
```

**Post-state**:
```markdown
`/cockpit:merge` — resolves the current branch's open PR, extracts its linked issue, and attempts merge; on red-checks with one attempt remaining, spawns a fixer, re-checks, and merges if green.

`/cockpit:merge generacy-ai/agency#789 --max-fix-attempts=2` — merges the PR linked to issue #789 with up to two fixer passes. (The bare `#789` is an issue reference, per the CLI's contract; the CLI resolves its linked PR internally.)
```

**Contract invariants**:
- **C.3**: `merge.md` frontmatter contains `name: issue` (positive anchor for the argument rename).
- **C.4**: `merge.md` does NOT contain `<pr-ref>` anywhere (negative anchor — the same drift at the slash-command surface).
- **C.5**: `merge.md` step 1 usage-error prose uses `Usage: /cockpit:merge [<issue>] [--max-fix-attempts=N]` (positive greppable anchor).

## 3. `tests/fixtures/help-snapshots/<verb>.txt` — file shape

### 3.1 Format

Each snapshot file is:

```
# captured from: generacy --version <X.Y.Z>
<VERBATIM stdout of `generacy cockpit <verb> --help`>
```

The header comment is the **first line** of the file. The rest is the verbatim `--help` output, byte-for-byte. No trailing edits, no reformatting, no ANSI-code stripping (the audit's parser normalizes ANSI at read time if the snapshot happens to contain color codes — but the snapshot is captured with `NO_COLOR=1` or equivalent by the refresh script to keep the file human-readable).

### 3.2 Example (`tests/fixtures/help-snapshots/merge.txt`, illustrative)

```
# captured from: generacy --version 1.5.0-preview.42
Usage: generacy cockpit merge <issue> [options]

  Squash-merge the PR for <issue> iff it carries completed:validate and its
  checks are all green. Never merges on red.

Arguments:
  <issue>  Issue reference (owner/repo#N, #N, or bare integer). Required.

Options:
  --max-fix-attempts=N   Max fixer passes on red (default 1)
  -h, --help             Show this help
```

### 3.3 Set of snapshot files shipped in this PR

One file per distinct verb invoked from `commands/*.md`. Expected set based on current playbook prose (validated at implement time):

- `help-snapshots/merge.txt` — verb: `merge`; expected usage-arg-kind: `<issue>`.
- `help-snapshots/advance.txt` — verb: `advance`; expected usage-arg-kind: `<issue-ref>` (verify at implement time).
- `help-snapshots/resume.txt` — verb: `resume`; expected usage-arg-kind: `<issue-ref>` (verify at implement time).
- `help-snapshots/queue.txt` — verb: `queue`; expected usage-arg-kind: `<epic-ref>` + `<phase>` (verify at implement time).
- `help-snapshots/context.txt` — verb: `context`; expected usage-arg-kind: `<issue-ref>` (verify at implement time).
- `help-snapshots/status.txt` — verb: `status`; expected usage-arg-kind: `<epic-ref>` (verify at implement time).
- `help-snapshots/watch.txt` — verb: `watch`; expected usage-arg-kind: `<epic-ref>` (verify at implement time).

If a verb has multiple positional arguments (e.g., `queue <epic-ref> <phase>`), the audit's usage-line parser extracts the ordered list of arg-kind tokens and the playbook invocation is matched position-by-position.

**Contract invariants**:
- **C.6**: Each `help-snapshots/<verb>.txt` starts with a `# captured from: generacy --version ` line (positive greppable anchor).
- **C.7**: The set of `help-snapshots/*.txt` files matches the set of distinct verbs found by grepping `commands/*.md` for `generacy cockpit <verb>` (verified by the refresh script's "enumerate verbs" step).

## 4. `tests/fixtures/398-drift-auto.md` — regression fixture shape

### 4.1 Format

A minimal markdown file containing just the pre-fix D.5 section (plus enough table/prose context for the parser to locate the invocation). Approximately 15-25 lines total.

### 4.2 Content (illustrative — final shape decided at implement time)

```markdown
# Fixture: pre-fix agency#398 D.5 drift

This fixture reproduces the pre-fix D.5 dispatch step from auto.md, used by
assertion 398-2 to confirm the drift audit catches the specific mismatch.

## Dispatch

| # | Event | Action shape |
|---|-------|--------------|
| D.5 | `completed:validate` + green | `cockpit merge` (no gate — human verdict was implementation-review) |

### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green.

**Dispatch**:
1. **Confirm state via `cockpit status --json`**.
2. **Merge**: `generacy cockpit merge <pr-ref>` (squash, branch delete per the CLI's default).
3. **No gate.**
```

### 4.3 Expected audit behavior on this fixture

Feeding `398-drift-auto.md` through the audit MUST produce exactly one mismatch:

```
{
  file: "packages/claude-plugin-cockpit/tests/fixtures/398-drift-auto.md",
  line: 17,  // the line containing `generacy cockpit merge <pr-ref>`
  verb: "merge",
  observed: "<pr-ref>",
  expected: "<issue>",  // read from help-snapshots/merge.txt
}
```

If the audit reports zero mismatches OR more than one OR the wrong `{observed, expected}` pair, assertion 398-2 fails — that's the machine-checkable proof the audit's regex logic isn't vacuous.

**Contract invariants**:
- **C.8**: `tests/fixtures/398-drift-auto.md` exists and contains the exact string `generacy cockpit merge <pr-ref>` in an inline backtick span.
- **C.9**: Assertion 398-2 asserts the audit reports the specific `{observed: '<pr-ref>', expected: '<issue>'}` mismatch on this fixture.

## 5. Audit parser — input/output contract

### 5.1 Input

- **Files**: an array of file paths (`string[]`). For assertion 398-1: `commands/*.md`. For assertion 398-2: `[tests/fixtures/398-drift-auto.md]`.
- **Snapshots**: a map `verb → snapshotUsageArgTokens`. For each verb, the ordered list of positional argument-kind tokens extracted from the snapshot's usage line (e.g., `merge → ['<issue>']`, `queue → ['<epic-ref>', '<phase>']`).

### 5.2 Extraction rules (Q2=B)

For each file, the parser scans for `generacy cockpit <verb>` occurrences under two modes:

**Mode (a) — Fenced code blocks**: A fenced block (triple-backtick or 4-space-indent) whose first non-whitespace token on any line is `generacy cockpit <verb>`. The parser tokenizes the line and extracts the argument tokens (each `<...>` bracketed placeholder OR each concrete arg literal, in order).

**Mode (b) — Inline backtick spans**: A single- or double-backtick span containing `generacy cockpit <verb>` followed by ≥1 additional token. The parser tokenizes the span content and extracts the argument tokens.

Bare-verb spans (`` `generacy cockpit merge` `` with no additional tokens) are **not** invocations and are skipped.

### 5.3 Output

An array of `Invocation` records:

```typescript
interface Invocation {
  file: string;
  line: number;          // 1-based line number in the file
  verb: string;          // e.g., "merge"
  argTokens: string[];   // e.g., ["<issue>"] or ["<epic-ref>", "<phase>"]
  source: "fenced" | "inline";
}
```

### 5.4 Audit rule

For each `Invocation`:
- Look up the snapshot for `invocation.verb` → `snapshotArgTokens: string[]`.
- Compare `invocation.argTokens[i]` to `snapshotArgTokens[i]` for each position `i`.
- On mismatch, record a `Mismatch`:

```typescript
interface Mismatch {
  file: string;
  line: number;
  verb: string;
  position: number;     // 0-based position of the mismatched argument
  observed: string;     // e.g., "<pr-ref>"
  expected: string;     // e.g., "<issue>"
}
```

The audit passes if `mismatches.length === 0`.

### 5.5 Positional matching, not shape matching

The audit matches by position in the argument list — it does not attempt to reconcile "PR ref" and "issue ref" as semantically-similar tokens. `<pr-ref>` and `<issue>` are strings that differ at position 0 of the `merge` invocation; the audit reports the mismatch verbatim without judgment.

This is the Q3=A exact-match rule at the implementation level. If a future `--help` renames `<issue>` to `<issue-ref>`, every playbook invocation of `merge` that uses `<issue>` becomes a mismatch until the snapshot AND the playbook are refreshed in the same commit. This is the intended behavior — the audit is a drift signal, not a normalization layer.

**Contract invariants**:
- **C.10**: The parser extracts invocations from both fenced blocks and inline backtick spans that carry an argument (Q2=B).
- **C.11**: Bare-verb spans (no argument) are skipped and do not appear in the `Invocation[]` output.
- **C.12**: The audit rule is exact positional string comparison (no normalization, no equivalence table).

## 6. Refresh script — invocation contract

### 6.1 Invocation

```
bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh
```

### 6.2 Behavior

1. Pre-flight: `command -v generacy`. On failure, print `error: generacy CLI not on $PATH; refresh must run inside a cluster session (add /shared-packages/node_modules/.bin to PATH) or after 'npm install -g @generacy-ai/generacy'` and exit non-zero.
2. Enumerate distinct verbs: grep `commands/*.md` for `generacy cockpit <verb>`, extract the verb, dedupe.
3. Capture the CLI version: `generacy --version` → `<X.Y.Z>`.
4. For each distinct verb:
   a. Run `generacy cockpit <verb> --help` with `NO_COLOR=1` (or equivalent) to suppress ANSI codes.
   b. Prefix the output with `# captured from: generacy --version <X.Y.Z>\n`.
   c. Write to `tests/fixtures/help-snapshots/<verb>.txt`, overwriting any existing file.
5. Print a summary line: `Refreshed <N> snapshots from generacy --version <X.Y.Z>`.
6. Exit zero on success.

### 6.3 Non-goals

- **Does NOT run in CI.** The script is operator-triggered; CI reads the checked-in snapshots. This is the Q1=A decoupling.
- **Does NOT modify `commands/*.md`.** The script is snapshot-only; playbook edits are the operator's responsibility (informed by the audit's mismatch reports).
- **Does NOT track snapshot deletions.** If a verb is removed from all playbooks, the operator manually deletes the corresponding `<verb>.txt` file. The audit's set-check (C.7) surfaces the discrepancy.

**Contract invariants**:
- **C.13**: `scripts/refresh-help-snapshots.sh` exists and is executable (shebang line is `#!/usr/bin/env bash` or repo-standard equivalent).

## 7. Test-file extension

`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (created by #394; extended by #396; extend, don't rewrite):

- Add a new `describe("398 — playbook invocations match generacy cockpit <verb> --help", …)` block below the existing 396 describe block.
- Inside, two `it(…)` assertions (398-1, 398-2) per the contracts in [contracts/](./contracts/).
- Parser helpers (`parseInvocations`, `parseSnapshotUsageLine`) are colocated in the test file (not in `lib/`) — the runtime is the playbook prose, not a runtime module, so the parser is a test-side reference implementation.

No changes to the existing `describe("394 — …")` or `describe("396 — …")` blocks, their imports, or their assertions — the 394 and 396 assertions must continue to pass unchanged. The 398 block imports from `../commands/*.md` (raw reads) and `./fixtures/help-snapshots/*.txt` (raw reads); no new module imports.

## 8. Sibling-playbook byte-identity check

Files that must remain byte-identical across this branch **except** for co-located token substitutions the audit reveals:

```
packages/claude-plugin-cockpit/commands/clarify.md
packages/claude-plugin-cockpit/commands/review.md
packages/claude-plugin-cockpit/commands/queue.md
packages/claude-plugin-cockpit/commands/watch.md
packages/claude-plugin-cockpit/commands/status.md
```

Expected: `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,review,queue,watch,status}.md` is empty. If pre-existing drift on the same axis is discovered when the audit runs, the fix is a co-located token substitution in the same PR — that's the audit doing its job. Documented in [quickstart.md § Static checks](./quickstart.md).

## 9. Contract-invariant checklist

| # | Location | Verifier |
|---|----------|----------|
| C.1 | `auto.md` D.5 dispatch step 2 = `generacy cockpit merge <issue>` | Static grep + Vitest 398-1 (indirectly, via mismatch=empty check) |
| C.2 | `auto.md` contains no `<pr-ref>` | Static grep (negative anchor) |
| C.3 | `merge.md` frontmatter contains `name: issue` | Static grep |
| C.4 | `merge.md` contains no `<pr-ref>` | Static grep (negative anchor) |
| C.5 | `merge.md` step 1 uses `Usage: /cockpit:merge [<issue>]` | Static grep |
| C.6 | Each `help-snapshots/<verb>.txt` first line = `# captured from: generacy --version ` | Static grep |
| C.7 | `help-snapshots/*.txt` set = distinct verbs in `commands/*.md` | Refresh-script enumeration step |
| C.8 | `398-drift-auto.md` contains `generacy cockpit merge <pr-ref>` | Static grep |
| C.9 | 398-2 reports the specific mismatch on `398-drift-auto.md` | Vitest 398-2 |
| C.10 | Parser extracts fenced + inline-with-argument invocations | Vitest (implicit via 398-1 catching D.5's inline drift on the regression fixture) |
| C.11 | Parser skips bare-verb spans (no argument) | Vitest 398-2 (fixture has bare-verb spans in prose that must NOT be flagged) |
| C.12 | Audit rule is exact positional string comparison | Vitest 398-1, 398-2 |
| C.13 | `scripts/refresh-help-snapshots.sh` exists and is executable | Static check (`test -x`) |

Behavioral:
- **398-1**: audit reports zero mismatches across `commands/*.md` (day-one green expected). Load-bearing surface for future drift.
- **398-2**: audit reports the specific `{observed: '<pr-ref>', expected: '<issue>'}` mismatch on `tests/fixtures/398-drift-auto.md`. Positive-signal regression — guards against the audit silently degrading to no-op.
