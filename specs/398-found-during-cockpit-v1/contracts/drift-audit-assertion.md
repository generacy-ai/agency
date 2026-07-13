# Contract: Drift audit assertion (398-1) + regression assertion (398-2)

Structural contract for the two assertions appended to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` that enforce the drift audit at build time.

## Overview

Two `it(...)` assertions inside a new `describe("398 — playbook invocations match generacy cockpit <verb> --help", ...)` block:

- **398-1 (drift audit)**: sweeps all `commands/*.md`, parses invocations per [invocation-parser-rules.md](./invocation-parser-rules.md), cross-checks against `help-snapshots/*.txt`, and asserts zero mismatches. Day-one green expected.
- **398-2 (regression check)**: feeds `tests/fixtures/398-drift-auto.md` through the same pipeline, asserts the specific `{observed: '<pr-ref>', expected: '<issue>'}` mismatch is reported.

## Assertion 398-1 — drift audit

### Purpose

Machine-checkable enforcement that every `generacy cockpit <verb>` invocation in `commands/*.md` uses argument-kind tokens verbatim matching the corresponding `--help` snapshot (per Q1=A source, Q2=B extraction, Q3=A match semantics).

### Setup

```typescript
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(__dirname, "..", "commands");
const SNAPSHOTS_DIR = resolve(__dirname, "fixtures", "help-snapshots");
```

### Assertion body

```typescript
it("398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token", () => {
  // 1. Enumerate snapshot files → known verbs + expected arg-token lists.
  const snapshotFiles = readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith(".txt"));
  const knownVerbs = snapshotFiles.map(f => f.slice(0, -".txt".length));
  const snapshots: Record<string, string[]> = {};
  for (const verb of knownVerbs) {
    const content = readFileSync(resolve(SNAPSHOTS_DIR, `${verb}.txt`), "utf-8");
    snapshots[verb] = parseSnapshotUsageArgTokens(content, verb);
  }

  // 2. Enumerate playbook files.
  const playbookFiles = readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => resolve(COMMANDS_DIR, f));

  // 3. Parse invocations from each playbook file.
  const invocations = playbookFiles.flatMap(f => parseInvocations(f, knownVerbs));

  // 4. Cross-check each invocation's argument tokens against the snapshot.
  const mismatches: Mismatch[] = [];
  for (const invocation of invocations) {
    const expected = snapshots[invocation.verb];
    if (!expected) {
      mismatches.push({
        file: invocation.file,
        line: invocation.line,
        verb: invocation.verb,
        position: -1,
        observed: `<no snapshot for verb '${invocation.verb}'>`,
        expected: `<snapshot file missing at ${SNAPSHOTS_DIR}/${invocation.verb}.txt>`,
      });
      continue;
    }
    for (let i = 0; i < expected.length; i++) {
      const observedToken = invocation.argTokens[i];
      const expectedToken = expected[i];
      if (observedToken === undefined) {
        // Fewer args in invocation than in usage — could be a documented optional invocation
        // (e.g., the playbook wrote `generacy cockpit merge` with the arg omitted in an example).
        // The has-an-argument rule of Mode (b) already excludes bare-verb spans, so if we reach
        // here with a missing positional, it's a genuine incomplete invocation.
        break;
      }
      if (observedToken !== expectedToken) {
        mismatches.push({
          file: invocation.file,
          line: invocation.line,
          verb: invocation.verb,
          position: i,
          observed: observedToken,
          expected: expectedToken,
        });
      }
    }
  }

  // 5. Assert zero mismatches. Failure message lists every mismatch inline.
  const failureMessage = mismatches
    .map(m =>
      `  ${m.file}:${m.line}  verb=${m.verb} position=${m.position}  ` +
      `observed=${m.observed}  expected=${m.expected}`
    )
    .join("\n");
  expect(mismatches, `\nInvocation-vs-help drift detected (${mismatches.length} mismatches):\n${failureMessage}`).toEqual([]);
});
```

### Day-one expected state

Post-fix, `mismatches.length === 0`. The audit passes green.

If pre-existing sibling-playbook drift is discovered when the audit first runs (e.g., `queue.md` uses `<phase-name>` where `queue --help` says `<phase>`), the fix is a verbatim token substitution in `queue.md` in the same PR — the audit is exhaustive by design.

### Failure interpretation

- **Mismatch at `commands/auto.md` D.5**: the D.5 fix wasn't applied or was reverted. Restore per [d5-token-fix.md](./d5-token-fix.md).
- **Mismatch at `commands/merge.md` step 1**: the merge.md frontmatter/prose fix wasn't applied or was reverted. Restore per [merge-md-frontmatter-fix.md](./merge-md-frontmatter-fix.md).
- **Mismatch at a sibling playbook** (`clarify.md`, `review.md`, etc.): pre-existing drift discovered. Fix in the same PR by verbatim token substitution.
- **Mismatch with `expected: <snapshot file missing at ...>`**: a snapshot file is missing for a verb the playbook invokes. Run `bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh` to regenerate.
- **Mismatch after a `--help` wording change**: the CLI's `--help` output changed under the audit. Run the refresh script to regenerate snapshots; update the playbook to match the new snapshot in the same commit.

## Assertion 398-2 — regression check

### Purpose

Positive-signal proof that the audit's parser and match logic actually work — a fixture file with known drift is fed through the same pipeline and MUST produce the expected mismatch. Guards against future refactors silently disabling the audit (e.g., a regex-scope bug that makes the parser skip inline spans, an off-by-one in the tokenizer that swallows the `<pr-ref>` token).

### Setup

Same imports as 398-1, plus:

```typescript
const FIXTURE_398_DRIFT_AUTO = resolve(__dirname, "fixtures", "398-drift-auto.md");
```

### Assertion body

```typescript
it("398-2 (regression check): audit reports the known pre-fix D.5 drift on 398-drift-auto.md fixture", () => {
  // 1. Enumerate snapshot files → known verbs + expected arg-token lists.
  const snapshotFiles = readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith(".txt"));
  const knownVerbs = snapshotFiles.map(f => f.slice(0, -".txt".length));
  const snapshots: Record<string, string[]> = {};
  for (const verb of knownVerbs) {
    const content = readFileSync(resolve(SNAPSHOTS_DIR, `${verb}.txt`), "utf-8");
    snapshots[verb] = parseSnapshotUsageArgTokens(content, verb);
  }

  // 2. Parse invocations from the regression fixture.
  const invocations = parseInvocations(FIXTURE_398_DRIFT_AUTO, knownVerbs);

  // 3. Sanity check: parser found at least the D.5 invocation.
  const mergeInvocations = invocations.filter(i => i.verb === "merge");
  expect(mergeInvocations.length).toBeGreaterThanOrEqual(1);

  // 4. Cross-check against snapshot.
  const mismatches: Mismatch[] = [];
  for (const invocation of invocations) {
    const expected = snapshots[invocation.verb] ?? [];
    for (let i = 0; i < expected.length; i++) {
      const observedToken = invocation.argTokens[i];
      if (observedToken === undefined) break;
      if (observedToken !== expected[i]) {
        mismatches.push({
          file: invocation.file,
          line: invocation.line,
          verb: invocation.verb,
          position: i,
          observed: observedToken,
          expected: expected[i]!,
        });
      }
    }
  }

  // 5. Assert exactly one mismatch: verb=merge, position=0, observed=<pr-ref>, expected=<issue>.
  expect(mismatches).toHaveLength(1);
  const m = mismatches[0]!;
  expect(m.verb).toBe("merge");
  expect(m.position).toBe(0);
  expect(m.observed).toBe("<pr-ref>");
  expect(m.expected).toBe("<issue>");
});
```

### Day-one expected state

Post-fix, 398-2 passes: the audit reports exactly the expected mismatch on the fixture, confirming the pipeline works.

### Failure interpretation

- **`mismatches.length === 0`**: the parser did not extract the D.5 invocation from the fixture. Either:
  - The parser regressed and no longer handles inline backtick spans (Q2=B regression). Fix per [invocation-parser-rules.md](./invocation-parser-rules.md).
  - The regression fixture's D.5 row was accidentally edited to no longer contain the drift. Restore the fixture from git history.
- **`mismatches.length > 1`**: the parser is flagging more than the intended D.5 drift. Either:
  - The regression fixture contains other unintended invocations (extend the fixture's context to include only the D.5 row).
  - The parser is emitting false-positives on bare-verb prose in the fixture. Fix the has-an-argument rule per [invocation-parser-rules.md](./invocation-parser-rules.md).
- **`m.observed !== "<pr-ref>"` or `m.expected !== "<issue>"`**: either the fixture was edited (restore) or the snapshot for `merge` was changed (restore or refresh — check `help-snapshots/merge.txt`).

## Helpers (colocated in the test file)

### `parseSnapshotUsageArgTokens(content: string, verb: string): string[]`

Per [help-snapshot-format.md § Usage-line parsing contract](./help-snapshot-format.md#usage-line-parsing-contract):

```typescript
function parseSnapshotUsageArgTokens(snapshotContent: string, verb: string): string[] {
  const lines = snapshotContent.split("\n");
  const usagePrefix = `Usage: generacy cockpit ${verb}`;
  for (const line of lines) {
    if (line.startsWith(usagePrefix)) {
      const rest = line.slice(usagePrefix.length).trim();
      const tokens = rest.split(/\s+/).filter(t => t.length > 0);
      return tokens.filter(t => /^<[a-z][a-z0-9-]*>$/.test(t));
    }
  }
  throw new Error(`Usage line for verb '${verb}' not found in snapshot`);
}
```

### `parseInvocations(filePath: string, knownVerbs: readonly string[]): Invocation[]`

Per [invocation-parser-rules.md § Reference implementation](./invocation-parser-rules.md#reference-implementation-pseudo-typescript).

### `Mismatch` interface

```typescript
interface Mismatch {
  file: string;
  line: number;
  verb: string;
  position: number;   // -1 for "no snapshot for verb" errors
  observed: string;
  expected: string;
}
```

## Coordination with existing 394 and 396 assertions

The 394 and 396 assertions test different surfaces (mechanism gap at the stream consumer, classification gap at the dispatch surface). They MUST continue to pass unchanged when 398-1 and 398-2 are added:

- No changes to existing imports, describe blocks, or assertion bodies.
- The new 398 describe block appears **below** the 396 block.
- The new helpers (`parseSnapshotUsageArgTokens`, `parseInvocations`, `Mismatch`) are scoped inside the 398 describe block (or file-level colocated functions) — they don't override or shadow any 394/396 helpers.

Meta-check: after adding 398-1 and 398-2, the full `pnpm --filter claude-plugin-cockpit test` command reports 5 total test cases across the three describe blocks (394 has 2, 396 has 3, 398 has 2 = 7 total; adjust the count in [quickstart.md § Vitest run](./quickstart.md#vitest-run) accordingly).

## Local check to confirm the audit catches drift

Reproducible smoke test (not part of the assertions; documented in [quickstart.md](./quickstart.md)):

1. Revert the D.5 fix in `auto.md` (change `<issue>` back to `<pr-ref>`).
2. Run `pnpm --filter claude-plugin-cockpit test`.
3. Confirm 398-1 fails with the specific `commands/auto.md` D.5 mismatch.
4. Restore the fix (change back to `<issue>`).
5. Confirm 398-1 passes again.

This is the human-scale confirmation that the audit is not vacuous. Assertion 398-2 automates this check on every test run via the checked-in fixture.
