# Contract: tool-contract audit

**Feature**: #406
**Owning surface**: `tests/playbook-verification.test.ts` `describe("406 —", …)` block, assertion 406-1
**Owned by**: This branch (`406-follow-up-generacy-ai`)
**Anchored FRs**: FR-007
**Anchored SCs**: SC-005

## Summary

Replaces the CLI-invocation drift audit (`398-1`: playbook `--help`-snapshot comparison) for the six migrated verbs. The tool-contract audit asserts that every `cockpit_*` tool call in the six migrated playbooks names a tool and parameters that exist in the #917 schema exports (captured as a fixture snapshot in `406-tool-schemas.json`). The `398-1` audit's verb list narrows to `["watch"]` on this branch; `398-2`'s regression fixture on `398-drift-auto.md` is retained.

The tool-contract audit is playbook-prose greps + a small reference "tool-call classifier" in the test file, per the #398/#403 static+behavioral pattern — no new library module.

## Inputs

1. **Migrated playbook set**: `commands/{auto,clarify,review,merge,queue,status}.md`. Discovered at test time by grep (matches Q4=B's grep-driven scope).
2. **Tool schema snapshot**: `tests/fixtures/406-tool-schemas.json`. Captured from generacy#917's schema exports; refreshed via a follow-up when the tool server ships schema changes.

## Audit shape

For each migrated playbook, extract every `cockpit_*` tool call from the prose:

```typescript
type ToolCall = {
  file: string;
  line: number;
  tool: string;
  declaredParams: ReadonlyArray<string>;
};

function extractToolCalls(playbookText: string, file: string): ReadonlyArray<ToolCall> {
  const lines = playbookText.split("\n");
  const calls: ToolCall[] = [];
  const rx = /cockpit_(status|context|queue|advance|resume|merge|await_events)\s*\(([^)]*)\)/g;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(rx)) {
      const tool = "cockpit_" + m[1];
      const paramList = m[2] ?? "";
      const declaredParams = paramList
        .split(",")
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => p.split("=")[0].trim().replace(/^\*/, ""));
      calls.push({ file, line: i + 1, tool, declaredParams });
    }
  }
  return calls;
}
```

Validate each `ToolCall` against the schema snapshot:

```typescript
type ToolSchema = {
  name: string;
  requiredParams: ReadonlyArray<string>;
  optionalParams: ReadonlyArray<string>;
};

type Mismatch =
  | { kind: "unknown-tool"; call: ToolCall }
  | { kind: "unknown-param"; call: ToolCall; param: string; allowedParams: ReadonlyArray<string> }
  | { kind: "missing-required-param"; call: ToolCall; missing: string };

function auditToolCalls(
  calls: ReadonlyArray<ToolCall>,
  schemas: ReadonlyArray<ToolSchema>,
): ReadonlyArray<Mismatch> {
  const schemaByName = new Map(schemas.map(s => [s.name, s]));
  const mismatches: Mismatch[] = [];
  for (const call of calls) {
    const schema = schemaByName.get(call.tool);
    if (!schema) { mismatches.push({ kind: "unknown-tool", call }); continue; }
    const allowed = new Set([...schema.requiredParams, ...schema.optionalParams]);
    for (const p of call.declaredParams) {
      if (!allowed.has(p)) {
        mismatches.push({ kind: "unknown-param", call, param: p, allowedParams: [...allowed] });
      }
    }
    // Prose-level: required param presence is asserted only when the call site names
    // params by identifier (`cockpit_context(issue=<ref>)` — yes; `cockpit_context(<ref>)` — no,
    // positional prose is tolerated). This mirrors #398's positional-kind semantics.
    if (call.declaredParams.length > 0) {
      for (const req of schema.requiredParams) {
        if (!call.declaredParams.includes(req)) {
          mismatches.push({ kind: "missing-required-param", call, missing: req });
        }
      }
    }
  }
  return mismatches;
}
```

## Fixture: `406-tool-schemas.json`

```json
[
  {
    "name": "cockpit_status",
    "requiredParams": [],
    "optionalParams": ["epic", "json"]
  },
  {
    "name": "cockpit_context",
    "requiredParams": ["issue"],
    "optionalParams": []
  },
  {
    "name": "cockpit_queue",
    "requiredParams": ["epic", "phase"],
    "optionalParams": []
  },
  {
    "name": "cockpit_advance",
    "requiredParams": ["issue", "gate"],
    "optionalParams": []
  },
  {
    "name": "cockpit_resume",
    "requiredParams": ["issue"],
    "optionalParams": []
  },
  {
    "name": "cockpit_merge",
    "requiredParams": ["issue"],
    "optionalParams": []
  },
  {
    "name": "cockpit_await_events",
    "requiredParams": ["epic"],
    "optionalParams": ["cursor", "maxWaitMs", "coalesceWindowMs", "maxBatchSize"]
  }
]
```

Snapshot lives alongside the other fixture files; refreshed via a follow-up when generacy#917 ships schema changes.

## Report shape

Same shape as 398-1's mismatch report — one line per mismatch, sorted by `file`, then `line`:

```
  commands/auto.md:315  tool=cockpit_advance param=gates  observed=gates  allowed=[issue, gate]
  commands/merge.md:34  tool=cockpit_merge missing-required-param=issue
```

The `expect(mismatches).toEqual([])` assertion fails with the mismatch list attached; a reviewer following the assertion failure has the exact `file:line` and the drift to correct.

## Boundary with `398-1`

`398-1` was: for every `generacy cockpit <verb>` invocation in the playbook prose, verify the invocation's positional-token shape matches the CLI's `--help` snapshot for `<verb>`. It runs against every playbook in `commands/*.md` and consults `tests/fixtures/help-snapshots/*.txt` (one snapshot per known verb).

On this branch, `398-1`'s known-verb list narrows from `{status, context, queue, advance, resume, merge, watch}` to `["watch"]`:

```typescript
// Pre-#406:
const KNOWN_VERBS = [
  "status", "context", "queue", "advance", "resume", "merge", "watch"
];

// Post-#406:
const KNOWN_VERBS = ["watch"];  // Other six migrated to cockpit_* tools; see 406-1.
```

The `help-snapshots/watch.txt` fixture remains. The other six snapshot files (`status.txt`, `context.txt`, `queue.txt`, `advance.txt`, `resume.txt`, `merge.txt`) are RETAINED (not deleted) to keep `398-2`'s regression fixture on `398-drift-auto.md` working (that fixture exercises `merge`'s D.5 drift, which happens on a synthetic old-playbook input; the audit still needs the `merge` snapshot to run).

