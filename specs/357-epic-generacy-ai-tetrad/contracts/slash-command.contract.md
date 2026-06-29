# Contract: `/cockpit:breakdown` slash-command interface

**Feature**: 357-epic-generacy-ai-tetrad

This codifies the external contract of `packages/claude-plugin-cockpit/commands/breakdown.md` — what users invoke and what they observe.

## Invocation

```
/cockpit:breakdown <epic>
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `<epic>` | yes | — | Epic reference (e.g., `tetrad-development#85`, `85`, an epic key); resolved via the shared resolver (#788) to `{ epic_ref, doc_path, repo }`. |

No v1 flags. `--no-confirm`, `--dry-run`, `--manifest-only` are out of scope.

## Frontmatter shape

```yaml
---
description: Propose phases + per-phase issues for an epic; iterate via free-form chat until the developer approves; on approval, write the decomposition into the epic doc and call `generacy cockpit manifest init/sync`. Never writes the doc or invokes the CLI without approval.
arguments:
  - name: epic
    description: Epic reference (resolved via the shared resolver to a single epic doc)
    required: true
---
```

## Behavioral contract

### Invariants (MUST)

1. **Approval gates all mutation**: the command MUST NOT write the doc section or invoke the manifest CLI before the developer types `approve`.
2. **Stable markers, verbatim**: the section MUST be bounded by `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->` exactly. Any read or write that touches the section MUST use these strings byte-for-byte.
3. **First-run placement is end-of-file**: when the doc has no existing markers, the section is appended at literal EOF. No heuristic placement.
4. **In-place replacement on re-run**: when markers exist, the body between them is replaced; the markers' position in the doc is preserved.
5. **Sequential `P<n>` phase IDs**: phases are identified by `P1`, `P2`, …, sequential without gaps. Re-numbered on every re-draft.
6. **Grammar-conformant drafts only**: a proposal that fails to grammar-check against `contracts/breakdown-doc-section.contract.md` MUST NOT be presented. Re-draft until valid.
7. **Idempotent no-op re-run**: a re-run that produces a byte-identical body MUST result in an empty doc diff. The renderer MUST be deterministic.
8. **CLI invocation order**: the manifest CLI is invoked exactly once per run, AFTER the doc write, on the `approve` path only.
9. **Free-form edit affordance**: the `edit` path accepts natural-language feedback and re-drafts; it MUST always re-present the `approve / edit / reject` choice afterward.

### Forbidden behaviors (MUST NOT)

- MUST NOT pass the decomposition to the CLI via flags, stdin, or a temp file. The doc section is the only transport.
- MUST NOT scan for heading anchors (`## Phases`, etc.) to place the section on first run. EOF only.
- MUST NOT call the manifest CLI on the `reject` path.
- MUST NOT call the manifest CLI before the doc write completes.
- MUST NOT attempt to repair a doc with unmatched or duplicate markers — stop with a "fix manually" message.
- MUST NOT roll back the doc write if the manifest CLI fails — the doc is the source of truth, and the CLI is recoverable by direct re-invocation.
- MUST NOT include timestamps, machine IDs, or other non-deterministic content in the rendered section.

### Outputs

Terse status lines per phase transition (see `data-model.md` E5 for canonical examples). The proposal body itself is the only multi-line output. Exit code is `0` on the `Done ✓` path; non-zero on every stop path (reject, resolver fail, doc corrupt, CLI fail, draft grammar-check stuck).

## State diagram

```
                 ┌──────────────────────────────────────┐
                 │ Resolve <epic> → doc_path via #788   │
                 └─────────────────┬────────────────────┘
                                   ▼
                 ┌──────────────────────────────────────┐
                 │ Read doc; locate markers (if any)    │
                 └─────────────────┬────────────────────┘
                                   ▼
                          ┌────────┴────────┐
                          │                 │
              markers absent        markers present
                          │                 │
                          ▼                 ▼
                 ┌───────────────┐  ┌────────────────────┐
                 │ first-run     │  │ re-draft mode      │
                 │ (will append) │  │ (will in-place)    │
                 └───────┬───────┘  └─────────┬──────────┘
                         └────────┬───────────┘
                                  ▼
                       ┌──────────────────────┐
                       │ Draft proposal       │
                       │ (grammar-check)      │
                       └──────────┬───────────┘
                                  ▼
                       ┌──────────────────────┐
                       │ Present + ask        │◄────────┐
                       │ approve/edit/reject  │         │
                       └──┬─────────┬──────┬──┘         │
                          │         │      │            │
                       approve    edit   reject         │
                          │         │      │            │
                          │         │      ▼            │
                          │         │  Stopped:         │
                          │         │  rejected (exit)  │
                          │         │                   │
                          │         ▼                   │
                          │   Re-draft from feedback ───┘
                          ▼
                 ┌──────────────────────┐
                 │ Write section        │
                 │  (append OR replace) │
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐
                 │ Bash: manifest       │
                 │ init|sync <epic-ref> │
                 └──────────┬───────────┘
                            ▼
                       Done ✓ (exit 0)
                       (or Stopped: manifest CLI failed)
```

## Test scenarios (manual)

| Scenario | Expected outcome |
|----------|------------------|
| Epic doc with no existing section, developer approves first draft | Section appended at EOF; `Manifest: init`; `Done ✓`. |
| Same epic, re-run with no proposal change, developer approves | Section unchanged (byte-identical); `Manifest: sync` exits with "no changes"; `Done ✓`; doc diff is empty. |
| Re-run with new proposal (one more phase), developer approves | Section replaced in place between existing markers; `Manifest: sync`; `Done ✓`. |
| Developer types `edit` once with "merge phases 2 and 3" | Re-drafted proposal re-presented; on `approve`, behavior matches re-draft mode. |
| Developer types `reject` | `Stopped: rejected — no doc change, no CLI call`; exit non-zero; doc + manifest untouched. |
| Doc has start marker without end marker | `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running`; exit non-zero; no draft work performed. |
| Doc has duplicate start markers | Same as unmatched: stop with manual-fix message. |
| Resolver finds no epic doc | Usage-style error before any draft work. |
| Resolver finds multiple epic docs | Usage-style error with the matches listed. |
| Manifest CLI fails on `sync` | `Stopped: manifest CLI failed — <stderr first line>`; exit non-zero. Doc write is NOT rolled back. |
| `init` retry after `sync` reports "manifest not initialized" | Single retry with `init`; on success, `Manifest: init`, `Done ✓`. |
