# Contract: `tests/fixtures/help-snapshots/<verb>.txt` file format

Structural contract for the checked-in `--help` snapshot files that serve as the audit's source of truth for CLI-invocation argument-kind tokens (per Q1=A).

## File location

```
packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/<verb>.txt
```

One file per distinct `generacy cockpit <verb>` invoked by any file in `packages/claude-plugin-cockpit/commands/*.md`.

## File format

```
# captured from: generacy --version <X.Y.Z>
<VERBATIM stdout of `generacy cockpit <verb> --help`>
```

### Rules

- **First line** is the version-tag comment, verbatim: `# captured from: generacy --version <X.Y.Z>`. The `<X.Y.Z>` is the output of `generacy --version` at the moment of capture (e.g., `1.5.0-preview.42`, `2.0.0`).
- **Second line onward** is the byte-verbatim stdout of `generacy cockpit <verb> --help`. No reformatting, no truncation, no reordering.
- **ANSI codes**: suppressed at capture time (the refresh script runs the CLI with `NO_COLOR=1` or the CLI's equivalent). The snapshot file is plain ASCII/UTF-8 text.
- **Trailing newline**: preserved as emitted by the CLI. If the CLI's output ends without a trailing newline, so does the snapshot.
- **Line endings**: LF only (`\n`). CRLF is normalized at capture time by the refresh script.

## Purpose

The snapshot is the audit's **CLI contract of record**. The audit's parser reads the snapshot's usage line (the first non-comment, non-blank line typically starting with `Usage: `) and extracts the ordered list of positional argument-kind tokens (each `<...>` bracketed placeholder). The playbook invocation for the same verb is matched position-by-position against this list.

## Usage-line parsing contract

The audit's parser extracts positional argument tokens from the snapshot's usage line by:
1. Finding the line matching `^Usage:\s+generacy cockpit <verb>\s+(.*)$` (case-sensitive on `Usage:`; permissive on trailing whitespace).
2. Tokenizing the remainder into whitespace-separated tokens.
3. Filtering to tokens matching `^<[a-z][a-z0-9-]*>$` (angle-bracketed lowercase-kebab identifiers) — these are the positional argument-kind tokens.
4. Preserving order: `snapshotArgTokens[0]` is the first positional arg, `snapshotArgTokens[1]` is the second, etc.

**Non-positional tokens** (e.g., `[options]`, `--flag`, `-h`) are ignored by the positional-arg extractor.

### Example — `merge.txt`

Snapshot content:
```
# captured from: generacy --version 1.5.0-preview.42
Usage: generacy cockpit merge <issue> [options]

  Squash-merge the PR for <issue> iff it carries completed:validate...

Arguments:
  <issue>  Issue reference (owner/repo#N, #N, or bare integer). Required.
...
```

Parser output:
```typescript
{
  verb: "merge",
  version: "1.5.0-preview.42",
  usageArgTokens: ["<issue>"],
}
```

### Example — `queue.txt`

Snapshot content:
```
# captured from: generacy --version 1.5.0-preview.42
Usage: generacy cockpit queue <epic-ref> <phase> [options]
...
```

Parser output:
```typescript
{
  verb: "queue",
  version: "1.5.0-preview.42",
  usageArgTokens: ["<epic-ref>", "<phase>"],
}
```

## Refresh obligation

When the CLI's `--help` output changes:
1. Run `bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh` inside a cluster session.
2. The script regenerates every snapshot with the current CLI version tag.
3. Commit the resulting `git diff` alongside any playbook edits required by the new `--help` wording (audit passes green in the same commit).

**Sync-mismatch handling**: If the snapshot is refreshed to a new version but the playbook is not updated in the same commit, assertion 398-1 fails on the next test run with the specific mismatch. The failure is loud and actionable — the operator either edits the playbook to match the new snapshot OR reverts the snapshot refresh if the CLI change was accidental.

## Deletion protocol

When a verb is removed from all `commands/*.md` playbooks:
1. The audit's set-check (comparing `help-snapshots/*.txt` filenames to the distinct verbs found in `commands/*.md`) surfaces the discrepancy.
2. The operator manually deletes the corresponding `<verb>.txt` file.
3. Commit the deletion alongside the playbook edit that removed the verb.

The refresh script does NOT auto-delete stale snapshots — this is deliberate. Auto-deletion could mask an accidental playbook edit that removed a verb reference; requiring the operator to delete manually forces conscious acknowledgement.

## What the snapshot is NOT

- **Not documentation.** The snapshot is a build-time artifact for the audit; it's not intended for humans to read for CLI reference. That's `--help`'s job. If a reader wants to know what `generacy cockpit merge` does, they should run `--help`, not read the snapshot file.
- **Not a compatibility contract.** The snapshot is the CLI's contract *at the moment of capture*. A future CLI version may change `--help`'s wording; the audit fails on the next run; the snapshot is refreshed; the playbook is updated. There's no long-term compatibility guarantee — the snapshot is a point-in-time reference.
- **Not a source of truth for the CLI itself.** The CLI's source-code `--help` string is the source of truth; the snapshot is a captured copy for CI purposes.

## Verifier

**Static** — for each `<verb>.txt` file:
```bash
head -1 packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/<verb>.txt | grep -q '^# captured from: generacy --version '
```

**Set-check** — the set of `.txt` files matches the set of distinct verbs in `commands/*.md`:
```bash
# Left side: verbs in playbooks
grep -hoE 'generacy cockpit [a-z]+' packages/claude-plugin-cockpit/commands/*.md | awk '{print $3}' | sort -u
# Right side: snapshot filenames
ls packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/*.txt | xargs -n1 basename | sed 's/\.txt$//' | sort
# The two must be equal.
```

The `set-check` is implicit in the refresh script (which enumerates verbs from playbooks and writes exactly matching filenames); it is NOT an explicit assertion in `playbook-verification.test.ts` because a set-check failure at test time is a build-config error (missing snapshot for an invoked verb) that should be caught by the refresh script's enumeration step, not by the test suite.

## Failure modes

**Snapshot missing for a verb the playbook invokes**: assertion 398-1 fails with an error message indicating the missing snapshot. Fix: run the refresh script.

**Snapshot present for a verb no playbook invokes**: not a test failure, but a housekeeping surface. The `git diff` reviewer notices the orphan file; delete it in the next PR.

**Snapshot's version tag is stale relative to the CLI on `$PATH`**: not a test failure per se (the audit checks against the checked-in snapshot, not the live CLI). The staleness is visible in the version tag; if a smoke session reveals the playbook doesn't work against the current CLI, the fix is to refresh the snapshot and update the playbook.

**Snapshot's usage line is missing or malformed**: the parser's regex doesn't match; assertion 398-1 fails with a "usage line not found" error. This indicates the CLI's `--help` output has diverged from the expected `Usage: generacy cockpit <verb> ...` format; the audit's usage-line parser may need extension (uncommon).
