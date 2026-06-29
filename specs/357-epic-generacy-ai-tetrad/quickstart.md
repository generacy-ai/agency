# Quickstart: /cockpit:breakdown command

**Feature**: 357-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This quickstart covers two audiences:
1. **Implementers** — how to land the `breakdown.md` slash command in this repo.
2. **End users** — how to install and use `/cockpit:breakdown` once it ships.

---

## For implementers (landing the command)

### Prerequisites

- The `claude-plugin-cockpit` scaffold from #350 (A1.4) is landed (already on `develop`).
- Issue G3.1 (the `generacy cockpit manifest init/sync` CLI verb) is sufficiently scoped that the contract in `contracts/manifest-cli.contract.md` is accurate — or, if not, you treat the contract as the agreement and flag divergence to the user.
- tetrad-development#790 (the phase-decomposition grammar) is sufficiently scoped that the shape in `contracts/breakdown-doc-section.contract.md` is accurate — or you stub it and surface the dependency.
- Issue #788 (the shared resolver) has a documented invocation pattern that returns `{ epic_ref, doc_path, repo }` for an epic ref — or you stub one and surface the dependency.

### 1. Create the command file

```bash
touch packages/claude-plugin-cockpit/commands/breakdown.md
```

### 2. Author the frontmatter and prompt body

Frontmatter (use the shape from `contracts/slash-command.contract.md`):

```yaml
---
description: Propose phases + per-phase issues for an epic; iterate via free-form chat until the developer approves; on approval, write the decomposition into the epic doc and call `generacy cockpit manifest init/sync`. Never writes the doc or invokes the CLI without approval.
arguments:
  - name: epic
    description: Epic reference (resolved via the shared resolver to a single epic doc)
    required: true
---
```

Prompt body structure (mirrors `packages/claude-plugin-cockpit/commands/merge.md` and `clarify.md`):

1. **Parse arguments**: extract `epic` (positional, required). Reject empty input with a usage line.
2. **Resolve `epic`** via the #788 resolver → `{ epic_ref, doc_path, repo }`. On zero matches: `Stopped: no epic doc found for <epic>`. On multiple: `Stopped: <epic> resolved to multiple docs: <list> — specify one`.
3. **Read the epic doc** at `doc_path`. Locate the bounded section by searching for the exact strings `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->`.
   - **Both present, exactly once each**: capture the line range of the body for in-place replace.
   - **Both absent**: first-run mode (will append at EOF).
   - **Unmatched or duplicate**: stop with `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running`; do not draft.
4. **Draft a proposal**: emit ordered `P1`, `P2`, … phases each with title, one-sentence summary, and per-phase issue list. Grammar-check against `contracts/breakdown-doc-section.contract.md` before presenting; re-draft silently if shape is invalid.
5. **Present + iterate**:
   - Show the proposal as a markdown block.
   - Ask: `Approve, edit, or reject?`
   - On `approve`: continue to step 6.
   - On `edit`: read the developer's natural-language feedback; re-draft from feedback (re-numbering `P<n>` sequentially); re-present.
   - On `reject`: emit `Stopped: rejected — no doc change, no CLI call`; exit non-zero.