## Boundary with `398-2`

`398-2` is: run the audit on a fixed pre-fix `398-drift-auto.md` fixture and assert exactly one mismatch (the `merge` verb's D.5 PR-as-issue drift). This assertion is retained verbatim on this branch — the fixture doesn't change, the drift doesn't change, and the audit shape doesn't change for the `merge` verb specifically (it was in the pre-#406 known-verb list, and the fixture predates the migration).

The `merge` snapshot in `help-snapshots/merge.txt` is retained to serve this fixture.

## Boundary with `402-*`

`402`'s AskUserQuestion invocation contract audit is unaffected. Its assertions run on the same playbook set (with `auto.md` first-in-list) and pass through the migration boundary unchanged — the migration edits verb invocations, not `AskUserQuestion` invocations.

## Refresh workflow

When generacy#917 ships a schema change (e.g., a new optional parameter on `cockpit_advance`), the fixture is refreshed:

```bash
# Inside a cluster session with the updated generacy CLI on PATH:
generacy cockpit --export-tool-schemas > packages/claude-plugin-cockpit/tests/fixtures/406-tool-schemas.json

# Verify the diff makes sense (new params should appear in optionalParams for the
# affected tool; no unexpected additions or removals):
git diff packages/claude-plugin-cockpit/tests/fixtures/406-tool-schemas.json

# Re-run the audit:
pnpm test -- -t "406-1"
```

The exact CLI flag (`--export-tool-schemas`) is generacy#917's, not this branch's.

## What's out of scope for this contract

- The tool server's schema-export mechanism (owned by generacy#917).
- Runtime validation of tool calls (owned by the MCP tool binding / Claude Code SDK).
- The `--help` snapshot refresh workflow for `watch.md` (still owned by `scripts/refresh-help-snapshots.sh`).
- Cross-playbook consistency checks beyond the tool-call shape (e.g., "every playbook that uses `cockpit_context` reads the same field from the return") — the return-shape contract is owned by generacy#917 and by each playbook individually.
