# Contract: `generacy cockpit manifest init/sync` CLI

**Feature**: 357-epic-generacy-ai-tetrad
**Consumes**: Issue G3.1 (the CLI verb itself)

The `/cockpit:breakdown` slash command shells out to `generacy cockpit manifest init <epic-ref>` or `generacy cockpit manifest sync <epic-ref>` after writing the bounded section to the epic doc. This contract codifies the invocation shape and exit semantics the slash command depends on. If G3.1 ships a different shape, this contract — and `breakdown.md` — must be updated to match.

## Invocation

```
generacy cockpit manifest init <epic-ref>
generacy cockpit manifest sync <epic-ref>
```

- `<epic-ref>`: an epic reference of the form returned by the shared resolver (#788). Typically `owner/repo#<n>` or a project-internal epic key.
- `init` is used when no manifest exists for `<epic-ref>` yet. `sync` is used when one already does.
- The CLI is the source of truth for "is there a manifest?" — the slash command does not maintain a local cache. If the slash command cannot tell, it MAY call `sync` first and fall back to `init` on a specific stderr signal (e.g., `manifest not initialized`).

### How the CLI finds the section

The CLI reads the epic doc identified by `<epic-ref>` (the resolver returns the path), then looks for the section bounded by the markers in `contracts/breakdown-doc-section.contract.md`. It parses the body using tetrad-development#790's grammar. If the markers are missing or the body fails to parse, the CLI exits non-zero with a specific stderr message; the slash command surfaces it verbatim.

## Output

| Stream | Content | Notes |
|--------|---------|-------|
| stdout | Human-readable summary | E.g., `manifest synced: 4 phases, 17 issues, 0 changes`. Passed through to the user's terse status report. |
| stderr | Diagnostic on non-zero exit | E.g., `manifest not initialized — run 'generacy cockpit manifest init <ref>' first`. |
| exit code | 0 = success; non-zero = failure | The slash command MUST treat any non-zero exit as a stop condition. |

### Exit-code semantics

| Exit code | Meaning | Slash command action |
|-----------|---------|----------------------|
| `0` | Manifest written/updated (or no-op on `sync`). | Emit `Manifest: <init|sync>` + stdout summary line; continue to `Done ✓`. |
| non-zero, stderr matches `manifest not initialized` | Initial `sync` failed because there's no manifest yet. | Retry with `init`. If `init` succeeds, continue; if it also fails, surface stderr verbatim and stop. |
| non-zero, other | Parse failure, write failure, network failure, auth failure, etc. | Surface stderr verbatim and stop with non-zero exit. Do NOT roll back the doc write. |

## Idempotency invariant

- `generacy cockpit manifest sync <epic-ref>` re-run against an unchanged section MUST exit `0` with a "no changes" summary and produce no manifest diff. The slash command's SC-002 (no-op re-run = empty diff everywhere) depends on this.
- `init` is one-shot: re-running `init` against an already-initialized manifest MUST exit non-zero (no silent re-init). The slash command relies on this to detect the "already initialized" state.

## Mutation scope

- The CLI writes to the manifest store (location is G3.1's responsibility — could be a sibling file in the epic doc's repo, a sidecar `.generacy/` dir, or a managed service). It does NOT modify the epic doc itself; the doc write is owned by the slash command.
- The CLI MUST NOT mutate the bounded section's bytes. If it needs to normalize (e.g., re-flow whitespace), it does so in its internal model, not by writing back to the doc — otherwise the slash command's "byte-identical body on no-op re-run" invariant breaks.

## Forward compatibility

- New subcommands (`manifest diff`, `manifest export`, …) are additive and do not affect this contract.
- New stdout fields are additive; the slash command treats stdout as opaque human-readable text and only acts on exit code.
- New stderr signals are NOT additive in a breaking sense: if G3.1 changes the "manifest not initialized" stderr text, the slash command's fall-back-to-`init` heuristic must be updated. Treat any change to that specific signal as a breaking change requiring coordination with #357.

## Out of scope

- `generacy cockpit manifest delete` / `manifest reset`: not consumed by this command. If the developer needs to start over, they can hand-edit (or delete) the section in the epic doc and re-run `/cockpit:breakdown`.
- `--dry-run` mode: not consumed by v1 of this command.
- JSON output mode: not consumed by v1. The slash command only consumes exit code and surfaces stdout verbatim.