6. **Write the section**:
   - If markers were present, use `Edit` to replace the body between them (markers unchanged).
   - If markers were absent, append the full marker-wrapped section to EOF (use `Edit` with the doc's current trailing bytes as `old_string`, or read-then-write the doc with the section appended).
   - Emit `Wrote section (in-place replace)` or `Wrote section (appended at EOF)`.
7. **Invoke the manifest CLI** via Bash:

   ```bash
   generacy cockpit manifest sync <epic-ref>
   ```

   - On exit `0`: emit `Manifest: sync`; continue.
   - On exit non-zero with stderr matching `manifest not initialized`: retry with `init`:

     ```bash
     generacy cockpit manifest init <epic-ref>
     ```

     - On exit `0`: emit `Manifest: init`; continue.
     - On exit non-zero: emit `Stopped: manifest CLI failed — <stderr first line>`; exit non-zero. **Do not roll back the doc write.**
   - On any other non-zero exit: emit `Stopped: manifest CLI failed — <stderr first line>`; exit non-zero.
8. **Done**: emit `Done ✓` and exit `0`.

### 3. Validate

```bash
# Loader sanity: the file must be picked up by the cockpit namespace
ls packages/claude-plugin-cockpit/commands/breakdown.md

# Isolation check: no other files in the repo were modified
git status --porcelain | grep -v '^?? specs/357-' | grep -v 'packages/claude-plugin-cockpit/commands/breakdown.md'
# (should print nothing)
```

### 4. Smoke test (manual)

Install the plugin in a Claude Code environment, then run:

```
/cockpit:breakdown tetrad-development#85          # against an epic with no section → expect EOF append + Manifest: init
/cockpit:breakdown tetrad-development#85          # re-run with no proposal change → expect empty diff + Manifest: sync ("no changes")
/cockpit:breakdown tetrad-development#85          # re-run, then `edit` "add a P5 for cleanup" → expect re-draft + re-present
/cockpit:breakdown tetrad-development#85          # then `reject` → expect Stopped: rejected, no doc change
/cockpit:breakdown <epic-with-corrupt-markers>    # expect Stopped: doc has unmatched markers, no draft work
```

### 5. Commit

```bash
git add packages/claude-plugin-cockpit/commands/breakdown.md specs/357-epic-generacy-ai-tetrad
git commit -m "feat(cockpit): /cockpit:breakdown command for epic phase decomposition (#357)"
```

---

## For end users (using `/cockpit:breakdown`)

### Prerequisites

- The cockpit plugin is installed (see `packages/claude-plugin-cockpit/README.md`).
- The `generacy` CLI is installed and on PATH; `generacy cockpit manifest` runs without error.
- You have write access to the epic doc (typically in `generacy-ai/tetrad-development`).

### Basic usage

Propose phases + per-phase issues for an epic:

```
/cockpit:breakdown tetrad-development#85
```

The command will:
1. Resolve the epic to its doc.
2. Draft a phase-decomposition proposal (`P1`, `P2`, …, each with a per-phase issue list).
3. Show you the proposal and ask: `Approve, edit, or reject?`
4. On `approve`, write the proposal into a bounded section of the epic doc and call `generacy cockpit manifest sync` to materialize the manifest.

### Editing the proposal

Just say what you want changed in plain English:

```
edit: merge P2 and P3 into a single phase called "Core Verbs"
edit: split P1 so the scaffold and the resolver live in separate phases
edit: rename P4 to "Polish & Docs"
edit: add a P5 for cleanup work — single issue, deprecating the old autodev path
```

The assistant re-drafts and re-presents `Approve, edit, or reject?`. There's no separate edit mode to leave; you can iterate as many times as you like.

### Rejecting

If the proposal is far enough off that re-drafting isn't worth it:

```
reject
```

The command exits without touching the doc or the manifest. Re-run later when you have fresh context.

### Re-running on the same epic

The command is idempotent. Running it again with no proposal change produces a byte-identical doc section and a no-op `manifest sync`. Running it again with a new draft replaces the section in place between the stable markers (the markers stay where you left them — the section's position in the doc is preserved across re-runs).

---

## Troubleshooting

### `Stopped: no epic doc found for <epic>`
The resolver couldn't find a doc for that ref. Use a more specific reference (e.g., explicit `owner/repo#number`) or check the resolver docs (#788).

### `Stopped: <epic> resolved to multiple docs: …`
Same fix: disambiguate the ref.

### `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running`
Open the epic doc and ensure exactly one pair of `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->` lines exist (or none, to trigger first-run mode). The command will NOT attempt to repair the doc.

### `Stopped: manifest CLI failed — <stderr>`
The doc write succeeded but the manifest CLI did not. The doc is your source of truth; the manifest is recoverable. Run `generacy cockpit manifest sync <epic-ref>` directly to retry — or re-run `/cockpit:breakdown` to get back to a known-good state.

### The proposal looks fine but I want to move the section elsewhere in the doc
After the first run, the section's markers are deterministic. Cut-and-paste the entire bounded section (including both marker lines) to wherever you want it in the doc. Subsequent runs will replace in place at the new location.

### Re-running produces a non-empty diff even though I didn't change anything
The renderer is deterministic by contract — no timestamps, no machine IDs. If you see a non-empty diff on a true no-op re-run, that's a bug; file it against #357 with the diff attached.

### Free-form `edit` keeps producing the same wrong draft
Be more specific in the feedback. The assistant re-drafts from your most recent message; vague instructions yield vague edits. If you're stuck, `reject` and start over with a sharper draft instruction.
